// Turns a concept selection into concrete questions (#600).
//
// Reads each concept's approved question templates, renders them with the
// existing template renderer (#486), and attaches the artwork variant chosen by
// `pickVariant`. Nothing here is random: the same concepts, count and seed
// always give the same questions and the same artwork, so a re-issued sheet
// does not change under a child's pencil and ICR scanning stays aligned.
//
// `questionsPerConcept` is always the caller's number. How many questions a
// concept needs is an open decision, and it plugs in here without a code change.

import { dbStore } from '../db';
import { CURRICULUM_MAPPING } from '../config/curriculumMap';
import { pickVariant, listThemes, SvgThemeVariant } from '../svgAssetCatalog';
import { themeSupportsCircling } from '../config/worksheetLayoutRules';
import {
  RenderedQuestion,
  answerHint,
  filterEligibleTemplates,
  renderTemplateQuestion,
} from './questionTemplateRenderer';

export const MAX_CONCEPTS_PER_BATCH = 20;
export const MAX_QUESTIONS_PER_CONCEPT = 50;
/** Most copies of one picture printed for a counting question. */
export const MAX_PRINTED_PICTURES = 20;

export interface ResolvedQuestion extends RenderedQuestion {
  /** `<conceptId>_Q<n>`, numbered within the concept starting at 1. */
  questionId: string;
  conceptId: string;
  templateId: string;
  /** The artwork file for `svgAsset` (the theme id), chosen from the seed. */
  svgVariant?: SvgThemeVariant;
  /**
   * For a counting question: how many copies of the artwork to print, which is
   * the answer. The question text only has asterisks, so without this the
   * picture and the number would not agree.
   */
  svgCount?: number;
  /** The template's answer type, which decides how much answer space is printed. */
  answerType?: string | null;
  /** True when the child circles the picture and its theme supports circling: the sheet then leaves room around each object. */
  circleAnswer?: boolean;
}

export type ConceptShortfall = 'unknown-concept' | 'no-eligible-template' | 'fewer-than-requested';

export interface ResolvedConcept {
  conceptId: string;
  requested: number;
  questions: ResolvedQuestion[];
  /** Set when fewer than `requested` questions could be made, with the reason. */
  shortfall?: ConceptShortfall;
}

export interface ResolvedWorksheetContent {
  /** One entry per distinct concept, in the order the caller listed them. */
  concepts: ResolvedConcept[];
  /** Every question of every concept, in the same order. */
  questions: ResolvedQuestion[];
}

const KNOWN_CONCEPTS = new Set(Object.values(CURRICULUM_MAPPING).map(c => c.conceptId));

/** Same inputs, same seed: a stable default so repeated calls agree. */
function defaultSeed(conceptIds: string[], questionsPerConcept: number): string {
  return `worksheet:${questionsPerConcept}:${conceptIds.join(',')}`;
}

function countedPictures(family: string, rendered: RenderedQuestion): number | undefined {
  if (family !== 'counting' || !rendered.svgAsset) return undefined;
  const n = Number(rendered.answer);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PRINTED_PICTURES ? n : undefined;
}

export async function resolveWorksheetContent(
  conceptIds: string[],
  questionsPerConcept: number,
  opts: { seed?: string; countsByConcept?: Record<string, number> } = {},
): Promise<ResolvedWorksheetContent> {
  if (!Array.isArray(conceptIds) || conceptIds.length === 0) {
    throw new RangeError('conceptIds must be a non-empty list.');
  }
  if (!conceptIds.every(c => typeof c === 'string' && c.trim().length > 0 && c.trim().length <= 20)) {
    throw new RangeError('Every conceptId must be a short, non-empty string.');
  }
  if (!Number.isInteger(questionsPerConcept) || questionsPerConcept < 1 || questionsPerConcept > MAX_QUESTIONS_PER_CONCEPT) {
    throw new RangeError(`questionsPerConcept must be a whole number from 1 to ${MAX_QUESTIONS_PER_CONCEPT}.`);
  }
  const distinct = [...new Set(conceptIds.map(c => c.trim()))];
  if (distinct.length > MAX_CONCEPTS_PER_BATCH) {
    throw new RangeError(`At most ${MAX_CONCEPTS_PER_BATCH} concepts per worksheet.`);
  }
  const seed = opts.seed ?? defaultSeed(distinct, questionsPerConcept);

  const concepts: ResolvedConcept[] = [];
  for (const conceptId of distinct) {
    // A paper type fixes the total, so its concepts can need different counts.
    const want = opts.countsByConcept?.[conceptId] ?? questionsPerConcept;
    if (!KNOWN_CONCEPTS.has(conceptId)) {
      concepts.push({ conceptId, requested: want, questions: [], shortfall: 'unknown-concept' });
      continue;
    }
    const eligible = filterEligibleTemplates(await dbStore.getQuestionTemplatesByConcept(conceptId));
    if (eligible.length === 0) {
      concepts.push({ conceptId, requested: want, questions: [], shortfall: 'no-eligible-template' });
      continue;
    }

    const questions: ResolvedQuestion[] = [];
    const seen = new Set<string>();
    // A template can make many different questions, but not without limit
    // (a "which is more, 4 or 7" template has few distinct instances), so
    // repeats are skipped and the search stops after a bounded number of tries.
    const maxTries = want * 6;
    for (let i = 0; i < maxTries && questions.length < want; i++) {
      const template = eligible[i % eligible.length];
      const instanceSeed = `${seed}:${conceptId}:${i}`;
      const rendered = renderTemplateQuestion(template, instanceSeed);
      if (!rendered) continue;
      const fingerprint = `${rendered.question}|${rendered.answer}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      questions.push({
        ...rendered,
        questionId: `${conceptId}_Q${questions.length + 1}`,
        conceptId,
        templateId: template.id,
        svgVariant: rendered.svgAsset ? pickVariant(rendered.svgAsset, instanceSeed) : undefined,
        svgCount: countedPictures(template.questionFamily, rendered),
        answerType: template.answerType ?? null,
        circleAnswer: Boolean(rendered.svgAsset)
          && answerHint(template.generationIntent) === 'Circle your answer'
          && themeSupportsCircling(listThemes().find(t => t.id === rendered.svgAsset)?.supportedAnswerShapes),
      });
    }
    concepts.push({
      conceptId,
      requested: want,
      questions,
      shortfall: questions.length < want ? 'fewer-than-requested' : undefined,
    });
  }
  return { concepts, questions: concepts.flatMap(c => c.questions) };
}

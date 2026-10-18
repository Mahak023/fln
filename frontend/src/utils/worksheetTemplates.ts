// What the Worksheet Templates panel shows (#604): how many questions each
// concept can print, counted by the same rules the backend uses to pick
// questions for a sheet (not deleted, approved, not observation-only).
import type { QuestionTemplate } from '../types';

type ListedTemplate = QuestionTemplate & { status?: string; deletedAt?: string | null };

export interface ConceptTemplateSummary {
  conceptId: string;
  levelNumber: number;
  levelName: string;
  /** Live templates: not deleted. */
  total: number;
  /** Of those, the ones a printed sheet can use. */
  printable: number;
  /** Live templates held back, with the reason counted separately. */
  pending: number;
  observedOnly: number;
}

export function isPrintable(t: ListedTemplate): boolean {
  return !t.deletedAt && (t.status ?? 'approved') === 'approved' && t.assessmentMode !== 'observed';
}

/** One row per concept, in level order. Deleted templates are ignored. */
export function summarizeTemplatesByConcept(templates: ListedTemplate[]): ConceptTemplateSummary[] {
  const byConcept = new Map<string, ConceptTemplateSummary>();
  for (const t of templates) {
    if (t.deletedAt) continue;
    let row = byConcept.get(t.conceptId);
    if (!row) {
      row = { conceptId: t.conceptId, levelNumber: t.levelNumber, levelName: t.levelName, total: 0, printable: 0, pending: 0, observedOnly: 0 };
      byConcept.set(t.conceptId, row);
    }
    row.total += 1;
    if (isPrintable(t)) row.printable += 1;
    else if ((t.status ?? 'approved') !== 'approved') row.pending += 1;
    else if (t.assessmentMode === 'observed') row.observedOnly += 1;
  }
  return [...byConcept.values()].sort((a, b) => a.levelNumber - b.levelNumber || a.conceptId.localeCompare(b.conceptId));
}

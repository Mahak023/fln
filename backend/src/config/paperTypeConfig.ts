/**
 * Fixed shape of each kind of paper (#593): how many questions one paper has.
 * Kept on the backend so the frontend reads it on "Generate" instead of
 * carrying its own numbers.
 *
 * No level is fixed here. Every question carries the level of the concept it
 * tests, and the report built from a marked paper says, per level, what the
 * child has and has not shown. Which concepts a paper draws from is chosen
 * when it is generated; this file only says how many questions it holds.
 *
 * The counts are placeholders inside the 8 to 10 range the Balvatika plan
 * gives; the real figures are a pedagogy decision and change only here. (The
 * research document sizes a full diagnostic by its apex set, 28 to 38
 * questions; that figure is `apexConcepts()` in competencyPrerequisites.ts and
 * is a separate decision.)
 */
export type PaperType = 'diagnostic' | 'midline' | 'endline' | 'personalized';

export interface PaperTypeConfig {
  paperType: PaperType;
  questionCount: number;
  /** Only questions from approved templates may be drawn (#451 gate). */
  approvedTemplatesOnly: boolean;
}

export const PAPER_TYPE_CONFIG: Readonly<Record<PaperType, PaperTypeConfig>> = {
  diagnostic:   { paperType: 'diagnostic',   questionCount: 10, approvedTemplatesOnly: true },
  midline:      { paperType: 'midline',      questionCount: 10, approvedTemplatesOnly: true },
  endline:      { paperType: 'endline',      questionCount: 10, approvedTemplatesOnly: true },
  personalized: { paperType: 'personalized', questionCount: 8,  approvedTemplatesOnly: true },
};

export function getPaperTypeConfig(type: string): PaperTypeConfig | undefined {
  return Object.prototype.hasOwnProperty.call(PAPER_TYPE_CONFIG, type)
    ? PAPER_TYPE_CONFIG[type as PaperType]
    : undefined;
}

/**
 * Split `total` questions over `parts` concepts as evenly as possible, the
 * first concepts taking the remainder: 10 over 3 gives [4, 3, 3]. The result
 * always sums to `total`; `parts` has to be between 1 and `total`.
 */
export function spreadQuestionCount(total: number, parts: number): number[] {
  if (!Number.isInteger(total) || !Number.isInteger(parts) || parts < 1 || parts > total) {
    throw new RangeError(`Cannot spread ${total} questions over ${parts} concepts.`);
  }
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

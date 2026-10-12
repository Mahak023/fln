// Mirrors QUESTION_FAMILIES in backend/src/types/questionTemplateParams.ts. The
// frontend cannot import backend files, so questionFamily.test.ts fails if the
// two lists ever drift apart.
export const QUESTION_FAMILIES = [
  'counting', 'operation', 'shape', 'pattern', 'comparison',
  'classification', 'sequencing', 'vocabulary', 'calendar', 'reasoning',
] as const;

export type QuestionFamily = (typeof QUESTION_FAMILIES)[number];

export const QUESTION_FAMILY_LABELS: Record<QuestionFamily, string> = {
  counting: 'Counting a picture',
  operation: 'Number operation',
  shape: 'Shape',
  pattern: 'Pattern',
  comparison: 'Comparison',
  classification: 'Classification',
  sequencing: 'Sequencing',
  vocabulary: 'Vocabulary',
  calendar: 'Calendar',
  reasoning: 'Reasoning',
};

export function isQuestionFamily(value: unknown): value is QuestionFamily {
  return typeof value === 'string' && (QUESTION_FAMILIES as readonly string[]).includes(value);
}

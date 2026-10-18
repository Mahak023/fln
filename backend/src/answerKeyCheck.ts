/**
 * A stored answer key has to cover the paper that was printed. If it does not,
 * a scan has nothing to compare most answers with and the score is wrong
 * without anyone being told (FLN #762). The check runs when the key is stored,
 * so an incomplete key is refused then rather than found at grading time.
 */
export interface AnswerKeyCounts {
  printedFields: number;
  questions: number;
  answerKey: number;
  answerRegions: number;
}

export function describeAnswerKey(key: { masterJson?: any; questions?: any[]; answerKey?: any[]; answerRegions?: any[] }): AnswerKeyCounts {
  return {
    printedFields: key.masterJson?.sets?.[0]?.questions?.length ?? 0,
    questions: key.questions?.length ?? 0,
    answerKey: key.answerKey?.length ?? 0,
    answerRegions: key.answerRegions?.length ?? 0,
  };
}

/** A key is usable when it has questions, an answer for each, and a region for each answer. */
export function answerKeyProblem(c: AnswerKeyCounts): string | null {
  if (c.questions === 0) return 'The stored key has no questions.';
  if (c.answerKey === 0) return 'The stored key has no answers.';
  // Fewer regions than answers is the known "unmapped question" case (a
  // matching line or an ordering has no single box; paperGenerator logs it).
  // More regions than answers means the two lists came from different papers.
  if (c.answerRegions > c.answerKey) {
    return `answerRegions (${c.answerRegions}) are more than answerKey (${c.answerKey}).`;
  }
  if (c.printedFields > 0 && c.answerKey < c.printedFields) {
    return `The paper has ${c.printedFields} answer fields but the key has ${c.answerKey}.`;
  }
  return null;
}

/**
 * The answer-key object inside a rendered sheet's `masterJson`. Class 1 and 2
 * keep `sections` at the top (Class 1 a `questions` object); Class 3 wraps one set as `sets[0]` (still with
 * `sections`); Class 4 wraps `sets[0]` with a flat `questions` list. Reading
 * only `sections` made a Class 4 sheet look empty and the generator then
 * stored a one-question stub (FLN #762).
 */
export function keyRootOf(masterJson: any): any | null {
  if (!masterJson || typeof masterJson !== 'object') return null;
  if (Array.isArray(masterJson.sections) || (masterJson.questions && typeof masterJson.questions === 'object')) return masterJson;
  const first = Array.isArray(masterJson.sets) ? masterJson.sets[0] : null;
  return first && typeof first === 'object' ? first : null;
}

export interface FlatKeyQuestion {
  question_id: string;
  question: string;
  answer: string;
  topic: string;
}

const answerText = (a: any): string =>
  Array.isArray(a) || (a && typeof a === 'object') ? JSON.stringify(a) : String(a ?? '');

/**
 * Questions of a key whose `questions` is either a flat list (Class 4, one
 * entry per answer field) or an object keyed by question id (Class 1, whose
 * answers can be structured, for example a matching, and are kept as JSON).
 */
export function flatKeyQuestions(root: any): FlatKeyQuestion[] {
  if (!root || !root.questions || typeof root.questions !== 'object') return [];
  if (!Array.isArray(root.questions)) {
    return Object.entries(root.questions).map(([id, q]: [string, any]) => ({
      question_id: id,
      question: String(q?.question ?? id),
      answer: answerText(q?.expected_answer ?? q?.icr?.expected ?? ''),
      topic: String(q?.type ?? 'Unclassified'),
    }));
  }
  const out: FlatKeyQuestion[] = [];
  for (const q of root.questions) {
    const id = String(q?.qid ?? q?.question_id ?? '').trim();
    if (!id) continue;
    const answer = q.correct_answer ?? q.icr?.evaluation?.expected ?? '';
    out.push({
      question_id: id,
      question: String(q.label ?? q.section ?? id),
      answer: answerText(answer),
      topic: String(q.section ?? 'Unclassified'),
    });
  }
  return out;
}

// A student's question-level history, rebuilt from their evaluation reports.
//
// Issues #613, #614, #615. Nothing here writes data; it only reads the
// evaluation reports and the worksheets behind them.
//
// Named `StudentAttempt` (not `AttemptRecord`) because `AttemptRecord` in db.ts
// is the evidence schema of #479, a different thing.

import { dbStore, Question } from './db';
import { CURRICULUM_MAPPING } from './config/curriculumMap';

export type ConceptSource = 'question' | 'questionId';

export interface StudentAttempt {
  /**
   * The sitting this attempt belongs to. For a report whose worksheet can be
   * found it is the worksheet id. Diagnostic reports are saved with the
   * literal worksheetId 'diagnostic', which is shared by every diagnostic the
   * student ever took, so those get `diagnostic#<report id>`: one sitting per
   * report, never merged.
   */
  sitting: string;
  /** The evaluation report this attempt came from. */
  reportId: string;
  timestamp: string;
  questionId: string;
  /** Full question, when the worksheet that contained it can be found. */
  question?: Question;
  /** From the question when known, otherwise read from the question id. */
  conceptId?: string;
  conceptSource?: ConceptSource;
  submittedAnswer: string;
  isCorrect: boolean;
}

const KNOWN_CONCEPTS = new Set(Object.values(CURRICULUM_MAPPING).map(c => c.conceptId));

/**
 * Concept encoded in the three question id formats the platform produces:
 *   "S3.4_Q1"   concept based generator and template renderer
 *   "L19.0_Q1"  level based generator (level 19 -> its concept)
 *   "Q_L91_1"   question bank rows
 * Returns undefined for anything else, rather than guessing.
 */
export function conceptIdFromQuestionId(questionId: string): string | undefined {
  const byConcept = /^(S\d+\.\d+)_/.exec(questionId);
  if (byConcept) return KNOWN_CONCEPTS.has(byConcept[1]) ? byConcept[1] : undefined;
  const byLevel = /^L(\d+)\.\d+_/.exec(questionId) ?? /^Q_L(\d+)_/.exec(questionId);
  if (byLevel) return CURRICULUM_MAPPING[Number(byLevel[1])]?.conceptId;
  return undefined;
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Every question a student has answered, oldest first, one entry per question
 * result of each evaluation report, tagged with its sitting.
 */
export async function getAttemptHistoryForStudent(studentId: string): Promise<StudentAttempt[]> {
  const reports = (await dbStore.getEvaluationReports({ studentIds: [studentId] }))
    .filter(r => r.studentId === studentId)
    .map((report, index) => ({ report, index }))
    .sort((a, b) => timeOf(a.report.timestamp) - timeOf(b.report.timestamp) || a.index - b.index)
    .map(x => x.report);
  if (reports.length === 0) return [];

  const worksheets = await dbStore.getWorksheetsByIds([...new Set(reports.map(r => r.worksheetId))]);
  const questionsByWorksheet = new Map(
    worksheets.map(w => [w.id, new Map((w.questions ?? []).map(q => [q.question_id, q] as const))] as const),
  );

  const attempts: StudentAttempt[] = [];
  for (const report of reports) {
    const known = questionsByWorksheet.get(report.worksheetId);
    const sitting = known ? report.worksheetId : `${report.worksheetId}#${report.id}`;
    for (const qr of report.questionResults ?? []) {
      const question = known?.get(qr.questionId);
      const fromQuestion = question?.conceptId;
      const fromId = fromQuestion ? undefined : conceptIdFromQuestionId(qr.questionId);
      attempts.push({
        sitting,
        reportId: report.id,
        timestamp: report.timestamp,
        questionId: qr.questionId,
        question,
        conceptId: fromQuestion ?? fromId,
        conceptSource: fromQuestion ? 'question' : fromId ? 'questionId' : undefined,
        submittedAnswer: qr.submittedAnswer,
        isCorrect: qr.isCorrect,
      });
    }
  }
  return attempts;
}

/** Each concept the student has been asked about, once, in the order first seen. */
export async function getDistinctConceptIds(studentId: string): Promise<string[]> {
  const attempts = await getAttemptHistoryForStudent(studentId);
  const seen = new Set<string>();
  for (const a of attempts) if (a.conceptId) seen.add(a.conceptId);
  return [...seen];
}

/**
 * The student's attempts on one concept, oldest first. With `sameSitting`,
 * only the attempts of the most recent sitting on that concept.
 */
export async function getQuestionAttempts(
  studentId: string,
  conceptId: string,
  sameSitting: boolean,
): Promise<StudentAttempt[]> {
  const all = (await getAttemptHistoryForStudent(studentId)).filter(a => a.conceptId === conceptId);
  if (!sameSitting || all.length === 0) return all;
  const latest = all[all.length - 1].sitting;
  return all.filter(a => a.sitting === latest);
}

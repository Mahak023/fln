import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate DB from the real repository data.
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fln-student-history-test-'));
fs.mkdirSync(path.join(scratchDir, 'data'), { recursive: true });
process.chdir(scratchDir);
delete process.env.MONGODB_URI;
process.env.NODE_ENV = 'test';

const { dbStore } = await import('../src/db');
const { CURRICULUM_MAPPING } = await import('../src/config/curriculumMap');
const {
  conceptIdFromQuestionId,
  getAttemptHistoryForStudent,
  getDistinctConceptIds,
  getQuestionAttempts,
} = await import('../src/studentHistory');

const q = (id: string, conceptId?: string) => ({
  question_id: id, question: `text of ${id}`, answer: '1', answer_type: 'number',
  topic: 'Number', subtopic: 'x', difficulty: 'easy', source_level: 19, conceptId,
}) as any;
const result = (questionId: string, isCorrect: boolean) =>
  ({ questionId, question: `text of ${questionId}`, correctAnswer: '1', submittedAnswer: isCorrect ? '1' : '2', isCorrect });
const report = (id: string, studentId: string, worksheetId: string, timestamp: string, ids: [string, boolean][]) =>
  ({ id, studentId, worksheetId, timestamp, score: 0, totalQuestions: ids.length,
     questionResults: ids.map(([i, ok]) => result(i, ok)) }) as any;

const LEVEL19 = CURRICULUM_MAPPING[19].conceptId;
const LEVEL91 = CURRICULUM_MAPPING[91].conceptId;

before(async () => {
  await dbStore.init();
  // Two real worksheets. Reports are added newest first on purpose.
  await dbStore.addWorksheet({ id: 'WS_B', questions: [q('b1', 'S3.4'), q('b2', 'S3.5')] } as any);
  await dbStore.addWorksheet({ id: 'WS_A', questions: [q('a1', 'S3.4'), q('a2', 'S3.4'), q('a3', 'S3.1')] } as any);
  await dbStore.addEvaluationReport(report('r_B', 'stu1', 'WS_B', '2026-06-01T09:00:00Z', [['b1', false], ['b2', true]]));
  await dbStore.addEvaluationReport(report('r_A', 'stu1', 'WS_A', '2026-01-01T09:00:00Z', [['a1', true], ['a2', false], ['a3', true]]));
  // Diagnostics use the literal worksheetId 'diagnostic' and have no worksheet behind them.
  await dbStore.addEvaluationReport(report('r_D1', 'stu2', 'diagnostic', '2026-02-01T09:00:00Z', [['S3.4_Q1', false], ['L19.0_Q2', true], ['Q_L91_1', true], ['mystery', false]]));
  await dbStore.addEvaluationReport(report('r_D2', 'stu2', 'diagnostic', '2026-08-01T09:00:00Z', [['S3.4_Q1', true], ['S3.4_Q2', true]]));
  // A report whose worksheet was deleted, and a report with no question results.
  await dbStore.addEvaluationReport(report('r_gone', 'stu3', 'WS_DELETED', '2026-03-01T09:00:00Z', [['g1', true]]));
  await dbStore.addEvaluationReport({ id: 'r_empty', studentId: 'stu4', worksheetId: 'WS_A', timestamp: '2026-03-01T09:00:00Z', score: 0, totalQuestions: 0 } as any);
});

test('#613: one attempt per question result, oldest sitting first, tagged with its worksheet', async () => {
  const attempts = await getAttemptHistoryForStudent('stu1');
  assert.equal(attempts.length, 5);
  assert.deepEqual(attempts.map(a => a.questionId), ['a1', 'a2', 'a3', 'b1', 'b2']);
  assert.deepEqual([...new Set(attempts.map(a => a.sitting))], ['WS_A', 'WS_B']);
  assert.equal(attempts[0].question?.question, 'text of a1', 'full Question resolved from the worksheet');
  assert.equal(attempts[0].conceptId, 'S3.4');
  assert.equal(attempts[0].conceptSource, 'question');
  assert.equal(attempts[1].isCorrect, false);
  assert.equal(attempts[1].submittedAnswer, '2');
});

test('#613: only the asked student, and nothing for a student with no reports', async () => {
  assert.ok((await getAttemptHistoryForStudent('stu1')).every(a => ['WS_A', 'WS_B'].includes(a.sitting)));
  assert.deepEqual(await getAttemptHistoryForStudent('nobody'), []);
  assert.deepEqual(await getAttemptHistoryForStudent('stu4'), [], 'a report without question results gives no attempts');
});

test('#613: diagnostic reports each get their own sitting and the concept is read from the question id', async () => {
  const attempts = await getAttemptHistoryForStudent('stu2');
  assert.deepEqual([...new Set(attempts.map(a => a.sitting))], ['diagnostic#r_D1', 'diagnostic#r_D2']);
  const byId = Object.fromEntries(attempts.slice(0, 4).map(a => [a.questionId, a]));
  assert.equal(byId['S3.4_Q1'].conceptId, 'S3.4');
  assert.equal(byId['L19.0_Q2'].conceptId, LEVEL19);
  assert.equal(byId['Q_L91_1'].conceptId, LEVEL91);
  assert.equal(byId['mystery'].conceptId, undefined, 'an id we cannot read is left unknown, not guessed');
  assert.equal(byId['mystery'].conceptSource, undefined);
  assert.equal(byId['S3.4_Q1'].conceptSource, 'questionId');
  assert.equal(byId['S3.4_Q1'].question, undefined);
});

test('#613: a deleted worksheet does not lose the attempt', async () => {
  const attempts = await getAttemptHistoryForStudent('stu3');
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].question, undefined);
  assert.equal(attempts[0].sitting, 'WS_DELETED#r_gone');
});

test('conceptIdFromQuestionId: the three id formats, and nothing else', () => {
  assert.equal(conceptIdFromQuestionId('S3.4_Q7'), 'S3.4');
  assert.equal(conceptIdFromQuestionId('S99.99_Q1'), undefined, 'a concept that is not in the curriculum');
  assert.equal(conceptIdFromQuestionId('L19.2_Q3'), LEVEL19);
  assert.equal(conceptIdFromQuestionId('L9999.0_Q1'), undefined);
  assert.equal(conceptIdFromQuestionId('Q_L91_12'), LEVEL91);
  for (const bad of ['', 'Q1', 'q_1', 'S3.4', 'x_S3.4_Q1']) assert.equal(conceptIdFromQuestionId(bad), undefined);
});

test('#614: each concept once, unknown concepts dropped', async () => {
  assert.deepEqual((await getDistinctConceptIds('stu1')).sort(), ['S3.1', 'S3.4', 'S3.5']);
  const stu2 = await getDistinctConceptIds('stu2');
  assert.equal(new Set(stu2).size, stu2.length);
  assert.deepEqual(stu2.sort(), [...new Set(['S3.4', LEVEL19, LEVEL91])].sort());
  assert.deepEqual(await getDistinctConceptIds('stu3'), []);
});

test('#615: all attempts on a concept, or only the latest sitting', async () => {
  const all = await getQuestionAttempts('stu1', 'S3.4', false);
  assert.deepEqual(all.map(a => a.questionId), ['a1', 'a2', 'b1']);
  const latest = await getQuestionAttempts('stu1', 'S3.4', true);
  assert.deepEqual(latest.map(a => a.questionId), ['b1']);
  assert.deepEqual(await getQuestionAttempts('stu1', 'S9.9', false), []);
  assert.deepEqual(await getQuestionAttempts('stu1', 'S9.9', true), []);
});

test('#615: two diagnostics a half year apart are not merged into one sitting', async () => {
  const latest = await getQuestionAttempts('stu2', 'S3.4', true);
  assert.deepEqual(latest.map(a => `${a.sitting}:${a.questionId}`), ['diagnostic#r_D2:S3.4_Q1', 'diagnostic#r_D2:S3.4_Q2']);
  assert.equal((await getQuestionAttempts('stu2', 'S3.4', false)).length, 3);
});

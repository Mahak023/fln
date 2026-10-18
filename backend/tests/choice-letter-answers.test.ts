import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.GEMINI_API_KEY;
process.env.NODE_ENV = 'test';

const { matchesChoiceLetter } = await import('../src/answerMatching');
const { evaluateAIDiagnostic, evaluateAIWorksheet } = await import('../src/gemini');

const mcq = { answer_type: 'choice', choices: ['3', '5', '7', '9'], answer: '7' };

test('a letter naming the correct option matches', () => {
  for (const s of ['C', 'c', 'c.', '(C)', ' c ', 'c)']) {
    assert.equal(matchesChoiceLetter(s, mcq), true, s);
  }
});

test('a wrong letter, junk, or a non-choice question does not match', () => {
  for (const s of ['A', 'b', 'd', 'e', 'cc', '', null, undefined, 'seven']) {
    assert.equal(matchesChoiceLetter(s, mcq), false, String(s));
  }
  assert.equal(matchesChoiceLetter('c', { answer_type: 'number', choices: mcq.choices, answer: '7' }), false);
  assert.equal(matchesChoiceLetter('c', { answer_type: 'choice', answer: '7' }), false);
  assert.equal(matchesChoiceLetter('d', { answer_type: 'choice', choices: ['1', '2', '3'], answer: '3' }), false);
});

test('the fourth option can be the answer', () => {
  assert.equal(matchesChoiceLetter('D', { answer_type: 'choice', choices: ['1', '2', '3', '4'], answer: '4' }), true);
});

test('numeric choices are compared by value', () => {
  assert.equal(matchesChoiceLetter('b', { answer_type: 'choice', choices: ['03', '05'], answer: '5' }), true);
});

const qs = [
  { question_id: 'S3.1_Q1', question: 'Pick 7', answer: '7', answer_type: 'choice', choices: ['3', '5', '7', '9'], source_level: 1, topic: 't' },
  { question_id: 'S3.1_Q2', question: 'Pick 5', answer: '5', answer_type: 'choice', choices: ['3', '5', '7', '9'], source_level: 1, topic: 't' },
] as any[];

test('fallback diagnostic grader accepts letters and option text alike', async () => {
  const letters = await evaluateAIDiagnostic('A', qs, { 'S3.1_Q1': 'C', 'S3.1_Q2': 'b' } as any);
  const text = await evaluateAIDiagnostic('A', qs, { 'S3.1_Q1': '7', 'S3.1_Q2': '5' } as any);
  const wrong = await evaluateAIDiagnostic('A', qs, { 'S3.1_Q1': 'A', 'S3.1_Q2': 'A' } as any);
  assert.equal(letters.score, text.score);
  assert.ok(letters.score > wrong.score);
});

test('fallback worksheet grader accepts letters', async () => {
  const letters = await evaluateAIWorksheet('A', qs, { 'S3.1_Q1': 'C', 'S3.1_Q2': 'B' } as any, 1);
  const wrong = await evaluateAIWorksheet('A', qs, { 'S3.1_Q1': 'A', 'S3.1_Q2': 'A' } as any, 1);
  assert.notDeepEqual(letters, wrong);
});

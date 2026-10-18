import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAnswerKey, answerKeyProblem, keyRootOf, flatKeyQuestions } from '../src/answerKeyCheck';

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ question_id: `q${i + 1}`, answer: String(i) }));

test('the stub key from the issue (1 question, 38 printed fields) is refused', () => {
  const c = describeAnswerKey({
    masterJson: { sets: [{ questions: items(38) }] },
    questions: items(1), answerKey: items(1), answerRegions: [],
  });
  assert.deepEqual(c, { printedFields: 38, questions: 1, answerKey: 1, answerRegions: 0 });
  assert.match(answerKeyProblem(c)!, /38 answer fields but the key has 1/);
});

test('a key with no questions or no answers is refused', () => {
  assert.match(answerKeyProblem({ printedFields: 0, questions: 0, answerKey: 0, answerRegions: 0 })!, /no questions/);
  assert.match(answerKeyProblem({ printedFields: 0, questions: 3, answerKey: 0, answerRegions: 0 })!, /no answers/);
});

test('more regions than answers is refused, fewer is the known unmapped case and is accepted', () => {
  assert.match(answerKeyProblem({ printedFields: 0, questions: 10, answerKey: 10, answerRegions: 11 })!, /more than/);
  assert.equal(answerKeyProblem({ printedFields: 0, questions: 42, answerKey: 42, answerRegions: 30 }), null);
});

test('a 10-question key with 10 answers and 10 regions is accepted', () => {
  const c = describeAnswerKey({ masterJson: { sets: [{ questions: items(10) }] }, questions: items(10), answerKey: items(10), answerRegions: items(10) });
  assert.equal(answerKeyProblem(c), null);
});

test('a key with no layout information and no regions is accepted', () => {
  assert.equal(answerKeyProblem(describeAnswerKey({ questions: items(5), answerKey: items(5) })), null);
});

test('missing fields count as zero', () => {
  assert.deepEqual(describeAnswerKey({}), { printedFields: 0, questions: 0, answerKey: 0, answerRegions: 0 });
});

// Shapes copied from the real renders (class1.html, class3.html, class4.html).
const class4 = { sets: [{ set: 1, questions: [
  { qid: 'S1n0', section: 'Missing numbers', label: 'a', type: 'fill_blank', correct_answer: 12, icr: {} },
  { qid: 'S1n1', section: 'Missing numbers', label: 'b', type: 'fill_blank', icr: { evaluation: { expected: '15' } } },
  { section: 'no id, skipped' },
] }] };
const class1 = { questions: { Q1: { type: 'matching', question: 'Match shapes', expected_answer: [{ lPos: 1, rPos: 2 }] }, Q2: { type: 'choice', question: 'Pick one', expected_answer: 'B' } } };
const class3 = { sets: [{ sections: [{ section: 'S1', items: [] }] }] };

test('keyRootOf finds the key in all four class shapes', () => {
  assert.equal(keyRootOf({ sections: [] }) !== null, true);
  assert.equal(keyRootOf(class4), class4.sets[0]);
  assert.equal(keyRootOf(class3), class3.sets[0]);
  assert.equal(keyRootOf(class1), class1);
  assert.equal(keyRootOf(null), null);
  assert.equal(keyRootOf({ sets: [] }), null);
});

test('a Class 4 key gives one question per answer field, with its own id and answer', () => {
  const qs = flatKeyQuestions(keyRootOf(class4));
  assert.deepEqual(qs.map(q => q.question_id), ['S1n0', 'S1n1']);
  assert.deepEqual(qs.map(q => q.answer), ['12', '15']);
});

test('a Class 1 key (object keyed by question id) keeps structured answers as JSON', () => {
  const qs = flatKeyQuestions(class1);
  assert.deepEqual(qs.map(q => q.question_id), ['Q1', 'Q2']);
  assert.equal(qs[0].answer, '[{"lPos":1,"rPos":2}]');
  assert.equal(qs[1].answer, 'B');
});

test('a key with no questions gives an empty list', () => {
  assert.deepEqual(flatKeyQuestions(null), []);
  assert.deepEqual(flatKeyQuestions({ sections: [] }), []);
});

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate DB from the real repository data.
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fln-worksheet-content-test-'));
fs.mkdirSync(path.join(scratchDir, 'data'), { recursive: true });
process.chdir(scratchDir);
delete process.env.MONGODB_URI;
process.env.NODE_ENV = 'test';

const { dbStore } = await import('../src/db');
const { listThemes } = await import('../src/svgAssetCatalog');
const {
  MAX_CONCEPTS_PER_BATCH,
  MAX_QUESTIONS_PER_CONCEPT,
  resolveWorksheetContent,
} = await import('../src/services/worksheetContent');

const themes = listThemes().map(t => t.id);
assert.ok(themes.length >= 2, 'the SVG manifest has at least two themes');

let n = 0;
const template = (conceptId: string, over: Record<string, unknown> = {}) => ({
  id: `tpl_${++n}`, conceptId, skills: ['SK03'], subskills: [], paramMode: 'structured',
  generationIntent: 'The child looks at two groups of pictures and says which group has more objects, then marks it.',
  questionFamily: 'comparison', svgThemeIds: themes.slice(0, 2), assessmentMode: 'written',
  tags: [], source: 'form', createdAt: '2026-10-12T00:00:00Z', deletedAt: null, ...over,
}) as any;

before(async () => {
  await dbStore.init();
  await dbStore.addQuestionTemplate(template('S3.4', { id: 'tpl_written' }));
  await dbStore.addQuestionTemplate(template('S3.4', { id: 'tpl_both', assessmentMode: 'both' }));
  await dbStore.addQuestionTemplate(template('S3.4', { id: 'tpl_observed', assessmentMode: 'observed' }));
  await dbStore.addQuestionTemplate(template('S3.4', { id: 'tpl_pending', status: 'pending' }));
  await dbStore.addQuestionTemplate(template('S3.4', { id: 'tpl_deleted', deletedAt: '2026-10-01T00:00:00Z' }));
  // A fixed sentence with a fixed answer can only ever make one distinct question.
  await dbStore.addQuestionTemplate(template('S3.5', {
    id: 'tpl_fixed', paramMode: 'legacy-free-text', stem: 'Count the apples in the basket.', answerSpec: '5',
    generationIntent: '', svgThemeIds: [],
  }));
  await dbStore.addQuestionTemplate(template('S3.6', { id: 'tpl_trace', answerType: 'trace' }));
  await dbStore.addQuestionTemplate(template('S3.8', {
    id: 'tpl_circle', answerType: 'mcq-4', generationIntent: 'The child looks at the pictures and circles the group with more objects.',
  }));
  // Only an observation template: nothing printable.
  await dbStore.addQuestionTemplate(template('S3.7', { id: 'tpl_only_observed', assessmentMode: 'observed' }));
});

test('gives exactly the number asked for, numbered within the concept', async () => {
  for (const count of [1, 3, 8]) {
    const out = await resolveWorksheetContent(['S3.4'], count, { seed: 'w1' });
    assert.equal(out.concepts[0].questions.length, count);
    assert.deepEqual(out.questions.map(q => q.questionId), Array.from({ length: count }, (_, i) => `S3.4_Q${i + 1}`));
    assert.equal(out.concepts[0].shortfall, undefined);
    assert.ok(out.questions.every(q => q.conceptId === 'S3.4' && q.question.length > 0 && q.answer.length > 0));
  }
});

test('each question carries its template\'s answer type, which sizes its answer space', async () => {
  const out = await resolveWorksheetContent(['S3.6', 'S3.4'], 2, { seed: 'at' });
  assert.deepEqual(out.concepts[0].questions.map(q => q.answerType), ['trace', 'trace']);
  assert.deepEqual(out.concepts[1].questions.map(q => q.answerType), [null, null]);
});

test('room for circling is requested only when the theme lists "circle" among its answer shapes', async () => {
  const circlers = listThemes().filter(t => t.supportedAnswerShapes.includes('circle'));
  const out = await resolveWorksheetContent(['S3.8'], 3, { seed: 'c' });
  assert.ok(out.questions.length > 0);
  // The intent says "circles"; whether room is kept is decided by the theme, not the intent.
  for (const q of out.questions) {
    const theme = listThemes().find(t => t.id === q.svgAsset);
    assert.equal(q.circleAnswer, Boolean(theme?.supportedAnswerShapes.includes('circle')));
  }
  if (circlers.length === 0) assert.ok(out.questions.every(q => q.circleAnswer === false));
});

test('the same inputs always give the same questions and artwork; another seed gives different ones', async () => {
  const a = await resolveWorksheetContent(['S3.4'], 6, { seed: 'sheet-1' });
  const b = await resolveWorksheetContent(['S3.4'], 6, { seed: 'sheet-1' });
  assert.deepEqual(a, b);
  const c = await resolveWorksheetContent(['S3.4'], 6, { seed: 'sheet-2' });
  assert.notDeepEqual(a.questions.map(q => `${q.question}|${q.answer}|${q.svgVariant?.variantId}`),
                      c.questions.map(q => `${q.question}|${q.answer}|${q.svgVariant?.variantId}`));
  // No seed given: still repeatable.
  assert.deepEqual(await resolveWorksheetContent(['S3.4'], 4), await resolveWorksheetContent(['S3.4'], 4));
});

test('only approved, live, printable templates are used', async () => {
  const out = await resolveWorksheetContent(['S3.4'], 30, { seed: 'e' });
  const used = new Set(out.questions.map(q => q.templateId));
  assert.ok(used.has('tpl_written') && used.has('tpl_both'), 'written and both are printable');
  for (const bad of ['tpl_observed', 'tpl_pending', 'tpl_deleted']) assert.equal(used.has(bad), false, `${bad} must not be used`);
});

test('a concept with nothing printable, and an unknown concept, are reported and do not stop the others', async () => {
  const out = await resolveWorksheetContent(['S3.7', 'ZZ9.9', 'S3.4'], 2, { seed: 'm' });
  assert.deepEqual(out.concepts.map(c => [c.conceptId, c.shortfall]), [
    ['S3.7', 'no-eligible-template'], ['ZZ9.9', 'unknown-concept'], ['S3.4', undefined],
  ]);
  assert.equal(out.questions.length, 2);
});

test('the artwork file is one of the chosen theme\'s variants', async () => {
  const out = await resolveWorksheetContent(['S3.4'], 6, { seed: 'art' });
  for (const q of out.questions) {
    assert.ok(q.svgAsset && themes.includes(q.svgAsset), 'a theme from the template');
    const theme = listThemes().find(t => t.id === q.svgAsset)!;
    assert.ok(q.svgVariant && theme.variants.some(v => v.variantId === q.svgVariant!.variantId && v.file === q.svgVariant!.file));
  }
});

test('repeats are removed and a short supply is reported, not padded', async () => {
  const out = await resolveWorksheetContent(['S3.5'], 4, { seed: 'f' });
  assert.equal(out.questions.length, 1);
  assert.equal(out.concepts[0].shortfall, 'fewer-than-requested');
  assert.equal(out.concepts[0].requested, 4);
  const many = await resolveWorksheetContent(['S3.4'], 20, { seed: 'u' });
  assert.equal(new Set(many.questions.map(q => `${q.question}|${q.answer}`)).size, many.questions.length);
});

test('repeated concept ids are used once, in the order first given', async () => {
  const out = await resolveWorksheetContent(['S3.4', 'S3.5', 'S3.4', ' S3.4 '], 1, { seed: 'd' });
  assert.deepEqual(out.concepts.map(c => c.conceptId), ['S3.4', 'S3.5']);
});

test('bad input is refused', async () => {
  const bad: [any, any][] = [
    [[], 3], ['S3.4', 3], [null, 3], [[''], 3], [['  '], 3], [['S'.repeat(21)], 3], [[7], 3],
    [['S3.4'], 0], [['S3.4'], -1], [['S3.4'], 2.5], [['S3.4'], '3'], [['S3.4'], NaN],
    [['S3.4'], MAX_QUESTIONS_PER_CONCEPT + 1],
    [Array.from({ length: MAX_CONCEPTS_PER_BATCH + 1 }, (_, i) => `S3.${i}`), 1],
  ];
  for (const [ids, count] of bad) await assert.rejects(() => resolveWorksheetContent(ids, count), RangeError);
  await assert.doesNotReject(() => resolveWorksheetContent(['S3.4'], MAX_QUESTIONS_PER_CONCEPT, { seed: 'max' }));
});

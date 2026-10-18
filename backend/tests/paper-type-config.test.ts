import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fln-paper-type-test-'));
fs.mkdirSync(path.join(scratchDir, 'data'), { recursive: true });
process.chdir(scratchDir);
delete process.env.MONGODB_URI;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'dev-insecure-secret-change-me';

const { dbStore } = await import('../src/db');
const { JWT_SECRET } = await import('../src/auth');
const { registerWorksheetRoutes } = await import('../src/routes/worksheets');
const { PAPER_TYPE_CONFIG, getPaperTypeConfig, spreadQuestionCount } = await import('../src/config/paperTypeConfig');
await dbStore.init();

const express = (await import('express')).default;
const jwtLib = (await import('jsonwebtoken')).default;
const app = express();
app.use(express.json());
registerWorksheetRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', () => resolve()));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Failed to start test server');
const BASE = `http://127.0.0.1:${address.port}`;
after(() => { server.close(); });

const teacher = (await dbStore.getUsers()).find(u => u.email === 'gps-mt-001.t01@fln.org');
assert.ok(teacher, 'seeded teacher exists');
const auth = { Authorization: `Bearer ${jwtLib.sign({ email: teacher.email }, JWT_SECRET, { expiresIn: '1h' })}` };

test('every paper type has a whole question count in the plan range and fixes no level', () => {
  const types = Object.keys(PAPER_TYPE_CONFIG);
  assert.deepEqual(types.sort(), ['diagnostic', 'endline', 'midline', 'personalized']);
  for (const c of Object.values(PAPER_TYPE_CONFIG)) {
    assert.ok(Number.isInteger(c.questionCount) && c.questionCount >= 8 && c.questionCount <= 10, c.paperType);
    assert.equal('levelScope' in c, false, 'no level is fixed by the paper type');
    assert.equal(c.approvedTemplatesOnly, true);
  }
});

test('getPaperTypeConfig does not resolve inherited object keys', () => {
  assert.equal(getPaperTypeConfig('constructor'), undefined);
  assert.equal(getPaperTypeConfig('__proto__'), undefined);
  assert.equal(getPaperTypeConfig('practice'), undefined);
  assert.equal(getPaperTypeConfig('diagnostic')?.paperType, 'diagnostic');
});

test('GET /api/paper-types/config returns all four types to a signed-in user', async () => {
  const res = await fetch(`${BASE}/api/paper-types/config`, { headers: auth });
  assert.equal(res.status, 200);
  const body: any = await res.json();
  assert.equal(body.paperTypes.length, 4);
  assert.deepEqual(body.paperTypes.find((p: any) => p.paperType === 'personalized'), PAPER_TYPE_CONFIG.personalized);
});

test('GET /api/paper-types/:type/config returns one type, and 404 for an unknown one', async () => {
  const ok = await fetch(`${BASE}/api/paper-types/midline/config`, { headers: auth });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), PAPER_TYPE_CONFIG.midline);
  for (const bad of ['practice', 'constructor']) {
    const res = await fetch(`${BASE}/api/paper-types/${bad}/config`, { headers: auth });
    assert.equal(res.status, 404, bad);
  }
});

test('both routes refuse a request with no token', async () => {
  assert.equal((await fetch(`${BASE}/api/paper-types/config`)).status, 401);
  assert.equal((await fetch(`${BASE}/api/paper-types/diagnostic/config`)).status, 401);
});

test('spreadQuestionCount splits evenly, remainder to the first concepts, and always sums to the total', () => {
  assert.deepEqual(spreadQuestionCount(10, 3), [4, 3, 3]);
  assert.deepEqual(spreadQuestionCount(10, 2), [5, 5]);
  assert.deepEqual(spreadQuestionCount(10, 10), Array(10).fill(1));
  assert.deepEqual(spreadQuestionCount(8, 1), [8]);
  for (let parts = 1; parts <= 8; parts++) {
    assert.equal(spreadQuestionCount(8, parts).reduce((a, b) => a + b, 0), 8);
  }
});

test('spreadQuestionCount refuses a split that leaves a concept with no question', () => {
  assert.throws(() => spreadQuestionCount(10, 11), RangeError);
  assert.throws(() => spreadQuestionCount(10, 0), RangeError);
  assert.throws(() => spreadQuestionCount(10, 2.5), RangeError);
});

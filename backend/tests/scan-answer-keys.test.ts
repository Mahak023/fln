import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate DB from the real repository data.
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fln-scan-keys-test-'));
fs.mkdirSync(path.join(scratchDir, 'data'), { recursive: true });
process.chdir(scratchDir);

delete process.env.MONGODB_URI;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'dev-insecure-secret-change-me';

const { dbStore } = await import('../src/db');
const { JWT_SECRET } = await import('../src/auth');
const { registerStudentRoutes } = await import('../src/routes/students');

await dbStore.init();

const express = (await import('express')).default;
const jwtLib = (await import('jsonwebtoken')).default;

const app = express();
app.use(express.json());
registerStudentRoutes(app);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', () => resolve()));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Failed to start test server');
const BASE = `http://127.0.0.1:${address.port}`;

const TEACHER = 'gps-mt-001.t01@fln.org';
const teacher = (await dbStore.getUsers()).find(u => u.email === TEACHER);
assert.ok(teacher, 'seeded teacher exists');
const student = (await dbStore.getStudents()).find(s => s.schoolId === teacher.schoolId);
assert.ok(student, 'seeded student at the teacher\'s school exists');

// Three questions with known answers. Sent in the body, so no stored paper is needed.
const questions = [
  { question_id: 'Q_L91_1', question: 'What is 2 + 3?', answer: '5', answer_type: 'number', topic: 'Number', subtopic: 'Addition', difficulty: 'easy', source_level: 91 },
  { question_id: 'Q_L91_2', question: 'What is 4 + 4?', answer: '8', answer_type: 'number', topic: 'Number', subtopic: 'Addition', difficulty: 'easy', source_level: 91 },
  { question_id: 'Q_L91_3', question: 'What is 9 - 4?', answer: '5', answer_type: 'number', topic: 'Number', subtopic: 'Subtraction', difficulty: 'easy', source_level: 91 },
];

async function submit(route: 'baseline' | 'diagnostic', answers: Record<string, string>) {
  const res = await fetch(`${BASE}/api/students/${student!.id}/${route}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwtLib.sign({ email: TEACHER }, JWT_SECRET, { expiresIn: '1h' })}`,
    },
    body: JSON.stringify({ questions, answers }),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

test('OCR keys q_1, q_2, q_3 are graded (baseline)', async () => {
  const res = await submit('baseline', { q_1: '5', q_2: '8', q_3: '5' });
  assert.equal(res.status, 200, JSON.stringify(res.json));
});

test('OCR keys q_1, q_2, q_3 are graded (diagnostic)', async () => {
  const res = await submit('diagnostic', { q_1: '5', q_2: '8', q_3: '5' });
  assert.equal(res.status, 200, JSON.stringify(res.json));
});

test('upper and lower case positional keys Q1 and q1 still work', async () => {
  assert.equal((await submit('baseline', { Q1: '5', Q2: '8', Q3: '5' })).status, 200);
  assert.equal((await submit('baseline', { q1: '5', q2: '8', q3: '5' })).status, 200);
});

test('question ids still work', async () => {
  assert.equal((await submit('baseline', { Q_L91_1: '5', Q_L91_2: '8', Q_L91_3: '5' })).status, 200);
});

test('keys that match nothing are refused and the message names the q_ form', async () => {
  const res = await submit('baseline', { x_1: '5', x_2: '8' });
  assert.equal(res.status, 400);
  assert.match(String(res.json?.error), /q_1/);
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate DB from the real repository data.
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fln-admin-scope-test-'));
fs.mkdirSync(path.join(scratchDir, 'data'), { recursive: true });
process.chdir(scratchDir);
delete process.env.MONGODB_URI;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'dev-insecure-secret-change-me';

const { dbStore, UserRole } = await import('../src/db');
const { JWT_SECRET, canAccessStudent, adminAreaIncludesSchool } = await import('../src/auth');
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
after(async () => { await new Promise<void>(r => server.close(() => r())); });

const users = await dbStore.getUsers();
const schools = await dbStore.getSchools();
const students = await dbStore.getStudents();
const schoolById = new Map(schools.map(s => [s.id, s]));
const token = (email: string) => `Bearer ${jwtLib.sign({ email }, JWT_SECRET, { expiresIn: '1h' })}`;
const get = async (email: string, url = '/api/students?all=1') => {
  const res = await fetch(`${BASE}${url}`, { headers: { Authorization: token(email) } });
  return { status: res.status, total: res.headers.get('X-Total-Count'), body: res.ok ? await res.json() as any[] : null };
};

const stateAdmin = users.find(u => u.role === UserRole.ADMIN && u.stateCode)!;
const blockAdmin = users.find(u => u.role === UserRole.BLOCK_ADMIN && u.blockCode)!;
const districtAdmin = users.find(u => u.role === UserRole.DISTRICT_ADMIN && u.districtCode)!;
const superadmin = users.find(u => u.role === UserRole.SUPERADMIN)!;
assert.ok(stateAdmin && blockAdmin && districtAdmin && superadmin, 'seeded admins exist');

const inState = (s: any) => schoolById.get(s.schoolId)?.stateCode === stateAdmin.stateCode;
const inBlock = (s: any) => schoolById.get(s.schoolId)?.blockCode === blockAdmin.blockCode;
const inDistrict = (s: any) => schoolById.get(s.schoolId)?.districtCode === districtAdmin.districtCode;

test('the seed has students inside and outside each admin\'s area, so the checks below mean something', () => {
  for (const [name, f] of [['state', inState], ['block', inBlock], ['district', inDistrict]] as const) {
    assert.ok(students.some(f), `${name}: some student inside`);
    assert.ok(students.some(s => !f(s)), `${name}: some student outside`);
  }
});

test('GET /api/students: a state admin gets only the students of their own state, and X-Total-Count agrees', async () => {
  const r = await get(stateAdmin.email);
  assert.equal(r.status, 200);
  assert.ok(r.body!.length > 0 && r.body!.length < students.length);
  assert.ok(r.body!.every(inState));
  assert.equal(r.body!.length, students.filter(inState).length);
  assert.equal(Number(r.total), r.body!.length);
});

test('GET /api/students: a district admin gets only their district, a block admin only their block', async () => {
  const d = await get(districtAdmin.email);
  assert.deepEqual(d.body!.map(s => s.id).sort(), students.filter(inDistrict).map(s => s.id).sort());
  const b = await get(blockAdmin.email);
  assert.deepEqual(b.body!.map(s => s.id).sort(), students.filter(inBlock).map(s => s.id).sort());
  assert.equal(Number(b.total), b.body!.length);
});

test('GET /api/students: paging and search stay inside the area and the total counts the whole match', async () => {
  const page = await get(stateAdmin.email, '/api/students?limit=5');
  assert.equal(page.body!.length, 5);
  assert.ok(page.body!.every(inState));
  assert.equal(Number(page.total), students.filter(inState).length);
  const outsider = students.find(s => !inState(s))!;
  const search = await get(stateAdmin.email, `/api/students?q=${encodeURIComponent(outsider.name)}&all=1`);
  assert.ok(search.body!.every(inState), 'a search cannot surface a child from another state');
});

test('GET /api/students: a superadmin still gets everyone, and a teacher still gets their own school', async () => {
  assert.equal((await get(superadmin.email)).body!.length, students.length);
  const teacher = users.find(u => u.role === UserRole.TEACHER)!;
  const t = await get(teacher.email);
  assert.ok(t.body!.length > 0 && t.body!.every(s => s.schoolId === teacher.schoolId));
});

test('GET /api/students: an admin account with no area code gets an empty list, not everyone', async () => {
  const email = 'no-area-admin@fln.org';
  for (const role of [UserRole.ADMIN, UserRole.DISTRICT_ADMIN, UserRole.BLOCK_ADMIN]) {
    await dbStore.addUser({ id: `u_${role}`, email: `${role}.${email}`, name: 'No Area', role, passwordHash: 'x' } as any);
    const r = await get(`${role}.${email}`);
    assert.equal(r.status, 200, role);
    assert.deepEqual(r.body, [], role);
    assert.equal(r.total, '0', role);
  }
});

test('canAccessStudent: an admin reaches a child in their area and no child outside it', async () => {
  const other = students.find(s => !inState(s))!;
  const own = students.find(inState)!;
  assert.equal(await canAccessStudent(stateAdmin, own), true);
  assert.equal(await canAccessStudent(stateAdmin, other), false);
  assert.equal(await canAccessStudent(blockAdmin, students.find(s => !inBlock(s))!), false);
  assert.equal(await canAccessStudent(blockAdmin, students.find(inBlock)!), true);
  assert.equal(await canAccessStudent(districtAdmin, students.find(s => !inDistrict(s))!), false);
  assert.equal(await canAccessStudent(superadmin, other), true);
});

test('canAccessStudent: no area code, or a child whose school is unknown, is refused', async () => {
  const own = students.find(inState)!;
  assert.equal(await canAccessStudent({ ...stateAdmin, stateCode: undefined } as any, own), false);
  assert.equal(await canAccessStudent(stateAdmin, { ...own, schoolId: 'no-such-school' } as any), false);
});

test('adminAreaIncludesSchool: parent codes must match, and other roles never match', () => {
  const school = { stateCode: 'AA', districtCode: 'D1', blockCode: 'D1_01' };
  const block = { role: UserRole.BLOCK_ADMIN, stateCode: 'AA', districtCode: 'D1', blockCode: 'D1_01' } as any;
  assert.equal(adminAreaIncludesSchool(block, school), true);
  assert.equal(adminAreaIncludesSchool({ ...block, stateCode: 'BB' }, school), false, 'same block code in another state');
  assert.equal(adminAreaIncludesSchool({ ...block, blockCode: 'd1_01' }, school), true, 'case does not matter');
  assert.equal(adminAreaIncludesSchool({ role: UserRole.TEACHER, stateCode: 'AA' } as any, school), false);
  assert.equal(adminAreaIncludesSchool(block, null), false);
});

test('a by-ID route refuses an admin from another state (403) and lets one from the same state through', async () => {
  const own = students.find(inState)!;
  const foreignAdmin = users.find(u => u.role === UserRole.ADMIN && u.stateCode && u.stateCode !== stateAdmin.stateCode)!;
  const call = (email: string) => fetch(`${BASE}/api/students/${own.id}/baseline/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token(email) }, body: JSON.stringify({ questions: [], answers: {} }),
  });
  assert.equal((await call(foreignAdmin.email)).status, 403);
  assert.notEqual((await call(stateAdmin.email)).status, 403);
});

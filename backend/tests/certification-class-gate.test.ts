/**
 * Issue #837 — Certification Class Gate & Class Top Level Mapping
 *
 * Tests:
 *  1. parseClassNumber:
 *     - Balvatika -> 0 (including whitespace and case variations)
 *     - Classes 1 to 3 -> 1 to 3 (including section suffixes e.g. 'Class 2-A')
 *     - Class 4+ -> actual class number (e.g. 4, 10)
 *     - Invalid/empty/null/undefined labels -> null
 *  2. CLASS_TOP_LEVEL:
 *     - Exact mapping { 0: 46, 1: 60, 2: 77, 3: 91 }
 *     - Verifies each stage's highest level in skillLevelMap.json matches CLASS_TOP_LEVEL
 *  3. Class gating in runCertificationEligibilityForStudent:
 *     - Skips Class 4 and above (Tenali scope) without creating records or throwing
 *     - Skips invalid or unparseable class labels without errors
 *  4. Certification lookup and creation:
 *     - Records stored with class top level (46 for Balvatika, 77 for Class 2)
 *     - getCertificationByStudentClassLevel finds them at (class, topLevel)
 *     - Legacy level 5 lookups do not match new records
 *     - Class transition: student moving from Class 2 to Class 3 keeps Class 2 cert (L77)
 *       and can hold a distinct Class 3 cert (L91)
 *  5. Issue #844 dependency blocker verification:
 *     - Documents that getRequirementsForClassLevel(0, 46) and (2, 77) return empty
 *       until Issue #844 updates competencyRequirements.seed.json
 *     - Confirms engine handles this safely by returning early without creating records
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Setup isolated file store ──────────────────────────────────────────────
const originalCwd = process.cwd();
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fln-cert-gate-test-'));
fs.mkdirSync(path.join(scratchDir, 'data'), { recursive: true });
process.chdir(scratchDir);
delete process.env.MONGODB_URI;
process.env.NODE_ENV = 'test';

const { dbStore } = await import('../src/db.js');
const {
  parseClassNumber,
  runCertificationEligibilityForStudent,
} = await import('../src/services/certificationRecords.js');
const {
  CLASS_TOP_LEVEL,
  getRequirementsForClassLevel,
} = await import('../src/services/certificationCompetencyRequirements.js');

await dbStore.init();

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(scratchDir, { recursive: true, force: true });
});

// ─── 1. parseClassNumber Unit Tests ─────────────────────────────────────────

test('parseClassNumber: correctly maps Balvatika to 0', () => {
  assert.equal(parseClassNumber('Balvatika'), 0);
  assert.equal(parseClassNumber('balvatika'), 0);
  assert.equal(parseClassNumber('BALVATIKA'), 0);
  assert.equal(parseClassNumber(' balvatika '), 0);
  assert.equal(parseClassNumber('  Balvatika  '), 0);
});

test('parseClassNumber: correctly maps Class 1 to Class 3', () => {
  assert.equal(parseClassNumber('Class 1'), 1);
  assert.equal(parseClassNumber('class 1'), 1);
  assert.equal(parseClassNumber('Class 1-A'), 1);
  assert.equal(parseClassNumber('Class 2'), 2);
  assert.equal(parseClassNumber('Class 2-A'), 2);
  assert.equal(parseClassNumber('Class 2B'), 2);
  assert.equal(parseClassNumber('Class 3'), 3);
  assert.equal(parseClassNumber('Class 3 - Section C'), 3);
});

test('parseClassNumber: returns actual number for Class 4 and higher', () => {
  assert.equal(parseClassNumber('Class 4'), 4);
  assert.equal(parseClassNumber('Class 4-B'), 4);
  assert.equal(parseClassNumber('Class 5'), 5);
  assert.equal(parseClassNumber('Class 10'), 10);
});

test('parseClassNumber: returns null for invalid, empty, or missing labels', () => {
  assert.equal(parseClassNumber(''), null);
  assert.equal(parseClassNumber('   '), null);
  assert.equal(parseClassNumber(undefined), null);
  assert.equal(parseClassNumber(null), null);
  assert.equal(parseClassNumber('Grade 2'), null);
  assert.equal(parseClassNumber('Class'), null);
  assert.equal(parseClassNumber('Standard 3'), null);
  assert.equal(parseClassNumber('Unknown'), null);
});

// ─── 2. CLASS_TOP_LEVEL Verification ────────────────────────────────────────

test('CLASS_TOP_LEVEL: contains expected mapping {0:46, 1:60, 2:77, 3:91}', () => {
  assert.deepEqual(CLASS_TOP_LEVEL, {
    0: 46,
    1: 60,
    2: 77,
    3: 91,
  });
});

test('CLASS_TOP_LEVEL: matches the highest level of each stage in skillLevelMap.json', () => {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const skillMapPath = path.resolve(currentDir, '../src/data/skillLevelMap.json');
  assert.ok(fs.existsSync(skillMapPath), 'skillLevelMap.json must exist');

  const raw = fs.readFileSync(skillMapPath, 'utf-8');
  const skillMap = JSON.parse(raw);

  const levels = Object.values(skillMap.levels) as Array<{
    levelNumber: number;
    stage: string;
  }>;

  const stageMax: Record<string, number> = {};
  for (const lv of levels) {
    if (!stageMax[lv.stage] || lv.levelNumber > stageMax[lv.stage]) {
      stageMax[lv.stage] = lv.levelNumber;
    }
  }

  // Pre-school 3 is Balvatika (class 0)
  assert.equal(stageMax['Pre-school 3'], 46, 'Pre-school 3 (Balvatika) top level must be 46');
  assert.equal(stageMax['Pre-school 3'], CLASS_TOP_LEVEL[0]);

  // Class 1
  assert.equal(stageMax['Class 1'], 60, 'Class 1 top level must be 60');
  assert.equal(stageMax['Class 1'], CLASS_TOP_LEVEL[1]);

  // Class 2
  assert.equal(stageMax['Class 2'], 77, 'Class 2 top level must be 77');
  assert.equal(stageMax['Class 2'], CLASS_TOP_LEVEL[2]);

  // Class 3
  assert.equal(stageMax['Class 3'], 91, 'Class 3 top level must be 91');
  assert.equal(stageMax['Class 3'], CLASS_TOP_LEVEL[3]);
});

// ─── 3. Class Gating in runCertificationEligibilityForStudent ───────────────

test('Class gating: Class 4 student is skipped without creating a certification record', async () => {
  const studentId = 'stu_test_class4';
  await dbStore.addStudent({
    id: studentId,
    name: 'Class 4 Student',
    age: 10,
    classGroup: 'Class 4',
    section: 'A',
    schoolId: 'gps-mt-001',
    currentLevel: 95,
    currentSubLevel: 0,
    targetLevel: 96,
    aadharMasked: 'XXXX-XXXX-4444',
    levelHistory: [],
  });

  // Seed an evaluation report so getLatestConceptMastery returns evidence
  await dbStore.addEvaluationReport({
    id: 'rep_class4',
    studentId,
    worksheetId: 'ws_class4',
    timestamp: new Date().toISOString(),
    score: 10,
    totalQuestions: 10,
    conceptMastery: { 'Number Operations': 'Strong' },
  } as any);

  const student = await dbStore.getStudentById(studentId);
  assert.ok(student);

  await runCertificationEligibilityForStudent(student);

  const certs = (await dbStore.getCertifications()).filter((c: any) => c.studentId === studentId);
  assert.equal(certs.length, 0, 'No certification should be created for Class 4');
});

test('Class gating: Student with invalid classGroup is skipped silently', async () => {
  const studentId = 'stu_test_invalid_class';
  await dbStore.addStudent({
    id: studentId,
    name: 'Invalid Class Student',
    age: 8,
    classGroup: 'Grade 2',
    section: 'A',
    schoolId: 'gps-mt-001',
    currentLevel: 50,
    currentSubLevel: 0,
    targetLevel: 51,
    aadharMasked: 'XXXX-XXXX-9999',
    levelHistory: [],
  });

  await dbStore.addEvaluationReport({
    id: 'rep_invalid_class',
    studentId,
    worksheetId: 'ws_invalid',
    timestamp: new Date().toISOString(),
    score: 10,
    totalQuestions: 10,
    conceptMastery: { 'Number Sense': 'Strong' },
  } as any);

  const student = await dbStore.getStudentById(studentId);
  assert.ok(student);

  await runCertificationEligibilityForStudent(student);

  const certs = (await dbStore.getCertifications()).filter((c: any) => c.studentId === studentId);
  assert.equal(certs.length, 0, 'No certification should be created for invalid class');
});

// ─── 4. Certification Lookup and Creation at Class Top Level ─────────────────

test('Certification records use class top level (Balvatika: 46, Class 2: 77)', async () => {
  const balvatikaStudentId = 'stu_balvatika_lookup_1';
  const class2StudentId = 'stu_class2_lookup_1';

  const now = new Date().toISOString();

  // Create Balvatika cert with level 46
  await dbStore.addCertification({
    id: 'cert_balvatika_1',
    studentId: balvatikaStudentId,
    classNumber: 0,
    level: CLASS_TOP_LEVEL[0], // 46
    decisionSnapshot: {
      outcome: 'eligible',
      evaluatedAt: now,
      classNumber: 0,
      level: 46,
      metTopics: ['Counting'],
      missingTopics: [],
      unassessedTopics: [],
    },
    status: 'active',
    version: 1,
    issuedAt: now,
    certificateId: 'CERT-' + balvatikaStudentId + '-0',
    createdAt: now,
    updatedAt: now,
  });

  // Create Class 2 cert with level 77
  await dbStore.addCertification({
    id: 'cert_class2_1',
    studentId: class2StudentId,
    classNumber: 2,
    level: CLASS_TOP_LEVEL[2], // 77
    decisionSnapshot: {
      outcome: 'eligible',
      evaluatedAt: now,
      classNumber: 2,
      level: 77,
      metTopics: ['Number Sense', 'Number Operations', 'Shapes', 'Patterns'],
      missingTopics: [],
      unassessedTopics: [],
    },
    status: 'active',
    version: 1,
    issuedAt: now,
    certificateId: 'CERT-' + class2StudentId + '-2',
    createdAt: now,
    updatedAt: now,
  });

  // Verify Balvatika lookup with level 46
  const balvatikaCert = await dbStore.getCertificationByStudentClassLevel(balvatikaStudentId, 0, 46);
  assert.ok(balvatikaCert, 'Balvatika cert must be found with level 46');
  assert.equal(balvatikaCert.level, 46);
  assert.equal(balvatikaCert.classNumber, 0);

  // Verify Class 2 lookup with level 77
  const class2Cert = await dbStore.getCertificationByStudentClassLevel(class2StudentId, 2, 77);
  assert.ok(class2Cert, 'Class 2 cert must be found with level 77');
  assert.equal(class2Cert.level, 77);
  assert.equal(class2Cert.classNumber, 2);

  // Verify lookup with legacy level 5 returns null/undefined
  const legacyLookup = await dbStore.getCertificationByStudentClassLevel(class2StudentId, 2, 5);
  assert.equal(legacyLookup, null, 'Lookup at legacy level 5 should not find the level 77 cert');
});

test('Student class transition: retaining Class 2 record and getting separate Class 3 record', async () => {
  const studentId = 'stu_promoted_1';
  const now = new Date().toISOString();

  // Student receives Class 2 cert at level 77
  await dbStore.addCertification({
    id: 'cert_promo_c2',
    studentId,
    classNumber: 2,
    level: 77,
    decisionSnapshot: {
      outcome: 'eligible',
      evaluatedAt: now,
      classNumber: 2,
      level: 77,
      metTopics: ['Number Sense'],
      missingTopics: [],
      unassessedTopics: [],
    },
    status: 'active',
    version: 1,
    issuedAt: now,
    certificateId: `CERT-${studentId}-2`,
    createdAt: now,
    updatedAt: now,
  });

  // Later, student progresses to Class 3 and receives Class 3 cert at level 91
  await dbStore.addCertification({
    id: 'cert_promo_c3',
    studentId,
    classNumber: 3,
    level: 91,
    decisionSnapshot: {
      outcome: 'eligible',
      evaluatedAt: now,
      classNumber: 3,
      level: 91,
      metTopics: ['Number Sense', 'Fractions'],
      missingTopics: [],
      unassessedTopics: [],
    },
    status: 'active',
    version: 1,
    issuedAt: now,
    certificateId: `CERT-${studentId}-3`,
    createdAt: now,
    updatedAt: now,
  });

  const c2Cert = await dbStore.getCertificationByStudentClassLevel(studentId, 2, 77);
  const c3Cert = await dbStore.getCertificationByStudentClassLevel(studentId, 3, 91);
  assert.ok(c2Cert, 'Class 2 cert must still exist');
  assert.ok(c3Cert, 'Class 3 cert must exist separately');
  assert.equal(c2Cert.level, 77);
  assert.equal(c3Cert.level, 91);

  const allStudentCerts = (await dbStore.getCertifications()).filter((c: any) => c.studentId === studentId);
  assert.equal(allStudentCerts.length, 2, 'Student should have exactly 2 certificates');
});

// ─── 5. Issue #844 Dependency Blocker Verification ──────────────────────────

test('Issue #844 dependency blocker: seed data currently lacks top-level rows (46, 60, 77, 91)', () => {
  // In Issue #837, the engine queries getRequirementsForClassLevel(classNumber, level)
  // using CLASS_TOP_LEVEL (46, 60, 77, 91).
  // However, competencyRequirements.seed.json still has the legacy level 5 rows
  // until Issue #844 replaces the seed dataset.
  const balvatikaReqs = getRequirementsForClassLevel(0, 46);
  assert.equal(
    balvatikaReqs.length,
    0,
    'Blocker check: Balvatika requirements at level 46 are not in seed data yet (pending #844)'
  );

  const class1Reqs = getRequirementsForClassLevel(1, 60);
  assert.equal(
    class1Reqs.length,
    0,
    'Blocker check: Class 1 requirements at level 60 are not in seed data yet (pending #844)'
  );

  const class2Reqs = getRequirementsForClassLevel(2, 77);
  assert.equal(
    class2Reqs.length,
    0,
    'Blocker check: Class 2 requirements at level 77 are not in seed data yet (pending #844)'
  );

  const class3Reqs = getRequirementsForClassLevel(3, 91);
  assert.equal(
    class3Reqs.length,
    0,
    'Blocker check: Class 3 requirements at level 91 are not in seed data yet (pending #844)'
  );
});

test('Engine behavior on missing seed requirements: gracefully skips without error', async () => {
  const studentId = 'stu_balvatika_no_seed';
  await dbStore.addStudent({
    id: studentId,
    name: 'Balvatika Child',
    age: 5,
    classGroup: 'Balvatika',
    section: 'A',
    schoolId: 'gps-mt-001',
    currentLevel: 30,
    currentSubLevel: 0,
    targetLevel: 31,
    aadharMasked: 'XXXX-XXXX-0001',
    levelHistory: [],
  });

  await dbStore.addEvaluationReport({
    id: 'rep_balvatika_1',
    studentId,
    worksheetId: 'ws_balvatika_1',
    timestamp: new Date().toISOString(),
    score: 10,
    totalQuestions: 10,
    conceptMastery: { Counting: 'Strong' },
  } as any);

  const student = await dbStore.getStudentById(studentId);
  assert.ok(student);

  // Because no requirements are seeded for (0, 46) yet (awaiting #844),
  // mandatory.length === 0 triggers a clean return with no errors and no cert created.
  await runCertificationEligibilityForStudent(student);

  const certs = (await dbStore.getCertifications()).filter((c: any) => c.studentId === studentId);
  assert.equal(
    certs.length,
    0,
    'No certification created while requirement seed data for (0, 46) is pending #844'
  );
});

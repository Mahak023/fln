/**
 * Focused check: the competency-requirements seed file is loadable under ESM.
 *
 * Invoked via:
 *   npx tsx backend/src/__checks__/competency-seed.check.ts
 *
 * Validates that the ESM-compatible seed loader reads the JSON file and
 * returns the expected number of competency requirements (Issue #675).
 *
 * This mirrors exactly what getSeedCompetencyRequirements() in db.ts does:
 * resolve the path via __dirname and readFileSync.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve relative to db.ts's __dirname (one level up from __checks__)
const seedPath = path.resolve(__dirname, '..', 'data', 'competencyRequirements.seed.json');
const raw = readFileSync(seedPath, 'utf-8');
const reqs = JSON.parse(raw);

assert.ok(Array.isArray(reqs), 'competencyRequirements must be an array');
assert.strictEqual(
  reqs.length,
  16,
  `Expected 16 competency requirements, got ${reqs.length}`,
);

// Spot-check: every entry has the required shape
for (const r of reqs) {
  assert.ok(typeof r.classNumber === 'number', `classNumber must be a number, got ${typeof r.classNumber}`);
  assert.ok([2, 3, 4].includes(r.classNumber), `classNumber must be 2-4, got ${r.classNumber}`);
  assert.ok(typeof r.level === 'number', `level must be a number`);
  assert.ok(typeof r.topic === 'string' && r.topic.length > 0, `topic must be a non-empty string`);
  assert.ok(typeof r.isMandatory === 'boolean', `isMandatory must be a boolean`);
  assert.ok(
    ['Strong', 'Satisfactory', 'Needs Practice'].includes(r.meetsThreshold),
    `meetsThreshold must be a valid MasteryLevel, got ${r.meetsThreshold}`,
  );
}

console.log(`✅ competency-seed.check: ${reqs.length} competency requirements loaded correctly`);

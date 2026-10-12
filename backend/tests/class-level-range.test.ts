import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DBStore } from '../src/db';
import { LEVEL_COUNT, listStages } from '../src/config/skillLevelMap';

// classLevelRange() must follow the stage boundaries of the level map, so a
// curriculum change that moves a boundary fails here instead of silently
// putting a level in the wrong class paper.
const STAGE_FOR_CLASS: Record<number, string> = {
  1: 'Class 1',
  2: 'Class 2',
  3: 'Class 3',
  4: 'Class 4',
};

for (const [classNumber, stageName] of Object.entries(STAGE_FOR_CLASS)) {
  test(`classLevelRange(${classNumber}) matches the ${stageName} stage of the level map`, () => {
    const stage = listStages().find(s => s.stage === stageName);
    assert.ok(stage, `stage ${stageName} exists in the level map`);
    assert.deepEqual(DBStore.classLevelRange(Number(classNumber)), {
      min: stage.firstLevel,
      max: stage.lastLevel,
    });
  });
}

test('Class 4 reaches the last level, and the bands leave no gap or overlap', () => {
  assert.equal(DBStore.classLevelRange(4).max, LEVEL_COUNT);
  for (let c = 1; c < 4; c++) {
    assert.equal(DBStore.classLevelRange(c).max + 1, DBStore.classLevelRange(c + 1).min);
  }
});

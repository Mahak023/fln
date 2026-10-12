import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { QUESTION_FAMILIES, QUESTION_FAMILY_LABELS, isQuestionFamily } from './questionFamily';

describe('question families', () => {
  it('matches QUESTION_FAMILIES in the backend schema', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../backend/src/types/questionTemplateParams.ts'),
      'utf8',
    );
    const block = src.match(/export const QUESTION_FAMILIES = \[([\s\S]*?)\] as const/);
    expect(block).not.toBeNull();
    const backend = [...block![1].matchAll(/'([a-z-]+)'/g)].map(m => m[1]);
    expect([...QUESTION_FAMILIES]).toEqual(backend);
    expect(backend).toHaveLength(10);
  });

  it('has a non-empty label for every family', () => {
    for (const family of QUESTION_FAMILIES) {
      expect(QUESTION_FAMILY_LABELS[family].trim()).not.toBe('');
    }
    expect(Object.keys(QUESTION_FAMILY_LABELS)).toHaveLength(QUESTION_FAMILIES.length);
  });

  it('accepts all ten families and rejects anything else', () => {
    for (const family of QUESTION_FAMILIES) expect(isQuestionFamily(family)).toBe(true);
    for (const bad of ['', 'Counting', 'toString', '__proto__', 'constructor', null, undefined, 3]) {
      expect(isQuestionFamily(bad)).toBe(false);
    }
  });
});

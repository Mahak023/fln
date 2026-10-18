import { describe, it, expect } from 'vitest';
import { summarizeTemplatesByConcept, isPrintable } from './worksheetTemplates';

const t = (conceptId: string, levelNumber: number, over: Record<string, unknown> = {}) =>
  ({ id: `${conceptId}-${Math.random()}`, conceptId, levelNumber, levelName: `L${levelNumber}`, assessmentMode: 'written', ...over }) as any;

describe('summarizeTemplatesByConcept', () => {
  it('counts what a sheet can print, the same way the backend picks questions', () => {
    const rows = summarizeTemplatesByConcept([
      t('S3.4', 22), t('S3.4', 22, { assessmentMode: 'both' }),
      t('S3.4', 22, { assessmentMode: 'observed' }),
      t('S3.4', 22, { status: 'pending' }),
      t('S3.4', 22, { deletedAt: '2026-10-01T00:00:00Z' }),
    ]);
    expect(rows).toEqual([{ conceptId: 'S3.4', levelNumber: 22, levelName: 'L22', total: 4, printable: 2, pending: 1, observedOnly: 1 }]);
  });

  it('lists concepts in level order and leaves out a concept that only has deleted rows', () => {
    const rows = summarizeTemplatesByConcept([
      t('S3.7', 26), t('S3.1', 18), t('S3.9', 28, { deletedAt: 'x' }),
    ]);
    expect(rows.map(r => r.conceptId)).toEqual(['S3.1', 'S3.7']);
  });

  it('returns nothing for no templates', () => {
    expect(summarizeTemplatesByConcept([])).toEqual([]);
  });

  it('treats a missing status as approved, and a rejected one as not printable', () => {
    expect(isPrintable(t('S3.1', 18))).toBe(true);
    expect(isPrintable(t('S3.1', 18, { status: 'rejected' }))).toBe(false);
  });
});

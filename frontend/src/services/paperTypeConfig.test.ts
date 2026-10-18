import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPaperTypeConfig, paperRequestBody } from './paperTypeConfig';

const reply = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => {} });
  vi.stubGlobal('window', { dispatchEvent: () => true });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchPaperTypeConfig', () => {
  it('returns the config the backend sends', async () => {
    reply(200, { paperType: 'diagnostic', questionCount: 10, approvedTemplatesOnly: true });
    const c = await fetchPaperTypeConfig('diagnostic');
    expect(c.questionCount).toBe(10);
    expect((fetch as any).mock.calls[0][0]).toContain('/api/paper-types/diagnostic/config');
  });

  it('shows the backend message when the request is refused', async () => {
    reply(404, { error: 'Unknown paper type.' });
    await expect(fetchPaperTypeConfig('midline')).rejects.toThrow('Unknown paper type.');
  });

  it('refuses an answer that is not the type asked for or has no usable count', async () => {
    reply(200, { paperType: 'endline', questionCount: 10 });
    await expect(fetchPaperTypeConfig('diagnostic')).rejects.toThrow(/unexpected form/);
    reply(200, { paperType: 'diagnostic', questionCount: 0 });
    await expect(fetchPaperTypeConfig('diagnostic')).rejects.toThrow(/unexpected form/);
  });
});

describe('paperRequestBody', () => {
  it('sends the type and concepts and never a question count', () => {
    const body = paperRequestBody('diagnostic', ['S3.4'], { className: 'Balvatika', section: 'A' });
    expect(body).toEqual({ paperType: 'diagnostic', conceptIds: ['S3.4'], className: 'Balvatika', section: 'A' });
    expect('questionsPerConcept' in body).toBe(false);
  });
});

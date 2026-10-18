// The fixed shape of each paper type, read from the backend on "Generate"
// (#593) so the number of questions is never written into the frontend.
import { apiFetch } from './apiClient';

export type PaperType = 'diagnostic' | 'midline' | 'endline' | 'personalized';

export interface PaperTypeConfig {
  paperType: PaperType;
  /** Total questions on one paper of this type. */
  questionCount: number;
  /** Only questions from approved templates may be drawn. */
  approvedTemplatesOnly: boolean;
}

/** Ask the backend for one paper type's config. Throws a readable Error when it cannot. */
export async function fetchPaperTypeConfig(paperType: PaperType): Promise<PaperTypeConfig> {
  const res = await apiFetch(`/api/paper-types/${encodeURIComponent(paperType)}/config`);
  let body: any = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new Error(body?.error || `Could not load the ${paperType} paper settings (${res.status}).`);
  if (!body || body.paperType !== paperType || !Number.isInteger(body.questionCount) || body.questionCount < 1) {
    throw new Error(`The ${paperType} paper settings came back in an unexpected form.`);
  }
  return body as PaperTypeConfig;
}

/** The request body for a paper of this type: the count comes from the backend, not from here. */
export function paperRequestBody(
  paperType: PaperType,
  conceptIds: string[],
  extra: { className: string; section: string; seed?: string },
) {
  return { paperType, conceptIds, ...extra };
}

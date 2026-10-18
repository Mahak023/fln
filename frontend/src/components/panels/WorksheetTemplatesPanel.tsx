// Worksheet Templates (#604): the real shape of each paper type and how many
// questions each concept can print. Both come from the backend, so nothing on
// this screen is typed in here.
import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from './PanelShared';
import { ClipboardList } from 'lucide-react';
import { apiFetch } from '../../services/apiClient';
import type { QuestionTemplate } from '../../types';
import type { PaperTypeConfig } from '../../services/paperTypeConfig';
import { summarizeTemplatesByConcept } from '../../utils/worksheetTemplates';

const PAPER_TYPE_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic', midline: 'Midline', endline: 'Endline', personalized: 'Personalized worksheet',
};

export const WorksheetTemplatesPanel: React.FC = () => {
  const [paperTypes, setPaperTypes] = useState<PaperTypeConfig[]>([]);
  const [templates, setTemplates] = useState<QuestionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [typesRes, templatesRes] = await Promise.all([
          apiFetch('/api/paper-types/config'),
          apiFetch('/api/question-templates'),
        ]);
        if (!typesRes.ok || !templatesRes.ok) {
          const failed = !typesRes.ok ? typesRes : templatesRes;
          let message = `Could not load the worksheet templates (${failed.status}).`;
          try { message = (await failed.json())?.error || message; } catch { /* not JSON */ }
          throw new Error(message);
        }
        const typesBody = await typesRes.json();
        const templatesBody = await templatesRes.json();
        if (cancelled) return;
        setPaperTypes(Array.isArray(typesBody?.paperTypes) ? typesBody.paperTypes : []);
        setTemplates(Array.isArray(templatesBody) ? templatesBody : []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load the worksheet templates.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const concepts = useMemo(() => summarizeTemplatesByConcept(templates), [templates]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-6">
      <PageHeader title="Worksheet Templates" desc="How each paper type is built, and how many questions each concept can print" icon={<ClipboardList className="h-5 w-5" />} />

      {loading && <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>}
      {error && <div role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">{error}</div>}

      {!loading && !error && (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-bold">Paper types</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paperTypes.map(p => (
                <div key={p.paperType} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-1">
                  <div className="font-bold text-sm">{PAPER_TYPE_LABELS[p.paperType] ?? p.paperType}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">📝 {p.questionCount} questions</div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">{p.approvedTemplatesOnly ? 'Approved templates only' : 'Any template'}</div>
                </div>
              ))}
              {paperTypes.length === 0 && <div className="text-sm text-slate-500 dark:text-slate-400">No paper types are configured.</div>}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold">Question templates by concept</h3>
            {concepts.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">No question templates have been added yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="py-2 pr-3">Concept</th><th className="pr-3">Level</th><th className="pr-3 text-right">Printable</th><th className="pr-3 text-right">Waiting approval</th><th className="text-right">Observation only</th>
                    </tr>
                  </thead>
                  <tbody>
                    {concepts.map(c => (
                      <tr key={c.conceptId} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 pr-3 font-mono">{c.conceptId}</td>
                        <td className="pr-3">L{c.levelNumber} {c.levelName}</td>
                        <td className={`pr-3 text-right font-bold ${c.printable === 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{c.printable}</td>
                        <td className="pr-3 text-right">{c.pending}</td>
                        <td className="text-right">{c.observedOnly}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

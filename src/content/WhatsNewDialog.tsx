import { useState } from 'react';
import type { Entry, Fix, TourStep } from '../core/whats-new/types';
import { EntryCard } from './EntryCard';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const grid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } as const;
const tab = (on: boolean) =>
  ({ minHeight: 36, padding: '0 14px', cursor: 'pointer', font: '600 13px system-ui, sans-serif', color: on ? '#0d1117' : 'inherit', background: on ? 'var(--color-accent, #34d399)' : 'none', border: on ? '1px solid transparent' : border, borderRadius: 18 }) as const;

export type WhatsNewDialogProps = {
  entries: Entry[];
  fixes: Fix[];
  consulted: string[];
  onConsult: (id: string) => void;
  onTour: (steps: TourStep[]) => void;
  onClose: () => void;
};

// Fenêtre après mise à jour : un switch Nouveautés / Corrections, une grille chacune. Toucher une nouveauté lance sa visite.
export function WhatsNewDialog({ entries, fixes, consulted, onConsult, onTour, onClose }: WhatsNewDialogProps) {
  const [seen, setSeen] = useState(() => new Set(consulted));
  const [view, setView] = useState<'news' | 'fixes'>(entries.length > 0 || fixes.length === 0 ? 'news' : 'fixes');
  const consult = (id: string) => {
    onConsult(id);
    setSeen((prev) => new Set(prev).add(id));
  };
  const open = (entry: Entry) => {
    consult(entry.id);
    if (entry.steps.length > 0) onTour(entry.steps);
  };
  const visitAll = () => {
    const todo = entries.filter((e) => !seen.has(e.id));
    todo.forEach((e) => consult(e.id));
    const steps = todo.flatMap((e) => e.steps.map((s) => ({ ...s, title: `${e.title} · ${s.title}` })));
    if (steps.length > 0) onTour(steps);
  };
  const unseenNews = entries.filter((e) => !seen.has(e.id)).length;
  const unseenFixes = fixes.filter((f) => !seen.has(f.id)).length;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Quoi de neuf"
        onClick={(event) => event.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', width: 'min(420px, 100%)', maxHeight: '100%', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Quoi de neuf</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
          <button type="button" onClick={() => setView('news')} style={tab(view === 'news')}>
            ✨ Nouveautés · {unseenNews}
          </button>
          <button type="button" onClick={() => setView('fixes')} style={tab(view === 'fixes')}>
            🔧 Corrections · {unseenFixes}
          </button>
        </div>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {view === 'news' ? (
            <div style={grid}>
              {entries.map((e) => (
                <EntryCard key={e.id} glyph={e.glyph} title={e.title} summary={e.summary} consulted={seen.has(e.id)} onClick={() => open(e)} />
              ))}
            </div>
          ) : (
            <div style={grid}>
              {fixes.map((f) => (
                <EntryCard key={f.id} glyph="✔" title={f.title} summary="" consulted={seen.has(f.id)} onClick={() => consult(f.id)} />
              ))}
            </div>
          )}
        </div>
        {view === 'news' && entries.some((e) => e.steps.length > 0) && (
          <button type="button" onClick={visitAll} style={{ marginTop: 10, minHeight: 44, cursor: 'pointer', font: '600 14px system-ui, sans-serif', color: '#0d1117', background: 'var(--color-accent, #34d399)', border: '1px solid transparent', borderRadius: 8 }}>
            Tout visiter
          </button>
        )}
      </div>
    </div>
  );
}

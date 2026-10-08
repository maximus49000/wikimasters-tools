import { useState } from 'react';
import { THEMES, type Entry, type TourStep } from '../core/whats-new/types';
import { stepsOf } from '../core/whats-new/pages';
import { EntryCard } from './EntryCard';
import { track } from '../core/telemetry/registry';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

export type WikiHowDialogProps = {
  entries: Entry[];
  consulted: string[];
  onConsult: (id: string) => void;
  onTour: (steps: TourStep[]) => void;
  onClose: () => void;
};

// WikiHow : toutes les fonctions par thème, grisées quand elles ont déjà été consultées ; toucher une carte (re)lance sa visite.
export function WikiHowDialog({ entries, consulted, onConsult, onTour, onClose }: WikiHowDialogProps) {
  const [seen, setSeen] = useState(() => new Set(consulted));
  const open = (entry: Entry) => {
    onConsult(entry.id);
    track('wikihow-fiche-lue');
    setSeen((prev) => new Set(prev).add(entry.id));
    if (entry.steps.length > 0) onTour(stepsOf(entry));
  };
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="WikiHow"
        onClick={(event) => event.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', width: 'min(420px, 100%)', maxHeight: '100%', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <strong style={{ fontSize: 16 }}>WikiHow</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7 }}>Toutes les fonctions, avec leur visite guidée. Grisé : déjà consulté.</p>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {THEMES.map((theme) => {
            const items = entries.filter((e) => e.theme === theme.id);
            if (items.length === 0) return null;
            return (
              <section key={theme.id}>
                <h3 style={{ margin: '10px 0 6px', fontSize: 12, fontWeight: 600, opacity: 0.6 }}>{theme.label}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {items.map((e) => (
                    <EntryCard key={e.id} glyph={e.glyph} title={e.title} summary={seen.has(e.id) ? 'Revoir' : e.summary} consulted={seen.has(e.id)} onClick={() => open(e)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

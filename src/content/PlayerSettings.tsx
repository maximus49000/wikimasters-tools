import { useSyncExternalStore } from 'react';
import type { PlayerSource } from './player-source';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const choice = (selected: boolean) =>
  ({
    flex: 1,
    minHeight: 44,
    cursor: 'pointer',
    font: '600 14px system-ui, sans-serif',
    color: selected ? '#0d1117' : 'inherit',
    background: selected ? 'var(--color-accent, #34d399)' : 'none',
    border: selected ? '1px solid transparent' : border,
    borderRadius: 8,
  }) as const;

// « Lecteur » : afficher ou masquer le mini-lecteur Spotify (affiché par défaut, dès que Spotify est lié).
export function PlayerSettings({ source, onClose }: { source: PlayerSource; onClose: () => void }) {
  const { enabled } = useSyncExternalStore(source.subscribe, source.current);
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Lecteur"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(360px, 100%)', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Lecteur</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <p style={{ margin: '0 0 12px', opacity: 0.8 }}>Afficher le mini-lecteur en haut à gauche. Affiché, il reste visible tant que Spotify est lié, même sans lecture.</p>
        <div role="group" aria-label="Affichage du lecteur" style={{ display: 'flex', gap: 8 }}>
          <button type="button" aria-pressed={enabled} onClick={() => source.setEnabled(true)} style={choice(enabled)}>
            Affiché
          </button>
          <button type="button" aria-pressed={!enabled} onClick={() => source.setEnabled(false)} style={choice(!enabled)}>
            Masqué
          </button>
        </div>
      </div>
    </div>
  );
}

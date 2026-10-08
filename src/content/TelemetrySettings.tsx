import { useSyncExternalStore } from 'react';
import type { Telemetry } from '../core/telemetry/telemetry';

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

// « Statistiques d'usage anonymes » : activer ou couper la mesure d'usage. Les erreurs techniques anonymes restent envoyées.
export function TelemetrySettings({ telemetry, onClose }: { telemetry: Telemetry; onClose: () => void }) {
  const enabled = useSyncExternalStore(telemetry.subscribe, telemetry.enabled);
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Statistiques d’usage anonymes"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(360px, 100%)', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Statistiques d’usage anonymes</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <p data-wmt-stats-explain="" style={{ margin: '0 0 12px', opacity: 0.8 }}>
          Activé : l’application envoie des informations anonymes pour savoir combien de personnes l’utilisent, quelles actions elles font (par exemple « lecture d’un morceau », « bande-annonce lue ») et quand une mise à jour est installée. Un identifiant aléatoire propre à cet appareil sert à compter les utilisateurs ; il n’est lié à aucun compte. Jamais envoyés : titres de cartes, pseudo, adresse, contenu des pages, recherches. Désactivé : plus rien de cela n’est envoyé. Dans les deux cas, les erreurs techniques (par exemple « limite de Wikipédia atteinte ») sont comptées sans aucun identifiant.
        </p>
        <div role="group" data-wmt-stats-choice="" aria-label="Statistiques d’usage anonymes" style={{ display: 'flex', gap: 8 }}>
          <button type="button" aria-pressed={enabled} onClick={() => telemetry.setEnabled(true)} style={choice(enabled)}>
            Activé
          </button>
          <button type="button" aria-pressed={!enabled} onClick={() => telemetry.setEnabled(false)} style={choice(!enabled)}>
            Désactivé
          </button>
        </div>
      </div>
    </div>
  );
}

import { useSyncExternalStore } from 'react';
import { track } from '../core/telemetry/registry';
import { positionSetting } from './position-setting';

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

// « Position » : autoriser l'extension à demander la position de l'appareil (météo réelle, lever et coucher du soleil de la Bibliothèque).
export function PositionSettings({ onClose }: { onClose: () => void }) {
  const enabled = useSyncExternalStore(positionSetting.subscribe, positionSetting.enabled);
  const set = (next: boolean): void => {
    positionSetting.setEnabled(next);
    track('reglage-modifie', 'position');
  };
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Position"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(360px, 100%)', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Position</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <p data-wmt-position-explain="" style={{ margin: '0 0 8px', opacity: 0.8 }}>
          À quoi ça sert : à la Bibliothèque, la position de votre appareil règle la vraie météo derrière les fenêtres et l’heure du lever et du coucher du soleil.
        </p>
        <p style={{ margin: '0 0 8px', opacity: 0.8 }}>
          Ce qui est envoyé : seulement votre position arrondie à 0,1° (environ 10 km), au relais météo de l’extension, pour obtenir la météo. Elle n’est jamais enregistrée ; elle reste en mémoire le temps de la page.
        </p>
        <p style={{ margin: '0 0 12px', opacity: 0.8 }}>
          Activé : l’appareil vous demande l’autorisation à l’ouverture de la Bibliothèque. Désactivé : plus aucune demande, la météo réelle est grisée (le ciel reste simulé) et l’heure réelle se règle sur le fuseau horaire. Si vous refusez l’autorisation dans le navigateur ou le téléphone, le résultat est le même.
        </p>
        <div role="group" data-wmt-position-choice="" aria-label="Position" style={{ display: 'flex', gap: 8 }}>
          <button type="button" aria-pressed={enabled} onClick={() => set(true)} style={choice(enabled)}>
            Activé
          </button>
          <button type="button" aria-pressed={!enabled} onClick={() => set(false)} style={choice(!enabled)}>
            Désactivé
          </button>
        </div>
      </div>
    </div>
  );
}

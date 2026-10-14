import { useSyncExternalStore } from 'react';
import { track } from '../core/telemetry/registry';
import type { SceneLocation } from '../core/library/scene-location';
import { LocationPicker } from './location-picker';
import { locationSetting } from './location-setting';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

// « Position » : lieu de la scène de la Bibliothèque (géolocalisation, ville ou désactivé) ; même réglage que le bandeau du menu ☁️.
export function PositionSettings({ onClose }: { onClose: () => void }) {
  const value = useSyncExternalStore(locationSetting.subscribe, locationSetting.get);
  const set = (next: SceneLocation): void => {
    locationSetting.set(next);
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
          À quoi ça sert : le lieu de la Bibliothèque règle la vraie météo derrière les fenêtres, le lever et le coucher du soleil, les commerces et les bus de la ville. En Ville, la scène vit aussi à l’heure de la ville choisie.
        </p>
        <p style={{ margin: '0 0 8px', opacity: 0.8 }}>
          Ce qui est envoyé : en Géolocalisation, seulement votre position arrondie à 0,1° (environ 10 km), au relais de l’extension. En Ville, les coordonnées arrondies de la ville ; la recherche envoie le texte tapé au relais, qui interroge Open-Meteo. La dernière météo reçue est gardée sur cet appareil avec sa case de 0,1°.
        </p>
        <p style={{ margin: '0 0 12px', opacity: 0.8 }}>
          Désactivé : plus aucune demande, la météo réelle est grisée (le ciel reste simulé) et l’heure suit le fuseau de l’appareil. Si vous refusez l’autorisation de position, le résultat est le même. Le même réglage s’ouvre depuis le menu ☁️ de la Bibliothèque.
        </p>
        <div data-wmt-position-choice="">
          <LocationPicker value={value} onChange={set} />
        </div>
      </div>
    </div>
  );
}

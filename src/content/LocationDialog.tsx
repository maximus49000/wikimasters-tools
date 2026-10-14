import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactElement } from 'react';
import type { SceneLocation } from '../core/library/scene-location';
import { track } from '../core/telemetry/registry';
import { DECO_DIALOG_ATTR } from './deco-dialog-guard';
import { Btn, Icon, ICONS } from './library-ui';
import { LocationPicker } from './location-picker';
import { locationSetting } from './location-setting';

// Fenêtre « Lieu de la scène » ouverte depuis le bandeau du menu ☁️ (même réglage que Paramètres › Position).
// Pas de focus automatique sur le champ : sur Android le clavier recouvrirait la fenêtre ; le conteneur prend le focus pour Échap.
export function LocationDialog({ onClose }: { onClose: () => void }): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const value = useSyncExternalStore(locationSetting.subscribe, locationSetting.get, locationSetting.get);
  const change = (next: SceneLocation): void => {
    locationSetting.set(next);
    track('reglage-modifie', 'position');
  };
  // Aucune touche ne remonte (raccourcis de la pièce, placement, zoom) ; Échap ferme. Toucher le fond ferme aussi : rien à perdre,
  // le choix est enregistré au toucher.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
  };
  return (
    <div ref={box} tabIndex={-1} {...{ [DECO_DIALOG_ATTR]: '' }} data-location-dialog="" className="wmt-lib-dialog wmt-lib-dialog-top" onKeyDown={onKeyDown} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wmt-lib-dialog-panel" role="dialog" aria-modal="true" aria-label="Lieu de la scène">
        <div className="wmt-lib-row">
          <span className="wmt-lib-sep">Lieu de la scène</span>
          <Btn label="Fermer" data={{ action: 'location-close' }} onClick={onClose}><Icon paths={ICONS.close} /></Btn>
        </div>
        <LocationPicker value={value} onChange={change} />
        <div data-location-explain="" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, opacity: 0.85 }}>
          <p style={{ margin: 0 }}>À quoi ça sert : un seul lieu pour toute la Bibliothèque. Il règle l’heure réelle, le ciel, le lever et le coucher du soleil, la météo réelle, les commerces et les bus de la ville.</p>
          <p style={{ margin: 0 }}>D’où viennent les villes : la recherche en ligne d’Open-Meteo, par le relais de l’extension, qui ne reçoit que le texte tapé. Ensuite, seules les coordonnées arrondies du lieu partent, pour la météo, les commerces et les bus.</p>
          <p style={{ margin: 0 }}>Limites : la recherche ne marche qu’en ligne, mais la ville déjà choisie reste utilisable hors ligne. Hors de France, la zone des vacances « Auto » prend la zone par défaut.</p>
        </div>
      </div>
    </div>
  );
}

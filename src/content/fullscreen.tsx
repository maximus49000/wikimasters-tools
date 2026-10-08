import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Glyph } from './Glyphs';
import { track } from '../core/telemetry/registry';

// Plein écran d'un lecteur vidéo (YouTube intégré, fichier de Commons, flux HLS de Steam) : c'est le conteneur du lecteur qui passe en plein
// écran, donc le même bouton sert à toutes les vidéos de l'application. Dans l'APK, la WebView relaie la demande à l'activité (MainActivity).
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Dans un shadow root (panneaux de la Collection), document.fullscreenElement est l'hôte : on interroge la racine de l'élément.
    const sync = () => {
      const element = ref.current;
      const owner = (element?.getRootNode?.() ?? document) as Document | ShadowRoot;
      const current = owner.fullscreenElement ?? document.fullscreenElement;
      setActive(current !== null && current !== undefined && current === element);
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggle = () => {
    const element = ref.current;
    if (!element) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    // Un site ou une WebView qui refuse le plein écran ne doit pas casser le lecteur : le refus est ignoré.
    if (!element.requestFullscreen) return;
    void Promise.resolve(element.requestFullscreen()).then(
      () => track('plein-ecran'),
      () => undefined,
    );
  };

  return { ref, active, toggle };
}

// En plein écran, le lecteur remplit tout l'écran (les tailles de la fiche ne s'appliquent plus).
export const fullscreenFrame = (active: boolean): CSSProperties => (active ? { width: '100%', height: '100%', maxHeight: 'none', aspectRatio: 'auto', borderRadius: 0, border: 0 } : {});

type Props = { active: boolean; onClick: () => void; right?: number };

// Bouton rond posé dans le coin du lecteur, à gauche du lien « ouvrir à la source ».
export function FullscreenButton({ active, onClick, right = 40 }: Props) {
  const label = active ? 'Quitter le plein écran' : 'Plein écran';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{ position: 'absolute', top: 4, right, width: 32, height: 32, padding: 0, border: 0, cursor: 'pointer', borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Glyph name="fullscreen" size={16} />
    </button>
  );
}

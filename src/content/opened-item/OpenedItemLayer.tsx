// Couche plein écran de l'objet ouvert : le boîtier (ItemCase) et ses boutons en glyphes ⓘ ✕ ⏯ (+ « ajouter un poste »).
// Paysage forcé ; si l'écran reste en hauteur, la couche est tournée de 90° en CSS.
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { Placed } from '../../core/library/library-types';
import { layerFrame, openingOf } from '../../core/library/opened-item';
import { reducedMotion } from '../ghibli-sky';
import { NO_PLAYER, noPlayer, noSubscribe } from '../ListenSection';
import { getPlayerSource } from '../music-registry';
import { ItemCase, type DiscState } from './item-case';
import type { OpenedState } from './use-opened-item';

type Props = {
  placed: Placed;
  card: { title: string; imageUrl?: string };
  cover: string | null;
  color: string;
  state: OpenedState;
  disc: DiscState;
  hasHifi: boolean;
  onInfo(): void;
  onClose(): void;
  onAddHifi(): void;
  right?: ReactNode;
  selector?: ReactNode;
};

const BUTTON: CSSProperties = {
  width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  font: '600 20px system-ui, sans-serif', color: '#FBF6EA', background: 'rgba(43,29,22,.72)', border: '1px solid rgba(251,246,234,.5)', borderRadius: '50%', padding: 0,
};

const screenSize = () => ({ w: window.innerWidth, h: window.innerHeight });

export function OpenedItemLayer({ placed, card, cover, color, state, disc, hasHifi, onInfo, onClose, selector, right, onAddHifi }: Props): ReactElement | null {
  const opening = openingOf(placed);
  const [screen, setScreen] = useState(screenSize);
  const source = getPlayerSource();
  const player = useSyncExternalStore(source?.subscribe ?? noSubscribe, source?.current ?? noPlayer);

  useEffect(() => {
    const onResize = () => setScreen(screenSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!opening) return null;
  const frame = layerFrame(screen);
  const slug = 'slug' in placed ? placed.slug : null;
  const view = source ? player : NO_PLAYER;
  const playing = view.track?.playing === true && slug !== null && view.card?.slug === slug;
  const geometry: CSSProperties = frame.rotated
    ? { top: 0, left: screen.w, width: frame.w, height: frame.h, transformOrigin: '0 0', transform: 'rotate(90deg)' }
    : { inset: 0 };

  return (
    <div data-opened-item={placed.id} style={{ position: 'absolute', zIndex: 40, overflow: 'hidden', background: 'rgba(28,18,12,.55)', ...geometry }}>
      {/* Une seule ouverture par objet : ItemCase ne calcule son état « arrivé » qu'au montage. */}
      <ItemCase key={state.placedId} opening={opening} phase={state.phase} from={state.from} to={state.to} cover={cover} color={color} title={card.title}
        disc={disc} reduced={reducedMotion()} selector={selector} right={right} />
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 8 }}>
        {playing && <button type="button" data-action="toggle" aria-label="Lecture / pause" title="Lecture / pause" onClick={() => void source?.toggle()} style={BUTTON}>⏯</button>}
        {!hasHifi && <button type="button" data-action="add-hifi" aria-label="Ajouter une chaîne hi-fi" title="Ajouter une chaîne hi-fi" onClick={onAddHifi} style={BUTTON}>📻</button>}
        <button type="button" data-action="info" aria-label="Fiche de la carte" title="Fiche de la carte" onClick={onInfo} style={BUTTON}>ⓘ</button>
        <button type="button" data-action="close" aria-label="Fermer" title="Fermer" onClick={onClose} style={BUTTON}>✕</button>
      </div>
    </div>
  );
}

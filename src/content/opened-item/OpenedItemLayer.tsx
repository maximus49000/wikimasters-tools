// Couche plein écran de l'objet ouvert : le boîtier (ItemCase) et ses boutons en glyphes ⓘ ✕ ⏯ (+ « ajouter un poste »).
// Paysage forcé ; si l'écran reste en hauteur, la couche est tournée de 90° en CSS.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { Placed } from '../../core/library/library-types';
import { boxInLayer, flightTarget, layerFrame, openingOf } from '../../core/library/opened-item';
import type { Box } from '../../core/library/zoom-target';
import { reducedMotion } from '../ghibli-sky';
import { NO_PLAYER, noPlayer, noSubscribe } from '../ListenSection';
import { getPlayerSource } from '../music-registry';
import type { BoxFormat } from '../../core/game/platform-boxes';
import { gameDiscKind, type DiscKind } from '../hifi/hifi-art';
import { DiscFlight, flightBoxOf } from './disc-flight';
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
  // Vol du disque vers le poste : `target` = le disque posé sur le poste, dans le repère de la scène (null : non mesurable).
  // Un nouvel `id` relance un vol. Le plateau doit alors être en `disc="flying"`.
  flight?: { id: number; target: Box | null; onLanded(): void } | null;
  // Jeu : gabarit de la console (dimensions de la boîte, disque ou cartouche) et couleur de son plastique.
  format?: BoxFormat;
  caseColor?: string;
};

// Disque du plateau quand il n'est pas mesurable (tests, rendu hors écran) : à droite du centre, à peu près où le boîtier le pose.
const fallbackDisc = (frame: { w: number; h: number }): Box => ({ x: frame.w / 2 + frame.h * 0.08, y: frame.h * 0.15, w: frame.h * 0.7, h: frame.h * 0.7 });
const boxOfRect = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });

const BUTTON: CSSProperties = {
  width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  font: '600 20px system-ui, sans-serif', color: '#FBF6EA', background: 'rgba(43,29,22,.72)', border: '1px solid rgba(251,246,234,.5)', borderRadius: '50%', padding: 0,
};

const screenSize = () => ({ w: window.innerWidth, h: window.innerHeight });

// Ce qui vole au poste : vinyle, cartouche (jeu à cartouche), disque de jeu ou CD.
function flightKindOf(opening: string | null, format: BoxFormat | undefined): DiscKind {
  if (opening === 'vinyl-sleeve') return 'vinyl';
  if (opening !== 'game-case') return 'cd';
  return gameDiscKind(format);
}

export function OpenedItemLayer({ placed, card, cover, color, state, disc, hasHifi, onInfo, onClose, selector, right, onAddHifi, flight = null, format, caseColor }: Props): ReactElement | null {
  const opening = openingOf(placed);
  const kind = flightKindOf(opening, format);
  const [screen, setScreen] = useState(screenSize);
  const source = getPlayerSource();
  const player = useSyncExternalStore(source?.subscribe ?? noSubscribe, source?.current ?? noPlayer);

  const layerRef = useRef<HTMLDivElement>(null);
  // Trajet du disque, mesuré une fois au départ du vol (repère du calque) : du plateau au poste.
  const [path, setPath] = useState<{ id: number; from: Box; to: Box } | null>(null);
  const flightId = flight?.id ?? null;
  const flightRef = useRef(flight);
  flightRef.current = flight;
  useLayoutEffect(() => {
    const f = flightRef.current;
    const el = layerRef.current;
    if (!f || !el) { setPath(null); return; }
    const fr = layerFrame(screenSize());
    const discRect = el.querySelector('[data-case-disc]')?.getBoundingClientRect();
    const from = flightBoxOf(kind, discRect && discRect.width > 0 ? boxInLayer(boxOfRect(discRect), boxOfRect(el.getBoundingClientRect()), fr.rotated) : fallbackDisc(fr));
    // La cible est dans le repère de la scène, qui couvre l'écran : le calque, droit ou tourné, y occupe tout l'écran.
    const target = boxInLayer(f.target, { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }, fr.rotated);
    setPath({ id: f.id, from, to: flightTarget(target, fr, from.w * 0.3) });
  }, [flightId]);

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
  // Rectangles du boîtier (repère de la scène) ramenés au repère du calque, tourné ou non.
  const whole = { x: 0, y: 0, w: screen.w, h: screen.h };
  const from = boxInLayer(state.from, whole, frame.rotated);
  const to = boxInLayer(state.to, whole, frame.rotated);
  const geometry: CSSProperties = frame.rotated
    ? { top: 0, left: screen.w, width: frame.w, height: frame.h, transformOrigin: '0 0', transform: 'rotate(90deg)' }
    : { inset: 0 };

  return (
    <div ref={layerRef} data-opened-item={placed.id} style={{ position: 'absolute', zIndex: 40, overflow: 'hidden', background: 'rgba(28,18,12,.55)', ...geometry }}>
      {/* Une seule ouverture par objet : ItemCase ne calcule son état « arrivé » qu'au montage. */}
      <ItemCase key={state.placedId} opening={opening} phase={state.phase} from={from} to={to} cover={cover} color={color} title={card.title}
        disc={disc} reduced={reducedMotion()} selector={selector} right={right} {...(format ? { format } : {})} {...(caseColor ? { caseColor } : {})} />
      {/* Le disque vole par-dessus le boîtier, qui reste ouvert en grand. */}
      {flight && path && path.id === flight.id && (
        <DiscFlight key={path.id} from={path.from} to={path.to} cover={cover} color={color} kind={kind}
          reduced={reducedMotion()} onLanded={() => flightRef.current?.onLanded()} />
      )}
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 8 }}>
        {playing && <button type="button" data-action="toggle" aria-label="Lecture / pause" title="Lecture / pause" onClick={() => void source?.toggle()} style={BUTTON}>⏯</button>}
        {!hasHifi && <button type="button" data-action="add-hifi" aria-label="Ajouter une chaîne hi-fi" title="Ajouter une chaîne hi-fi" onClick={onAddHifi} style={BUTTON}>📻</button>}
        <button type="button" data-action="info" aria-label="Fiche de la carte" title="Fiche de la carte" onClick={onInfo} style={BUTTON}>ⓘ</button>
        <button type="button" data-action="close" aria-label="Fermer" title="Fermer" onClick={onClose} style={BUTTON}>✕</button>
      </div>
    </div>
  );
}

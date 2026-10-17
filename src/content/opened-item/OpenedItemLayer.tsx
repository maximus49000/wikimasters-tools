// Couche plein écran de l'objet ouvert : le boîtier (ItemCase) et ses boutons en glyphes ⓘ ✕ ⏯ (+ « ajouter un poste »),
// et pour un jeu ⟲ au-dessus de la boîte, qui la retourne (dos | tranche | devant), puis 🔍 sur le dos, la loupe.
// Paysage forcé ; si l'écran reste en hauteur, la couche est tournée de 90° en CSS.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MutableRefObject, type ReactElement, type ReactNode } from 'react';
import type { Placed } from '../../core/library/library-types';
import { boxInLayer, flightTarget, layerFrame, openingOf } from '../../core/library/opened-item';
import type { Box } from '../../core/library/zoom-target';
import { reducedMotion } from '../ghibli-sky';
import { NO_PLAYER, noPlayer, noSubscribe } from '../ListenSection';
import { getPlayerSource } from '../music-registry';
import { BOX_FORMATS, type BoxFormat } from '../../core/game/platform-boxes';
import type { GameBox } from '../game-box-service';
import { gameDiscKind, type DiscKind } from '../hifi/hifi-art';
import { BackMagnifier } from './back-magnifier';
import { DiscFlight, flightBoxOf } from './disc-flight';
import { GameOutside } from './game-outside';
import { gameGeometry, ItemCase, openCaseLayout, type DiscState } from './item-case';
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
  // Jeu : la boîte connue du service (scans, captures, logo, description), pour la face extérieure ; absente, un repli.
  box?: GameBox;
  // La boîte vient d'être retournée (true) ou remise à l'endroit : l'appelant arrête la vidéo éventuelle.
  onFlip?(flipped: boolean): void;
  // Retour Android / navigateur : la couche y range de quoi fermer d'abord la loupe (rend vrai si elle l'a fermée) ; l'appelant
  // l'appelle depuis onBeforeClose de useOpenedItem, pour que le retour ferme la loupe sans fermer la boîte.
  backRef?: MutableRefObject<(() => boolean) | null>;
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

export function OpenedItemLayer({ placed, card, cover, color, state, disc, hasHifi, onInfo, onClose, selector, right, onAddHifi, flight = null, format, caseColor, box, onFlip, backRef }: Props): ReactElement | null {
  const opening = openingOf(placed);
  const [flipped, setFlipped] = useState(false);
  // Loupe sur le dos : seulement boîte retournée.
  const [magnified, setMagnified] = useState(false);
  const magnifiedRef = useRef(magnified);
  magnifiedRef.current = magnified;
  // Un autre objet ouvert repart à l'endroit, loupe fermée.
  useEffect(() => { setFlipped(false); setMagnified(false); }, [state.placedId]);
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (!magnifiedRef.current) return false;
      setMagnified(false);
      return true;
    };
    return () => { backRef.current = null; };
  }, [backRef]);
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
    // Loupe ouverte : Échap la ferme (elle écoute elle-même), pas la boîte.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !magnifiedRef.current) onClose(); };
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
  // Jeu : face extérieure (dos | tranche | devant) et bouton ⟲ centré au-dessus de la boîte, dans le repère du calque (tourné ou non).
  const game = opening === 'game-case';
  const fmt = format ?? 'generic';
  const out = game && flipped;
  const front = box?.frontUrl ?? cover;
  const outBox: GameBox | null = !game ? null : {
    ...(box ?? { style: { plastic: caseColor ?? BOX_FORMATS[fmt].plastic, band: BOX_FORMATS[fmt].band }, platformName: '', shots: [], title: card.title }),
    format: fmt, ...(front ? { frontUrl: front } : {}),
  };
  const place = openCaseLayout(opening, fmt, frame.w, frame.h);
  const flip = () => { const next = !flipped; setFlipped(next); if (!next) setMagnified(false); onFlip?.(next); };
  const geometry: CSSProperties = frame.rotated
    ? { top: 0, left: screen.w, width: frame.w, height: frame.h, transformOrigin: '0 0', transform: 'rotate(90deg)' }
    : { inset: 0 };

  return (
    <div ref={layerRef} data-opened-item={placed.id} style={{ position: 'absolute', zIndex: 40, overflow: 'hidden', background: 'rgba(28,18,12,.55)', ...geometry }}>
      {/* Une seule ouverture par objet : ItemCase ne calcule son état « arrivé » qu'au montage. */}
      <ItemCase key={state.placedId} opening={opening} phase={state.phase} from={from} to={to} cover={cover} color={color} title={card.title}
        disc={disc} reduced={reducedMotion()} selector={selector} size={frame} {...(format ? { format } : {})} {...(caseColor ? { caseColor } : {})}
        // Retournée : la vidéo s'arrête (démontée) et le disque revient dans le plateau.
        {...(right !== undefined && !out ? { right } : {})}
        {...(outBox ? { outside: <GameOutside box={outBox} geometry={gameGeometry(fmt)} onMagnify={() => setMagnified(true)} />, flipped } : {})} />
      {game && state.phase !== 'closing' && (
        <button type="button" data-action="flip" aria-label={flipped ? 'Voir l’intérieur de la boîte' : 'Retourner la boîte'} title={flipped ? 'Voir l’intérieur' : 'Retourner la boîte'} onClick={flip}
          style={{ ...BUTTON, position: 'absolute', left: Math.round(place.x - 22), top: Math.max(4, Math.round(place.y - 44 - 6)), font: '600 24px system-ui, sans-serif' }}>⟲</button>
      )}
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
      {/* Loupe par-dessus tout : ✕ ramène à la boîte retournée. */}
      {out && magnified && outBox && state.phase !== 'closing' && <BackMagnifier box={outBox} onClose={() => setMagnified(false)} />}
    </div>
  );
}

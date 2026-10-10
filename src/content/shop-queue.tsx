import { useMemo, useReducer, useRef, type ReactElement } from 'react';
import type { YMD } from '../core/library/city/calendar';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import { SHOP_DEFS } from '../core/library/city/shops/catalog';
import { isOpenAt } from '../core/library/city/shops/hours';
import { ADVANCE_S, nightclubDoor, queueAt } from '../core/library/city/shops/queue';
import type { ShopFrame } from '../core/library/city/shops/slots';
import type { ShopView } from '../core/library/city/shops/view';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';
import { useWallClockLoop } from './use-wallclock-loop';

// Boîte de nuit (vague 1b-iv-b) : cordon (deux potelets et une corde) devant la porte, deux videurs en costume noir, bras
// croisés, de part et d'autre, et une file de 0 à 6 personnes (queue.ts) alignée le long de la façade, du côté de la vitrine,
// tournée vers la porte. La file avance avec une petite boucle d'animation propre (positions écrites sur `transform`) ;
// elle ne re-rend que quand quelqu'un entre (toutes les 15 à 30 s). Aucun id SVG.

const OPEN_MIN = 23 * 60; // ouverture (catalog.ts) : sert à savoir si ce soir est un soir d'ouverture
const QUEUE_START = 12; // px (à unit = 1) de la porte à la première personne
const QUEUE_PITCH = 6.5; // px entre deux personnes de la file
const BOUNCER_DX = 5.5; // px de la porte à chaque videur
const CORDON = [8, 28] as const; // potelets, px de la porte, côté file
const QUEUE_FRAME_MS = 50;
const STILL_QUEUE = 3; // mouvement réduit : 3 personnes immobiles

export type QueueFrame = {
  // `pos` : place dans la file (0 = devant la porte), fractionnaire pendant l'avancée d'un cran ; la dernière arrive en fondu.
  members: { id: string; outfitKey: string; pos: number; opacity: number }[];
  // Celle qui vient d'entrer : de la place 0 à la porte, en s'effaçant (p : 0..1).
  ghost: { id: string; outfitKey: string; p: number } | null;
};

// `t` : secondes relatives à la session (voir queueAt), jamais une heure Unix.
export function queueFrame(seed: number, slotId: string, t: number, minutes: number, isOpen: boolean): QueueFrame {
  const q = queueAt(seed, slotId, t, minutes, isOpen);
  const members = q.map((m, i) => ({ id: m.id, outfitKey: m.outfitKey, pos: i + (1 - m.fade), opacity: i === q.length - 1 && m.fade < 1 ? m.fade : 1 }));
  const prev = queueAt(seed, slotId, t - ADVANCE_S, minutes, isOpen)[0];
  const ghost = prev && prev.entersAt <= t && prev.id !== q[0]?.id ? { id: prev.id, outfitKey: prev.outfitKey, p: Math.min(0.999, Math.max(0, (t - prev.entersAt) / ADVANCE_S)) } : null;
  return { members, ghost };
}

// Cordon et videurs : seulement les soirs d'ouverture (de 22 h 30 à la fermeture), jamais pendant un chantier ou un déménagement.
export function clubDoorAt(view: ShopView, date: YMD, minutes: number): { open: boolean } | null {
  if (view.sign?.type !== 'nightclub' || view.phase === 'works' || view.works || view.moving) return null;
  const open = view.phase === 'open';
  if (!open && !isOpenAt(SHOP_DEFS.nightclub, date, OPEN_MIN)) return null;
  return nightclubDoor(open, minutes).cordon ? { open } : null;
}

const STILL_FRAME = (slotId: string): QueueFrame => ({
  members: Array.from({ length: STILL_QUEUE }, (_, i) => ({ id: `still-${i}`, outfitKey: `queue-${hashString(`${slotId}/still/${i}`) % 12}`, pos: i, opacity: 1 })),
  ghost: null,
});
const signature = (f: QueueFrame): string => `${f.members.map((m) => m.id).join(',')}|${f.ghost?.id ?? ''}`;

// Videur : costume noir, bras croisés sur la poitrine.
const BOUNCER_SUIT = '#141418';
function bouncerOutfit(seed: number, slotId: string, i: number): Outfit {
  const o = outfitFor('suit', mulberry32(seed ^ hashString(`${slotId}/bouncer/${i}`)));
  return { ...o, top: 'suit', topColor: BOUNCER_SUIT, bottom: 'pants', bottomColor: BOUNCER_SUIT, hair: i === 0 ? 'bald' : 'short', accessory: 'none' };
}
function CrossedArms({ outfit, sky }: { outfit: Outfit; sky: Sky }): ReactElement {
  return (
    <g data-crossed-arms="">
      <rect x={-5.6} y={-23.5} width={11.2} height={3.4} rx={1.6} fill={tone('#202026', sky)} />
      <circle cx={-4.6} cy={-21.8} r={1.2} fill={tone(outfit.skin, sky)} />
      <circle cx={4.6} cy={-21.8} r={1.2} fill={tone(outfit.skin, sky)} />
    </g>
  );
}
function CordonSprite({ x0, x1, y, k, sky }: { x0: number; x1: number; y: number; k: number; sky: Sky }): ReactElement {
  const post = (x: number): ReactElement => (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})`}>
      <ellipse cx={0} cy={0} rx={2.2} ry={0.7} fill={tone('#B8973A', sky)} />
      <rect x={-0.6} y={-13} width={1.2} height={13} fill={tone('#D4B04A', sky)} />
      <circle cx={0} cy={-13.4} r={1} fill={tone('#E8C860', sky)} />
    </g>
  );
  const top = y - 12.6 * k;
  const mid = (x0 + x1) / 2;
  return (
    <g data-cordon="">
      <path d={`M${x0.toFixed(1)} ${top.toFixed(1)} Q${mid.toFixed(1)} ${(top + 4 * k).toFixed(1)} ${x1.toFixed(1)} ${top.toFixed(1)}`} stroke={tone('#A0182E', sky)} strokeWidth={1.1 * k} fill="none" />
      {post(x0)}
      {post(x1)}
    </g>
  );
}

type ClubProps = {
  view: ShopView;
  frame: ShopFrame;
  metrics: CityMetrics;
  minutes: number;
  date: YMD;
  reduced: boolean;
  sky: Sky;
  seed: number;
  // Début de la session (s, horloge murale) : la file avance en temps relatif à la session (contrat de queueAt).
  sessionT0: number;
};

export function NightclubDoor({ view, frame, metrics, minutes, date, reduced, sky, seed, sessionT0 }: ClubProps): ReactElement | null {
  const id = view.slot.id;
  const door = clubDoorAt(view, date, minutes);
  const isOpen = door?.open ?? false;
  const root = useRef<SVGGElement | null>(null);
  const shown = useRef('');
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const u = metrics.unit;
  const k = u * STREET_SCALE.person;
  const doorX = frame.door.x + frame.door.w / 2;
  // La file s'étire du côté de la vitrine ; les gens regardent la porte.
  const away: 1 | -1 = frame.window.x + frame.window.w / 2 < doorX ? -1 : 1;
  const y = metrics.doorY + (metrics.walkY - metrics.doorY) * 0.3;
  const slotX = (pos: number): number => doorX + away * (QUEUE_START + pos * QUEUE_PITCH) * u;
  const memberTransform = (pos: number): string => `translate(${slotX(pos).toFixed(1)} ${y.toFixed(1)}) scale(${(-away * k).toFixed(3)} ${k.toFixed(3)})`;
  const ghostTransform = (p: number): string => `translate(${(slotX(0) + (doorX - slotX(0)) * p).toFixed(1)} ${y.toFixed(1)}) scale(${(-away * k).toFixed(3)} ${k.toFixed(3)})`;
  const outfits = useMemo(() => new Map<string, Outfit>(), []);
  const outfitOf = (key: string): Outfit => {
    let o = outfits.get(key);
    if (!o) {
      o = outfitFor(hashString(key) % 5 === 0 ? 'suit' : 'ordinary', mulberry32(seed ^ hashString(`${id}/${key}`)));
      outfits.set(key, o);
    }
    return o;
  };
  const frameAt = (now: number): QueueFrame => (reduced ? (isOpen ? STILL_FRAME(id) : { members: [], ghost: null }) : queueFrame(seed, id, now - sessionT0, minutes, isOpen));
  // Boucle : avancée des personnes (transform, opacité) ; un re-rendu seulement quand la file change de composition.
  const place = useMemo(
    () =>
      (now: number): void => {
        const el = root.current;
        if (!el || reduced || !isOpen) return;
        const f = frameAt(now);
        if (signature(f) !== shown.current) {
          refresh();
          return;
        }
        for (const m of f.members) {
          const node = el.querySelector(`[data-queue-id="${m.id}"]`);
          if (!node) continue;
          node.setAttribute('transform', memberTransform(m.pos));
          node.setAttribute('opacity', m.opacity.toFixed(2));
        }
        if (f.ghost) {
          const node = el.querySelector(`[data-queue-id="${f.ghost.id}"]`);
          node?.setAttribute('transform', ghostTransform(f.ghost.p));
          node?.setAttribute('opacity', (1 - f.ghost.p).toFixed(2));
        }
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduced, isOpen, seed, id, minutes, sessionT0, doorX, away, y, k],
  );
  useWallClockLoop(place, [place], { frameMs: QUEUE_FRAME_MS });
  if (!door) return null;
  const f = frameAt(Date.now() / 1000);
  shown.current = signature(f);
  const bouncers = [0, 1].map((i) => bouncerOutfit(seed, id, i));
  return (
    <g data-nightclub={id} data-club-open={isOpen ? 'true' : 'false'} ref={root}>
      {f.ghost && (
        <g key={f.ghost.id} data-queue-id={f.ghost.id} data-queue-entering="" transform={ghostTransform(f.ghost.p)} opacity={(1 - f.ghost.p).toFixed(2)}>
          <PersonSprite outfit={outfitOf(f.ghost.outfitKey)} sky={sky} rainy={false} umbrella={false} />
        </g>
      )}
      {/* De la dernière à la première : celle qui est devant la porte est dessinée par-dessus. */}
      {[...f.members].reverse().map((m) => (
        <g key={m.id} data-queue-id={m.id} data-queue-member="" transform={memberTransform(m.pos)} opacity={m.opacity.toFixed(2)}>
          <PersonSprite outfit={outfitOf(m.outfitKey)} sky={sky} rainy={false} umbrella={false} />
        </g>
      ))}
      {bouncers.map((o, i) => {
        const side = i === 0 ? away : (-away as 1 | -1);
        return (
          <g key={i} data-bouncer="" transform={`translate(${(doorX + side * BOUNCER_DX * u).toFixed(1)} ${(metrics.doorY + 1).toFixed(1)}) scale(${(side * k * 1.05).toFixed(3)} ${(k * 1.05).toFixed(3)})`}>
            <PersonSprite outfit={o} sky={sky} rainy={false} umbrella={false} />
            <CrossedArms outfit={o} sky={sky} />
          </g>
        );
      })}
      <CordonSprite x0={doorX + away * CORDON[0] * u} x1={doorX + away * CORDON[1] * u} y={y + 2 * u} k={k} sky={sky} />
    </g>
  );
}

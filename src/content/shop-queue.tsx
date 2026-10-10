import { useMemo, useReducer, useRef, type ReactElement } from 'react';
import type { YMD } from '../core/library/city/calendar';
import { DOOR_WIDTH, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import { SHOP_DEFS } from '../core/library/city/shops/catalog';
import { isOpenAt } from '../core/library/city/shops/hours';
import { ADVANCE_S, nightclubDoor, queueAt } from '../core/library/city/shops/queue';
import type { ShopFrame, ShopSlot } from '../core/library/city/shops/slots';
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
const QUEUE_START = 9; // px (à unit = 1) de la porte à la première personne (juste derrière le videur)
const QUEUE_PITCH = 6.5; // px entre deux personnes de la file, quand la façade le permet…
export const MIN_PITCH = 4.4; // … resserrés jusque-là sinon (en dessous, les silhouettes se confondent : on en montre moins)
const MAX_QUEUE = 6;
const BOUNCER_DX = 5.5; // px de la porte à chaque videur
const CORDON_FROM = 7; // premier potelet, px de la porte ; le second au niveau de la 3e personne (au plus à l'entrée des habitants)
const QUEUE_FRAME_MS = 50;
const STILL_QUEUE = 3; // mouvement réduit : 3 personnes immobiles

export type QueueFrame = {
  // `pos` : place dans la file (0 = devant la porte), fractionnaire pendant l'avancée d'un cran ; la dernière arrive en fondu.
  members: { id: string; outfitKey: string; pos: number; opacity: number }[];
  // Celle qui vient d'entrer : de la place 0 à la porte, en s'effaçant (p : 0..1).
  ghost: { id: string; outfitKey: string; p: number } | null;
};

// `t` : secondes relatives à la session (voir queueAt), jamais une heure Unix. `max` : nombre de personnes que la façade peut
// montrer (queueLayout) ; les suivantes attendent hors de la vue, la dernière visible arrive en fondu.
export function queueFrame(seed: number, slotId: string, t: number, minutes: number, isOpen: boolean, max = MAX_QUEUE): QueueFrame {
  const q = queueAt(seed, slotId, t, minutes, isOpen).slice(0, Math.max(0, max));
  const members = q.map((m, i) => ({ id: m.id, outfitKey: m.outfitKey, pos: i + (1 - m.fade), opacity: i === q.length - 1 && m.fade < 1 ? m.fade : 1 }));
  const prev = queueAt(seed, slotId, t - ADVANCE_S, minutes, isOpen)[0];
  const ghost = prev && prev.entersAt <= t && prev.id !== q[0]?.id ? { id: prev.id, outfitKey: prev.outfitKey, p: Math.min(0.999, Math.max(0, (t - prev.entersAt) / ADVANCE_S)) } : null;
  return { members, ghost };
}

// Géométrie de la file : elle s'étire du côté de la vitrine (les gens regardent la porte), jusqu'à l'entrée des habitants de
// l'immeuble au plus (`reach`, en positions de file). Une façade étroite montre moins de monde (`max`, de 1 à 6) plutôt qu'un
// paquet de silhouettes : jamais moins de MIN_PITCH entre deux personnes, la dernière ne dépasse pas l'entrée des habitants.
export type QueueLayout = { doorX: number; away: 1 | -1; pitch: number; max: number; reach: number };
export function queueLayout(slot: ShopSlot, frame: ShopFrame, unit: number): QueueLayout {
  const doorX = frame.door.x + frame.door.w / 2;
  const away: 1 | -1 = frame.window.x + frame.window.w / 2 < doorX ? -1 : 1;
  const run = (away < 0 ? doorX - (slot.residentDoorX + DOOR_WIDTH) : slot.residentDoorX - doorX) / unit;
  // Entrée des habitants de l'autre côté de la porte (ne se produit pas avec les locaux actuels) : aucune limite.
  if (run <= 0) return { doorX, away, pitch: QUEUE_PITCH, max: MAX_QUEUE, reach: Infinity };
  const room = Math.max(0, run - QUEUE_START);
  const max = Math.min(MAX_QUEUE, Math.floor(room / MIN_PITCH + 1e-9) + 1);
  const pitch = max > 1 ? Math.min(QUEUE_PITCH, room / (max - 1)) : QUEUE_PITCH;
  return { doorX, away, pitch, max, reach: room / pitch };
}

// Cordon et videurs : seulement les soirs d'ouverture (de 22 h 30 à la fermeture), jamais pendant un chantier ou un déménagement.
export function clubDoorAt(view: ShopView, date: YMD, minutes: number): { open: boolean } | null {
  if (view.sign?.type !== 'nightclub' || view.phase === 'works' || view.works || view.moving) return null;
  const open = view.phase === 'open';
  if (!open && !isOpenAt(SHOP_DEFS.nightclub, date, OPEN_MIN)) return null;
  return nightclubDoor(open, minutes).cordon ? { open } : null;
}

const STILL_FRAME = (slotId: string, max: number): QueueFrame => ({
  members: Array.from({ length: Math.min(STILL_QUEUE, max) }, (_, i) => ({ id: `still-${i}`, outfitKey: `queue-${hashString(`${slotId}/still/${i}`) % 12}`, pos: i, opacity: 1 })),
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
  const { doorX, away, pitch, max, reach } = queueLayout(view.slot, frame, u);
  const y = metrics.doorY + (metrics.walkY - metrics.doorY) * 0.3;
  const slotX = (pos: number): number => doorX + away * (QUEUE_START + pos * pitch) * u;
  const memberTransform = (pos: number): string => `translate(${slotX(pos).toFixed(1)} ${y.toFixed(1)}) scale(${(-away * k).toFixed(3)} ${k.toFixed(3)})`;
  const ghostTransform = (p: number): string => `translate(${(slotX(0) + (doorX - slotX(0)) * p).toFixed(1)} ${y.toFixed(1)}) scale(${(-away * k).toFixed(3)} ${k.toFixed(3)})`;
  // Cache des tenues (effet de bord idempotent pendant le rendu : une même clé donne toujours la même tenue).
  const outfits = useMemo(() => new Map<string, Outfit>(), [seed, id]);
  const outfitOf = (key: string): Outfit => {
    let o = outfits.get(key);
    if (!o) {
      o = outfitFor(hashString(key) % 5 === 0 ? 'suit' : 'ordinary', mulberry32(seed ^ hashString(`${id}/${key}`)));
      outfits.set(key, o);
    }
    return o;
  };
  const frameAt = (now: number): QueueFrame => (reduced ? (isOpen ? STILL_FRAME(id, max) : { members: [], ghost: null }) : queueFrame(seed, id, now - sessionT0, minutes, isOpen, max));
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
    [reduced, isOpen, seed, id, minutes, sessionT0, doorX, away, pitch, max, y, k],
  );
  useWallClockLoop(place, [place], { frameMs: QUEUE_FRAME_MS });
  if (!door) return null;
  const f = frameAt(Date.now() / 1000);
  // Effet de bord idempotent pendant le rendu : la boucle compare la composition de la file à celle qui est affichée.
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
      <CordonSprite x0={doorX + away * CORDON_FROM * u} x1={slotX(Math.min(2.3, reach))} y={y + 2 * u} k={k} sky={sky} />
    </g>
  );
}

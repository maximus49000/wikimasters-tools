import { useMemo, type ReactElement } from 'react';
import { isoDate, type YMD } from '../core/library/city/calendar';
import { MAX_TRIP_PX } from '../core/library/city/doors';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit, type Profile } from '../core/library/city/people';
import { SHOP_DEFS, type ShopTypeId } from '../core/library/city/shops/catalog';
import { visitAt, visitHappens, type Visit } from '../core/library/city/shops/customers';
import { ACCESSORY, SHOP_FAMILY, gestureAt, takesAway, type Pose } from '../core/library/city/shops/gestures';
import { crowdAt, dayNumber } from '../core/library/city/shops/hours';
import type { Change, SlotDay } from '../core/library/city/shops/lifecycle';
import type { ShopFrame } from '../core/library/city/shops/slots';
import { WALK_MIN, shutterAt, staffAt, staffShiftsAt, type StaffShift, type StaffState } from '../core/library/city/shops/staff';
import { changePlans, type ShopView } from '../core/library/city/shops/view';
import { WORK_STEPS, type WorkStep } from '../core/library/city/shops/works';
import { WORLD_MARGIN, hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { PersonSprite } from './city-sprites';
import { AccessorySprite, LIFTING, PosedPerson, STANDING, applyPose, poseHandles, showCarry, type PoseHandles } from './shop-gesture-sprites';
import { LIT_SKY, ShopInteriorFront } from './shop-interiors';
import { NightclubDoor } from './shop-queue';
import { CarriedPlacard, CarriedSign, LadderSprite, RollingShutter, SHUTTER_S, type ShutterState, type WorkerPose } from './shop-sprites';
import { ShopTerrace, type TerraceSky } from './shop-terrace';

// Vie des commerces dans le calque animé de la Ville (vague 1b-iv-a) : clients qui entrent, restent derrière la vitrine et
// ressortent ; équipe du chantier du matin (deux ouvriers, une échelle, l'ancienne et la nouvelle enseigne). Vague 1b-iv-b :
// le personnel (StaffLayer) arrive à pied, lève le rideau roulant, travaille, se relaie, baisse le rideau et repart ; clients et
// employés font le geste de la famille du commerce (poses écrites par la boucle, voir shop-gesture-sprites.tsx) ; devant la
// façade (ShopOutdoors) : terrasse des bars et restaurants (shop-terrace.tsx), cordon, videurs et file de la boîte (shop-queue.tsx).
// Clients : DEUX nœuds par visite, l'un sur le trottoir (stades « in » et « out »), l'autre dans un <svg> imbriqué posé sur la
// vitrine (stade « inside », rogné sans clipPath ni id) ; la boucle d'animation de CityLifeLayer active l'un ou l'autre
// (placeCustomers). Équipe : rendue à la minute (re-rendu React), déplacée par une transition CSS de 30 s entre deux minutes.

// Taille d'un client derrière la vitrine : celle du vendeur (0,5) un peu réduite, pour que la tête tienne dans la vitrine
// (21 px de haut) quand il se tient au bord du sol (bas de la vitrine − 3).
const INSIDE_SCALE = 0.45;
const INSIDE_DY = 3;
// Repère de l'équipe (px du monde) : pieds de l'ouvrier sur l'échelle sous le haut de l'enseigne, objets tenus à bout de bras
// (au-dessus de la tête) ou à hauteur de taille ; écart entre les deux ouvriers ; distance hors champ d'où ils viennent.
const ON_LADDER_DY = 18;
const ARMS_UP = 24;
const WAIST = 8;
const CREW_GAP = 10;
const OFFSTAGE = 30;
const WORKER_MOVE = 'transform 30s linear';

export const setIfChanged = (node: Element, name: string, value: string): void => {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
};

// ---------- Clients ----------
export type CustomerState = { on: boolean; inside: boolean; x: number; fade: number; gesture: Pose | null; carry: boolean };

// Présence d'une visite à l'instant t : en route (ou dans le magasin) et tirée pour ce tour de cycle, local ouvert (gate > 0).
// Dans le magasin, le client fait le geste de la famille ; en ressortant, il porte un petit objet si la famille s'y prête.
export function customerState(v: Visit, gate: number, width: number, t: number): CustomerState {
  const pos = visitAt(v, width, t);
  const on = pos !== null && gate > 0 && visitHappens(v, t, gate);
  return { on, inside: pos?.stage === 'inside', x: pos?.x ?? v.doorX, fade: on && pos ? pos.fade : 0, gesture: pos?.gesture ?? null, carry: pos?.carry ?? false };
}

// Fauteuil et table : le client est assis.
const seatedFor = (type: ShopTypeId | null): boolean => type !== null && (SHOP_FAMILY[type] === 'chair' || SHOP_FAMILY[type] === 'table');
// Objet emporté sur le trottoir : tenu à la main, bras le long du corps.
const CARRY_AT = 'translate(4 -15)';

const sidewalkTransform = (v: Visit, x: number, m: CityMetrics): string => {
  const k = m.unit * STREET_SCALE.person * v.scale;
  return `translate(${x.toFixed(1)} ${m.doorY.toFixed(1)}) scale(${(v.dir * k).toFixed(3)} ${k.toFixed(3)})`;
};
// À sa place (comptoir, rayon, fauteuil, table : `seat`), tourné vers le centre de la vitrine.
const insideTransform = (v: Visit, f: ShopFrame, shift = 0): string => {
  const k = INSIDE_SCALE * v.scale;
  return `translate(${(v.seat.x - f.window.x).toFixed(1)} ${(f.window.h - shift - INSIDE_DY).toFixed(1)}) scale(${(v.seat.facing * k).toFixed(3)} ${k.toFixed(3)})`;
};
const insideId = (v: Visit): string => `${v.id}-in`;

// Placement par la boucle : n'écrire que ce qui change (la plupart des clients sont absents la plupart du temps).
export function placeCustomers(nodes: Map<string, SVGGElement>, visits: Visit[], gates: Map<string, number>, width: number, m: CityMetrics, t: number, first: boolean): void {
  for (const v of visits) {
    const s = customerState(v, gates.get(v.slotId) ?? 0, width, t);
    const out = nodes.get(v.id);
    if (out) {
      const on = s.on && !s.inside;
      setIfChanged(out, 'data-active', on ? 'true' : 'false');
      setIfChanged(out, 'opacity', (on ? s.fade : 0).toFixed(2));
      if (on || first) out.setAttribute('transform', sidewalkTransform(v, s.x, m));
      if (v.type !== null && takesAway(v.type)) showCarry(poseHandles(out), on && s.carry);
    }
    const inn = nodes.get(insideId(v));
    if (inn) {
      const on = s.on && s.inside;
      setIfChanged(inn, 'data-active', on ? 'true' : 'false');
      setIfChanged(inn, 'opacity', (on ? s.fade : 0).toFixed(2));
      if (on && s.gesture) applyPose(poseHandles(inn), s.gesture);
    }
  }
}

type CustomersProps = {
  visits: Visit[];
  frames: Map<string, ShopFrame>;
  views: ShopView[];
  gates: Map<string, number>;
  width: number;
  metrics: CityMetrics;
  t0: number;
  sky: Sky;
  rainy: boolean;
  umbrella: boolean;
  // Fondu court (comme les habitants) : un client dont le magasin ferme à la minute s'efface au lieu de disparaître d'un coup.
  fade: string | undefined;
};

export function ShopCustomers({ visits, frames, views, gates, width, metrics, t0, sky, rainy, umbrella, fade }: CustomersProps): ReactElement {
  const style = fade ? { transition: `opacity ${fade} ease` } : undefined;
  const states = visits.map((v) => customerState(v, gates.get(v.slotId) ?? 0, width, t0));
  const slotIds = [...new Set(visits.map((v) => v.slotId))];
  return (
    <g data-city-customers="">
      {/* Derrière les vitrines : un <svg> par local, à la place de la vitrine (rogne le client qui dépasse). */}
      {slotIds.map((id) => {
        const f = frames.get(id)!;
        const view = views.find((x) => x.slot.id === id);
        // Boutique ouverte la nuit : comme le vendeur, le client est éclairé (ciel de jour) ; le store couvre le haut de la vitrine, le client reste dessous.
        const lit = sky.daylight < 0.45 && view?.phase === 'open';
        const shift = view?.sign && SHOP_DEFS[view.sign.type].awning ? 3 : 0;
        return (
          <svg key={id} data-shop-window={id} x={f.window.x} y={f.window.y + shift} width={f.window.w} height={f.window.h - shift} overflow="hidden">
            {visits.map((v, i) => {
              if (v.slotId !== id) return null;
              const s = states[i]!;
              const on = s.on && s.inside;
              return (
                <g key={v.id} data-life-id={insideId(v)} data-customer-inside="" data-active={on ? 'true' : 'false'} transform={insideTransform(v, f, shift)} opacity={(on ? s.fade : 0).toFixed(2)} style={style}>
                  <PosedPerson outfit={v.outfit} sky={lit ? LIT_SKY : sky} rainy={false} umbrella={false} accessory={v.type ? ACCESSORY[v.type] : null} pose={s.gesture ?? STANDING} seated={seatedFor(v.type)} />
                </g>
              );
            })}
          </svg>
        );
      })}
      {visits.map((v, i) => {
        const s = states[i]!;
        const on = s.on && !s.inside;
        return (
          <g key={v.id} data-life-id={v.id} data-customer="" data-active={on ? 'true' : 'false'} transform={sidewalkTransform(v, s.x, metrics)} opacity={(on ? s.fade : 0).toFixed(2)} style={style}>
            <PersonSprite outfit={v.outfit} sky={sky} rainy={rainy} umbrella={umbrella} />
            {v.type !== null && takesAway(v.type) && (
              <g data-item="" transform={CARRY_AT} visibility={on && s.carry ? 'visible' : 'hidden'}>
                <AccessorySprite id={ACCESSORY[v.type]} sky={sky} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------- Équipe du chantier ----------
type Held = 'new' | 'old' | null;
type CrewPose = { x: number; y: number; dir: 1 | -1; pose: WorkerPose; holds: Held };

const at = (step: WorkStep): number => WORK_STEPS.indexOf(step);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const sgn = (d: number): 1 | -1 => (d < 0 ? -1 : 1);

// Position des deux ouvriers (A monte à l'échelle, B reste au pied) pour une étape et sa progression.
// `lx` : pied de l'échelle ; `bx` : place de B ; `edge` : bord du monde d'où ils viennent et où ils repartent.
function crewAt(step: WorkStep, p: number, lx: number, bx: number, edge: number, foot: number, top: number): [CrewPose, CrewPose] {
  const side = sgn(bx - lx);
  const stand = (x: number, dir: 1 | -1, holds: Held = null): CrewPose => ({ x, y: foot, dir, pose: 'stand', holds });
  const onLadder = (y: number, pose: WorkerPose, holds: Held = null): CrewPose => ({ x: lx, y, dir: side, pose, holds });
  const b = stand(bx, (-side) as 1 | -1);
  switch (step) {
    case 'arrive': {
      const dir = sgn(lx - edge);
      return [
        { x: lerp(edge, lx, p), y: foot, dir, pose: 'walk', holds: null },
        { x: lerp(edge, bx, p), y: foot, dir, pose: 'walk', holds: null },
      ];
    }
    case 'leave': {
      const dir = sgn(edge - lx);
      return [
        { x: lerp(lx, edge, p), y: foot, dir, pose: 'walk', holds: null },
        { x: lerp(bx, edge, p), y: foot, dir, pose: 'carry', holds: 'old' },
      ];
    }
    case 'climb': return [onLadder(lerp(foot, top, p), 'climb'), b];
    case 'remove': return [onLadder(top, 'reach'), b];
    case 'descend': return [onLadder(lerp(top, foot, p), 'climb', 'old'), b];
    case 'hand': return [stand(lx, side), { ...b, pose: 'reach', holds: 'new' }];
    case 'climb-again': return [onLadder(lerp(foot, top, p), 'climb', 'new'), b];
    case 'install': return [onLadder(top, 'reach', 'new'), b];
    case 'descend-again': return [onLadder(lerp(top, foot, p), 'climb'), b];
    default: return [stand(lx, side), b]; // ladder-up, pause, rest, ladder-down
  }
}

type WorksProps = { view: ShopView; frame: ShopFrame; change: Change | null; width: number; metrics: CityMetrics; sky: Sky; rainy: boolean; still: boolean; seed: number };

export function ShopWorks({ view, frame, change, width, metrics, sky, rainy, still, seed }: WorksProps): ReactElement | null {
  const id = view.slot.id;
  const outfits = useMemo(() => [0, 1].map((i) => outfitFor('worker', mulberry32(seed ^ hashString(`${id}-crew-${i}`)))), [id, seed]);
  if (!view.works) return null;
  // Mouvement réduit : pose « install » figée (échelle dressée, l'un en haut avec la nouvelle enseigne), sans transition.
  const step: WorkStep = still ? 'install' : view.works.step;
  const progress = still ? 0.5 : view.works.progress;
  const { sign, window: win } = frame;
  // L'échelle se dresse du côté du bord le plus proche : l'équipe arrive par là et repart par là.
  const fromLeft = sign.x + sign.w / 2 < width / 2;
  const reach = Math.min(12, sign.w * 0.25);
  const lx = fromLeft ? sign.x + reach : sign.x + sign.w - reach;
  const bx = lx + (fromLeft ? CREW_GAP : -CREW_GAP);
  const edge = fromLeft ? -OFFSTAGE : width + OFFSTAGE;
  const foot = metrics.doorY;
  const top = sign.y + ON_LADDER_DY;
  const crew = crewAt(step, progress, lx, bx, edge, foot, top);
  const ladder = at(step) >= at('ladder-up') && at(step) <= at('ladder-down');
  // Ce que l'équipe pose (nouvelle enseigne ou écriteau À vendre) et ce qu'elle emporte (ancienne enseigne ou écriteau retiré).
  const fresh = !change ? null : change.kind === 'to-sale' ? <CarriedPlacard w={win.w} sky={sky} /> : change.after ? <CarriedSign type={change.after.type} name={change.after.name} w={sign.w} sky={sky} /> : null;
  const old = !change ? null : change.kind === 'from-sale' ? <CarriedPlacard w={win.w} sky={sky} /> : change.before ? <CarriedSign type={change.before.type} name={change.before.name} w={sign.w} sky={sky} /> : null;
  // L'ancienne est posée contre la devanture, sous la vitrine, entre la descente et le départ.
  const oldDown = at(step) > at('descend') && at(step) < at('leave');
  const k = metrics.unit * STREET_SCALE.person;
  const move = still ? undefined : WORKER_MOVE;
  const item = (held: Held, c: CrewPose): ReactElement | null => {
    if (held === 'new' && step === 'install') return null; // dessinée à sa place, plus bas
    const node = held === 'new' ? fresh : held === 'old' ? old : null;
    if (!node) return null;
    return <g transform={`translate(0 ${-(c.pose === 'carry' || held === 'old' ? WAIST : ARMS_UP)})`}>{node}</g>;
  };
  return (
    <g data-works={id} data-works-step={step}>
      {ladder && (
        <g data-ladder="" transform={`translate(${lx.toFixed(1)} ${foot.toFixed(1)})`}>
          <LadderSprite height={foot - sign.y + 1} />
        </g>
      )}
      {oldDown && old && <g data-old-item="" transform={`translate(${(win.x + win.w / 2).toFixed(1)} ${foot.toFixed(1)})`}>{old}</g>}
      {/* Pendant la pose, la nouvelle enseigne (ou l'écriteau) est tenue à sa place, contre le bandeau nu,
          derrière l'ouvrier perché sur l'échelle. */}
      {step === 'install' && fresh && (
        <g data-installing="" transform={change?.kind === 'to-sale' ? `translate(${(win.x + win.w / 2).toFixed(1)} ${(win.y + 13).toFixed(1)})` : `translate(${(sign.x + sign.w / 2).toFixed(1)} ${(sign.y + sign.h).toFixed(1)})`}>
          {fresh}
        </g>
      )}
      {crew.map((c, i) => (
        <g key={i} data-worker="" data-pose={c.pose} style={{ transform: `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`, transition: move }}>
          <g transform={`scale(${(c.dir * k).toFixed(3)} ${k.toFixed(3)})`}>
            <PersonSprite outfit={outfits[i]!} sky={sky} rainy={rainy} umbrella={false} />
          </g>
          {item(c.holds, c)}
        </g>
      ))}
    </g>
  );
}

// ---------- Personnel ----------
// Taille d'un employé derrière la vitrine (celle de l'ancien vendeur peint) ; au plus trois personnes visibles par local
// (le relais peut en mettre six), réparties autour de la place de service (fractions de la vitrine).
const STAFF_SCALE = 0.5;
const MAX_VISIBLE = 3;
const SPREAD = [0, -0.3, 0.3] as const;
// Trajet sur le trottoir : seulement la dernière minute avant l'entrée et la première après la sortie, en une transition CSS
// linéaire d'une minute (la scène est re-rendue à la minute) ; le reste des WALK_MIN minutes se passe hors du champ.
const STAFF_WALK = 'transform 60s linear, opacity 0.4s ease';
const EPS = 1e-6;

// Postes à considérer pour un local un jour donné (mémoïsés par jour dans la couche : staffShiftsAt recalcule deux plans).
// Le jour d'un changement : personne avant la fin du chantier d'enseigne ; le nouvel occupant n'a que les postes qui commencent
// ce jour-là et finissent après le chantier (arrivée et lever du rideau repoussés à la fin du chantier s'il ouvre plus tôt).
// `offsetMin` : décalage du déménagement (un seul camion à la fois, movingOffsets) ; le chantier, donc l'arrivée, suit.
export function dayShifts(s: SlotDay, seed: number, date: YMD, offsetMin = 0): StaffShift[] {
  if (!s.tenant) return [];
  const all = staffShiftsAt(SHOP_DEFS[s.tenant.type], seed, s.slot.id, date);
  const c = s.change;
  if (!c || c.day !== dayNumber(date)) return all;
  if (!c.after) return [];
  const end = changePlans(seed, s.slot.id, c.day, c.kind, offsetMin).works.end;
  const today = `-${isoDate(date)}-`;
  return all
    .filter((sh) => sh.id.includes(today) && sh.leaveAt > end + 1)
    .map((sh): StaffShift => {
      const arriveAt = Math.max(sh.arriveAt, end);
      return {
        ...sh,
        arriveAt,
        breaks: sh.breaks.filter(([a]) => a >= arriveAt),
        ...(sh.shutterUp !== undefined ? { shutterUp: Math.max(sh.shutterUp, arriveAt) } : {}),
      };
    });
}

// Tenue d'un employé : tirée de son poste (la même personne reste reconnaissable dans la journée) ; ni sac ni cartable au travail.
export function staffOutfit(seed: number, outfitKey: string): Outfit {
  const rng = mulberry32(seed ^ hashString(`staff-outfit|${outfitKey}`));
  const u = rng();
  const profile: Profile = u < 0.15 ? 'suit' : u < 0.3 ? 'worker' : 'ordinary';
  return { ...outfitFor(profile, rng), accessory: 'none' };
}

// Le local a-t-il un rideau roulant (commerce ouvert ou fermé, hors chantier et déménagement) ?
const hasShutter = (view: ShopView): boolean => view.sign !== null && (view.phase === 'open' || view.phase === 'closed') && !view.works && !view.moving;

// État du rideau à la minute ; null sans rideau. Mouvement réduit : selon l'heure (levé si ouvert), sans geste.
export function shopShutter(view: ShopView, shifts: StaffShift[], date: YMD, minutes: number, reduced: boolean): ShutterState | null {
  if (!hasShutter(view)) return null;
  if (reduced) return view.phase === 'open' ? 'up' : 'down';
  return shutterAt(shifts, SHOP_DEFS[view.sign!.type], date, minutes);
}

// Ordre d'affichage quand il y a trop de monde : l'ancre de chaque équipe (jamais en pause) d'abord, puis par arrivée.
const anchorFirst = (a: StaffShift, b: StaffShift): number => Number(!a.id.endsWith('-m0')) - Number(!b.id.endsWith('-m0')) || a.arriveAt - b.arriveAt;

export type StaffCast = {
  shutter: ShutterState | null;
  // Derrière la vitrine : au plus MAX_VISIBLE avec ceux de la porte, au moins un dès que quelqu'un travaille et que le rideau n'est pas baissé.
  inside: StaffShift[];
  // Sur le trottoir : à la porte (rideau), ou en route (visible la dernière minute avant l'entrée, la première après la sortie).
  street: { shift: StaffShift; state: StaffState; visible: boolean; atDoor: boolean }[];
  // Relève de l'ouvreur : seul à ouvrir, il est à la fois à la porte (geste du rideau) et derrière la vitrine ; la boucle
  // passe de l'un à l'autre au bout de SHUTTER_S secondes (le rendu est à la minute, le geste du moteur dure 6 s).
  handover: string | null;
};

export function staffCast(view: ShopView, shifts: StaffShift[], date: YMD, minutes: number, reduced: boolean): StaffCast {
  const shutter = shopShutter(view, shifts, date, minutes, reduced);
  if (shutter === null) return { shutter, inside: [], street: [], handover: null };
  const states = staffAt(shifts, minutes);
  const working = shifts.filter((_, i) => states[i]!.where === 'inside' && !states[i]!.onBreak).sort(anchorFirst);
  if (reduced) {
    // Exactement une personne à son poste quand c'est ouvert, aucune sinon ; personne en route.
    const one = working[0] ?? [...shifts].sort(anchorFirst)[0];
    return { shutter, inside: view.phase === 'open' && one ? [one] : [], street: [], handover: null };
  }
  const street: StaffCast['street'] = [];
  shifts.forEach((shift, i) => {
    const state = states[i]!;
    switch (state.where) {
      case 'opening':
      case 'closing':
        street.push({ shift, state, visible: true, atDoor: true });
        break;
      case 'walking-in':
        street.push({ shift, state, visible: (1 - state.progress) * WALK_MIN <= 1 + EPS, atDoor: false });
        break;
      case 'walking-out':
        street.push({ shift, state, visible: state.progress * WALK_MIN < 1 - EPS, atDoor: false });
        break;
      case 'inside':
        // La minute avant la sortie, le nœud existe déjà (caché à la porte) : le départ glissera depuis la porte.
        if (minutes >= shift.leaveAt - 1) street.push({ shift, state, visible: false, atDoor: true });
        break;
      default:
        break;
    }
  });
  const atDoor = street.filter((x) => x.visible && x.atDoor).length;
  // Rideau baissé : personne ne se voit derrière (ceux qui attendent l'ouverture ou finissent la fermeture sont cachés).
  // Ouverture par une personne seule : sans elle, le local ouvert serait vide toute la minute du geste.
  const opener = working.length === 0 ? shifts.find((_, i) => states[i]!.where === 'opening') ?? null : null;
  const inside = shutter === 'down' ? [] : opener ? [opener] : working.slice(0, Math.max(1, MAX_VISIBLE - atDoor));
  return { shutter, inside, street, handover: opener && shutter !== 'down' ? opener.id : null };
}

type StaffProps = {
  view: ShopView;
  shifts: StaffShift[];
  frame: ShopFrame;
  metrics: CityMetrics;
  minutes: number;
  reduced: boolean;
  date: YMD;
  width: number;
  sky: Sky;
  rainy: boolean;
  umbrella: boolean;
  seed: number;
  // Places des clients dans la vitrine (x local) : l'employé se tourne vers la plus proche.
  seats: number[];
  // Place de service (x local, interiorPost).
  post: number;
};

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function StaffLayer({ view, shifts, frame, metrics, minutes, reduced, date, width, sky, rainy, umbrella, seed, seats, post }: StaffProps): ReactElement | null {
  const outfits = useMemo(() => new Map(shifts.map((s) => [s.id, staffOutfit(seed, s.outfitKey)])), [shifts, seed]);
  const cast = staffCast(view, shifts, date, minutes, reduced);
  // Début de la minute affichée (horloge murale) : repère de la relève de l'ouvreur.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const since = useMemo(() => Date.now() / 1000, [minutes]);
  if (cast.shutter === null) return null;
  const swapAt = (since + SHUTTER_S).toFixed(2);
  const type = view.sign!.type;
  const { window: win, door } = frame;
  const open = view.phase === 'open';
  const lit = sky.daylight < 0.45 && open;
  const shift = SHOP_DEFS[type].awning ? 3 : 0;
  const inSky = lit ? LIT_SKY : sky;
  // Le premier plan de l'intérieur (comptoir…) est redessiné ici, devant le personnel, quand la boutique est ouverte (le décor
  // fixe ne le dessine alors pas) ou quand quelqu'un est encore derrière la vitrine pendant la descente du rideau.
  const front = open || cast.inside.length > 0;
  const doorX = door.x + door.w / 2;
  const k = metrics.unit * STREET_SCALE.person;
  const toward = (x: number): 1 | -1 => {
    let best: number | null = null;
    for (const s of seats) if (best === null || Math.abs(s - x) < Math.abs(best - x)) best = s;
    return best === null || best >= x ? 1 : -1;
  };
  return (
    <g data-shop-staff={view.slot.id} data-shutter-state={cast.shutter}>
      {front && (
        <svg data-staff-window="" x={win.x} y={win.y + shift} width={win.w} height={win.h - shift} overflow="hidden">
          <g transform={shift ? `translate(0 ${-shift})` : undefined}>
            {cast.inside.map((s, i) => {
              const x = clamp(post + SPREAD[i]! * win.w, 2.5, win.w - 2.5);
              const dir = toward(x);
              const gseed = hashString(s.id);
              return (
                <g
                  key={s.id}
                  data-staff-member={s.id}
                  data-staff-where="inside"
                  data-posed="staff"
                  data-gesture-type={type}
                  data-gesture-seed={gseed}
                  {...(cast.handover === s.id ? { 'data-swap': 'in', 'data-swap-at': swapAt, opacity: 0 } : {})}
                  transform={`translate(${x.toFixed(2)} ${win.h - 1}) scale(${dir * STAFF_SCALE} ${STAFF_SCALE})`}
                >
                  <PosedPerson outfit={outfits.get(s.id)!} sky={inSky} rainy={false} umbrella={false} accessory={ACCESSORY[type]} pose={reduced ? STANDING : gestureAt(type, 'staff', 0, gseed)} />
                </g>
              );
            })}
            <ShopInteriorFront type={type} w={win.w} h={win.h} sky={sky} lit={lit} />
          </g>
        </svg>
      )}
      <RollingShutter frame={frame} sky={sky} state={cast.shutter} still={reduced} />
      {cast.street.map(({ shift: s, state, visible, atDoor }) => {
        const side = state.side;
        const toEdge = side > 0 ? doorX + WORLD_MARGIN : width + WORLD_MARGIN - doorX;
        const edge = doorX - side * Math.min(toEdge, MAX_TRIP_PX);
        // En route : caché au bord tant que la dernière minute n'est pas venue, puis glisse jusqu'à la porte ; au départ, glisse de la porte au bord.
        const x = atDoor || (state.where === 'walking-in' && visible) ? doorX : edge;
        const dir = state.where === 'walking-out' ? (-side as 1 | -1) : side;
        const lifting = state.where === 'opening' || state.where === 'closing';
        const outfit = outfits.get(s.id)!;
        return (
          <g
            key={s.id}
            data-staff-member={s.id}
            data-staff-where={state.where}
            data-active={visible ? 'true' : 'false'}
            opacity={visible ? 1 : 0}
            {...(cast.handover === s.id && state.where === 'opening' ? { 'data-swap': 'out', 'data-swap-at': swapAt } : {})}
            style={{ transform: `translate(${x.toFixed(1)}px, ${metrics.doorY.toFixed(1)}px)`, transition: reduced ? undefined : STAFF_WALK }}
          >
            <g transform={`scale(${(dir * k).toFixed(3)} ${k.toFixed(3)})`}>
              {lifting ? (
                <PosedPerson outfit={outfit} sky={sky} rainy={rainy} umbrella={false} accessory={null} pose={LIFTING} />
              ) : (
                <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={umbrella} />
              )}
            </g>
          </g>
        );
      })}
    </g>
  );
}

// Employés derrière les vitrines : collectés une fois par jeu de nœuds, mis en pose par la boucle (geste de la famille).
export type PosedStaff = { h: PoseHandles; type: ShopTypeId; seed: number };
export function collectPosedStaff(root: Element): PosedStaff[] {
  const out: PosedStaff[] = [];
  for (const node of root.querySelectorAll('[data-posed="staff"]')) {
    out.push({ h: poseHandles(node), type: node.getAttribute('data-gesture-type') as ShopTypeId, seed: Number(node.getAttribute('data-gesture-seed')) });
  }
  return out;
}
export function placeStaff(staff: PosedStaff[], t: number): void {
  for (const s of staff) applyPose(s.h, gestureAt(s.type, 'staff', t, s.seed));
}

// Relève de l'ouvreur (data-swap) : à la porte jusqu'à `data-swap-at`, puis derrière la vitrine.
export type Swap = { node: Element; out: boolean; at: number };
export function collectSwaps(root: Element): Swap[] {
  const out: Swap[] = [];
  for (const node of root.querySelectorAll('[data-swap]')) out.push({ node, out: node.getAttribute('data-swap') === 'out', at: Number(node.getAttribute('data-swap-at')) });
  return out;
}
export function placeSwaps(swaps: Swap[], t: number): void {
  for (const s of swaps) setIfChanged(s.node, 'opacity', (t >= s.at) !== s.out ? '1' : '0');
}

// ---------- Devant la façade : terrasse ou porte de la boîte de nuit ----------
type OutdoorsProps = {
  view: ShopView;
  frame: ShopFrame;
  metrics: CityMetrics;
  minutes: number;
  date: YMD;
  weather: TerraceSky;
  // Activité des passants (0..1, cityIntensity) : module l'affluence du type pour la terrasse.
  walkers: number;
  reduced: boolean;
  sky: Sky;
  seed: number;
  sessionT0: number;
};

export function ShopOutdoors({ view, frame, metrics, minutes, date, weather, walkers, reduced, sky, seed, sessionT0 }: OutdoorsProps): ReactElement | null {
  const type = view.sign?.type ?? null;
  if (type === 'nightclub') return <NightclubDoor view={view} frame={frame} metrics={metrics} minutes={minutes} date={date} reduced={reduced} sky={sky} seed={seed} sessionT0={sessionT0} />;
  if (type === null || SHOP_DEFS[type].terrace === 0) return null;
  // Une terrasse sortie attire : un fond de 0,3 s'ajoute à l'affluence du type (sinon les chaises restent presque toujours vides).
  const crowd = Math.min(1, 0.3 + 0.9 * crowdAt(SHOP_DEFS[type], minutes) * (0.6 + 0.4 * walkers));
  return (
    <ShopTerrace
      view={view}
      frame={frame}
      metrics={metrics}
      minutes={minutes}
      date={date}
      weather={weather}
      crowd={crowd}
      reduced={reduced}
      sky={sky}
      seed={seed}
      waiterOutfit={staffOutfit(seed, `${view.slot.id}-waiter`)}
    />
  );
}

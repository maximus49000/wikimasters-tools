import { Fragment, useMemo, useRef, type ReactElement } from 'react';
import { isoDate, type YMD } from '../core/library/city/calendar';
import { DOOR_WIDTH, MAX_TRIP_PX, endDoorOf } from '../core/library/city/doors';
import { DOOR_DARK, THRESHOLD_S, doorDarkOpacity, entranceOpening, type Passage } from '../core/library/city/doorway';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit, type Profile } from '../core/library/city/people';
import { SHOP_DEFS, type ShopTypeId } from '../core/library/city/shops/catalog';
import { INSIDE_SCALE, MAX_VISIT_FALLBACK_PX, lockedVisit, visitAt, visitHappens, type Visit, type VisitInner, type VisitLock, type VisitStage } from '../core/library/city/shops/customers';
import { ACCESSORY, SHOP_FAMILY, gestureAt, takesAway, type Family, type Pose } from '../core/library/city/shops/gestures';
import { crowdAt, dayNumber } from '../core/library/city/shops/hours';
import type { Change, SlotDay } from '../core/library/city/shops/lifecycle';
import type { Rect, ShopFrame } from '../core/library/city/shops/slots';
import { WALK_MIN, shutterAt, staffAt, staffShiftsAt, type StaffShift, type StaffState } from '../core/library/city/shops/staff';
import { capFor, spriteBudget, type BudgetSprite } from '../core/library/city/shops/sprite-budget';
import { changePlans, type ShopView } from '../core/library/city/shops/view';
import { WORK_STEPS, type WorkStep } from '../core/library/city/shops/works';
import { WORLD_MARGIN, hashString, mulberry32 } from '../core/library/scene-world';
import { TURN_S, YAW_BACK, YAW_FRONT, YAW_RIGHT, facingYaw, phaseIndexOf, turnYaw } from '../core/library/figure/gait';
import type { Work } from '../core/library/figure/dress';
import type { ArmPose } from '../core/library/figure/skeleton';
import type { Sky } from '../core/library/sky';
import { PersonSprite } from './city-sprites';
import { placeSill, sillBox, sillFigTransform } from './door-passage';
import type { FigureRegistry } from './figure/figure-host';
import { GhibliFigure, hideFigure, poseFigure, type PoseIn } from './figure/ghibli-figure';
import { AccessorySprite, GhibliPosed, LIFTING, PosedPerson, STANDING, applyGhibliPose, applyPose, ghibliHandles, ghibliPoseOf, poseHandles, showCarry, type GhibliPoseHandles, type PoseHandles } from './shop-gesture-sprites';
import { LIT_SKY, ShopInteriorFront } from './shop-interiors';
import { NightclubDoor } from './shop-queue';
import { CarriedPlacard, CarriedSign, LadderSprite, RollingShutter, SHUTTER_S, type ShutterState, type WorkerPose } from './shop-sprites';
import { ShopTerrace, type TerraceSky } from './shop-terrace';

// Vie des commerces dans le calque animé de la Ville (vague 1b-iv-a) : clients qui entrent, restent derrière la vitrine et
// ressortent ; équipe du chantier du matin (deux ouvriers, une échelle, l'ancienne et la nouvelle enseigne). Vague 1b-iv-b :
// le personnel (StaffLayer) arrive à pied, lève le rideau roulant, travaille, se relaie, baisse le rideau et repart ; clients et
// employés font le geste de la famille du commerce (poses écrites par la boucle, voir shop-gesture-sprites.tsx) ; devant la
// façade (ShopOutdoors) : terrasse des bars et restaurants (shop-terrace.tsx), cordon, videurs et file de la boîte (shop-queue.tsx).
// Clients : TROIS nœuds par visite, l'un sur le trottoir (étapes « in » et « out »), un <svg> imbriqué sur la porte du seuil en
// cours (porte du local ou entrée d'immeuble au bout du trajet), un dernier dans le <svg> imbriqué posé sur la vitrine (étape
// « inside », rogné sans clipPath ni id) ; la boucle d'animation de CityLifeLayer n'en active qu'un (placeCustomers), sans fondu.
// Équipe : rendue à la minute (re-rendu React), déplacée par une transition CSS de 30 s entre deux minutes.

// Client derrière la vitrine : taille INSIDE_SCALE (customers.ts), pieds au bord du sol (bas de la vitrine − 3).
const INSIDE_DY = 3;
// Repère de l'équipe (px du monde) : pieds de l'ouvrier sur l'échelle sous le haut de l'enseigne, objets tenus à bout de bras
// (au-dessus de la tête) ou à hauteur de taille ; écart entre les deux ouvriers ; distance hors champ d'où ils viennent.
const ON_LADDER_DY = 18;
const ARMS_UP = 24;
const WAIST = 8;
const CREW_GAP = 10;
const OFFSTAGE = 30;
const WORKER_MOVE = 'transform 30s linear';

// N'écrire un attribut que s'il change (nœud absent : rien).
export const setIfChanged = (node: Element | null, name: string, value: string): void => {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
};

// ---------- Clients ----------
const NO_MUTED: ReadonlySet<string> = new Set();
type FigurePose = PoseIn;
export type CustomerState = { on: boolean; stage: VisitStage | null; x: number; passage: Passage | null; inner: VisitInner | null; gesture: Pose | null; carry: boolean };

// Présence d'une visite à l'instant t : en route (ou dans le magasin) et tirée pour ce tour de cycle, local ouvert (gate > 0).
// `lock` : tirage verrouillé pour le tour (la boucle décide, `commit` ; le rendu initial lit sans décider).
// À sa place, le client fait le geste de la famille ; dans la rue, en repartant, il porte un petit objet si la famille s'y prête.
export function customerState(v: Visit, gate: number, width: number, t: number, lock?: VisitLock, commit = true): CustomerState {
  const pos = visitAt(v, width, t);
  const on = pos !== null && (lock ? lockedVisit(lock, v, t, gate, commit) : gate > 0 && visitHappens(v, t, gate));
  return { on, stage: pos?.stage ?? null, x: pos?.x ?? v.doorX, passage: pos?.passage ?? null, inner: pos?.inner ?? null, gesture: pos?.gesture ?? null, carry: pos?.carry ?? false };
}

// Nœud visible d'un client : rue (`[data-customer]`), porte (`svg[data-customer-door]`, seuil de la porte du local ou de l'entrée
// d'immeuble au bout du trajet) ou intérieur (`[data-customer-inside]`) ; jamais deux à la fois.
type Where = 'street' | 'door' | 'inside' | null;
const whereOf = (s: CustomerState): Where => (!s.on || s.stage === null ? null : s.stage === 'inside' ? 'inside' : s.passage?.stage === 'threshold' ? 'door' : 'street');

// Objet emporté sur le trottoir : tenu à la main, bras le long du corps.
const CARRY_AT = 'translate(4 -15)';
const streetScale = (v: Visit, m: CityMetrics): number => m.unit * STREET_SCALE.person * v.scale;
// Sens de marche (dessin classique, retourné en miroir) : il arrive dans le sens `dir`, repart en sens inverse.
const motionOf = (v: Visit, stage: VisitStage | null): 1 | -1 => (stage === 'in' || stage === 'enter' ? v.dir : (-v.dir as 1 | -1));
const sidewalkTransform = (v: Visit, x: number, m: CityMetrics, sgn: number): string => {
  const k = streetScale(v, m);
  return `translate(${x.toFixed(1)} ${m.doorY.toFixed(1)}) scale(${(sgn * k).toFixed(3)} ${k.toFixed(3)})`;
};
// Ouverture du seuil en cours : la porte du local (entrer, sortir) ou l'entrée d'immeuble au bout du trajet.
const customerDoorRect = (v: Visit, stage: VisitStage | null, m: CityMetrics): Rect =>
  stage === 'enter' || stage === 'exit' || v.endDoorX === null ? v.shopDoor : entranceOpening(v.endDoorX - DOOR_WIDTH / 2, m);
// Pose Ghibli dans la rue ou dans une porte (pas réglés sur la distance ; au seuil, la profondeur fait avancer les pas).
const passagePose = (v: Visit, p: Passage, m: CityMetrics): FigurePose => ({ yaw: p.yaw, gait: p.gait, phase: phaseIndexOf(p.walked / streetScale(v, m) + p.depth * 8), head: 0 });
// Derrière la vitrine : `y` = sol du local dans la vitrine (sous le store). Classique : retourné selon la marche, vers sa place sinon.
const insideTransform = (v: Visit, inner: VisitInner, y: number, mirror: boolean): string => {
  const k = INSIDE_SCALE * v.scale;
  const sgn = !mirror ? 1 : inner.gait === 'walk' ? (inner.yaw === YAW_RIGHT ? 1 : -1) : v.seat.facing;
  return `translate(${inner.x.toFixed(1)} ${y.toFixed(1)}) scale(${(sgn * k).toFixed(3)} ${k.toFixed(3)})`;
};
const innerPose = (v: Visit, inner: VisitInner): FigurePose => ({ yaw: inner.yaw, gait: inner.gait, phase: phaseIndexOf(inner.walked / (INSIDE_SCALE * v.scale)), head: 0 });
const innerY = (f: ShopFrame, shift: number): number => f.window.h - shift - INSIDE_DY;
const insideId = (v: Visit): string => `${v.id}-in`;
const doorId = (v: Visit): string => `${v.id}-door`;
// Classique : à sa place, le client en geste (PosedPerson) ; en marchant ou en se tournant, la silhouette de passant.
const atSeat = (inner: VisitInner | null): boolean => inner !== null && (inner.gait === 'stand' || inner.gait === 'seated');
// Fauteuil et table : le client est assis à sa place.
const seatedFor = (type: ShopTypeId | null): boolean => type !== null && (SHOP_FAMILY[type] === 'chair' || SHOP_FAMILY[type] === 'table');
const onOff = (on: boolean): string => (on ? '1.00' : '0.00');
// Objet emporté d'un pantin (rue, seuil), cherché une fois par nœud.
const carriedCache = new WeakMap<Element, Element | null>();
const carriedOf = (node: Element): Element | null => {
  let c = carriedCache.get(node);
  if (c === undefined) {
    c = node.querySelector('[data-item-carry]');
    carriedCache.set(node, c);
  }
  return c;
};

// `lock` : verrou des tirages (gardé par l'appelant entre les minutes) ; `ghibli` + `figures` : pantins posés par la boucle.
export type CustomerOpts = { lock?: VisitLock; ghibli?: boolean; figures?: FigureRegistry | null };

// Placement par la boucle : n'écrire que ce qui change (la plupart des clients sont absents la plupart du temps).
// `muted` : visites retirées par le plafond global (shopSpriteBudget) : décidé au verrou, elles n'ont pas lieu de ce tour.
export function placeCustomers(nodes: ReadonlyMap<string, Element>, visits: Visit[], gates: Map<string, number>, width: number, m: CityMetrics, t: number, first: boolean, muted: ReadonlySet<string> = NO_MUTED, opts: CustomerOpts = {}): void {
  const ghibli = opts.ghibli === true && !!opts.figures;
  const pose = (node: Element | null, p: FigurePose): void => {
    if (ghibli) poseFigure(opts.figures!, node?.querySelector('[data-figure]') ?? null, p);
  };
  // Ghibli : objet emporté (rue, seuil) montré par `display` (la figure éteinte le cache avec elle).
  const carry = (node: Element, on: boolean): void => setIfChanged(carriedOf(node), 'display', on ? 'inline' : 'none');
  // Ghibli : nœud qui s'éteint (ou premier placement) → figure cachée, sprite libéré ; n'écrit qu'à la bascule.
  const toggle = (node: Element, on: boolean): void => {
    const off = ghibli && !on && (first || node.getAttribute('data-active') !== 'false');
    setIfChanged(node, 'data-active', on ? 'true' : 'false');
    setIfChanged(node, 'opacity', onOff(on));
    if (off) hideFigure(opts.figures!, node.querySelector('[data-figure]'));
  };
  for (const v of visits) {
    const s = customerState(v, muted.has(v.id) ? 0 : (gates.get(v.slotId) ?? 0), width, t, opts.lock);
    const where = whereOf(s);
    const sgn = ghibli ? 1 : motionOf(v, s.stage);
    const out = nodes.get(v.id);
    if (out) {
      const on = where === 'street';
      toggle(out, on);
      if (on && s.passage) {
        out.setAttribute('transform', sidewalkTransform(v, s.passage.x, m, sgn));
        pose(out, passagePose(v, s.passage, m));
        if (ghibli) carry(out, s.carry);
      } else if (first) out.setAttribute('transform', sidewalkTransform(v, s.x, m, sgn));
      if (!ghibli && v.type !== null && takesAway(v.type)) showCarry(poseHandles(out), on && s.carry);
    }
    const door = nodes.get(doorId(v));
    if (door) {
      const on = where === 'door';
      toggle(door, on);
      if (on && s.passage) {
        placeSill(door, customerDoorRect(v, s.stage, m), s.passage, m, streetScale(v, m), sgn);
        pose(door, passagePose(v, s.passage, m));
        if (ghibli) carry(door, s.carry);
      }
    }
    const inn = nodes.get(insideId(v));
    if (inn) {
      const on = where === 'inside';
      toggle(inn, on);
      if (on && s.inner) {
        inn.setAttribute('transform', insideTransform(v, s.inner, Number(inn.getAttribute('data-floor') ?? 0), !ghibli));
        if (ghibli) {
          // À sa place : le geste (objet à la main ou posé) ; en marchant ou en se tournant : la marche, rien en main.
          const seated = s.inner.gait === 'seated';
          const g = atSeat(s.inner) ? s.gesture : null;
          applyGhibliPose(opts.figures!, ghibliHandles(inn), g ? ghibliPoseOf(g, s.inner.yaw, seated) : innerPose(v, s.inner), g, seated);
        } else {
          const seat = atSeat(s.inner);
          const stay = inn.querySelector(':scope > [data-inner-stay]');
          setIfChanged(stay, 'visibility', seat ? 'visible' : 'hidden');
          setIfChanged(inn.querySelector(':scope > [data-inner-walk]'), 'visibility', seat ? 'hidden' : 'visible');
          if (stay && s.gesture) applyPose(poseHandles(stay), s.gesture);
        }
      }
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
  // Verrou des tirages de la boucle (lu sans décider) ; Ghibli : pantins au lieu du dessin classique.
  lock?: VisitLock;
  ghibli?: boolean;
};

// Pose de repos des nœuds inactifs (rendu initial) : de face, debout.
const REST: FigurePose = { yaw: YAW_FRONT, gait: 'stand', phase: 0, head: 0 };

export function ShopCustomers({ visits, frames, views, gates, width, metrics, t0, sky, rainy, umbrella, lock, ghibli = false }: CustomersProps): ReactElement {
  const states = visits.map((v) => customerState(v, gates.get(v.slotId) ?? 0, width, t0, lock, false));
  const slotIds = [...new Set(visits.map((v) => v.slotId))];
  return (
    <g data-city-customers="">
      {/* Derrière les vitrines : un <svg> par local, à la place de la vitrine (rogne le client qui entre ou dépasse). */}
      {slotIds.map((id) => {
        const f = frames.get(id)!;
        const view = views.find((x) => x.slot.id === id);
        // Boutique ouverte la nuit : comme le vendeur, le client est éclairé (ciel de jour) ; le store couvre le haut de la vitrine, le client reste dessous.
        const lit = sky.daylight < 0.45 && view?.phase === 'open';
        const shift = view?.sign && SHOP_DEFS[view.sign.type].awning ? 3 : 0;
        const inSky = lit ? LIT_SKY : sky;
        return (
          <svg key={id} data-shop-window={id} x={f.window.x} y={f.window.y + shift} width={f.window.w} height={f.window.h - shift} overflow="hidden">
            {visits.map((v, i) => {
              if (v.slotId !== id) return null;
              const s = states[i]!;
              const on = whereOf(s) === 'inside';
              const inner: VisitInner = on && s.inner ? s.inner : { x: v.seat.x - f.window.x, yaw: v.seat.facing > 0 ? 2 : 6, gait: 'stand', walked: 0 };
              const seat = atSeat(inner);
              return (
                <g
                  key={v.id}
                  data-life-id={insideId(v)}
                  data-customer-inside=""
                  data-visit={v.id}
                  data-x={v.seat.x.toFixed(1)}
                  data-floor={innerY(f, shift).toFixed(1)}
                  data-may={(gates.get(v.slotId) ?? 0) > 0 ? 'true' : 'false'}
                  data-active={on ? 'true' : 'false'}
                  transform={insideTransform(v, inner, innerY(f, shift), !ghibli)}
                  opacity={onOff(on)}
                >
                  {ghibli ? (
                    // À sa place, le geste de la famille (objet à la main ou posé) ; en marchant, rien en main.
                    <GhibliPosed
                      outfit={v.outfit}
                      sky={inSky}
                      rainy={false}
                      accessory={v.type ? ACCESSORY[v.type] : null}
                      figure={seat && s.gesture ? ghibliPoseOf(s.gesture, inner.yaw, inner.gait === 'seated') : innerPose(v, inner)}
                      gesture={seat ? s.gesture : null}
                      seated={inner.gait === 'seated'}
                      hidden={!on}
                    />
                  ) : (
                    <>
                      <g data-inner-stay="" visibility={seat ? 'visible' : 'hidden'}>
                        <PosedPerson outfit={v.outfit} sky={inSky} rainy={false} umbrella={false} accessory={v.type ? ACCESSORY[v.type] : null} pose={s.gesture ?? STANDING} seated={seatedFor(v.type)} />
                      </g>
                      <g data-inner-walk="" visibility={seat ? 'hidden' : 'visible'}>
                        <PersonSprite outfit={v.outfit} sky={inSky} rainy={false} umbrella={false} />
                      </g>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        );
      })}
      {visits.map((v, i) => {
        const s = states[i]!;
        const where = whereOf(s);
        const sgn = ghibli ? 1 : motionOf(v, s.stage);
        const street = where === 'street' && s.passage ? s.passage : null;
        const atDoor = where === 'door' && s.passage ? s.passage : null;
        const dPos: Passage = atDoor ?? { stage: 'threshold', x: v.doorX, depth: 1, yaw: YAW_FRONT, gait: 'walk', walked: 0 };
        const { clip: o, dark } = sillBox(customerDoorRect(v, s.stage, metrics), dPos.depth, metrics, streetScale(v, metrics));
        // Ghibli : le nœud inactif (rue ou seuil) est rendu caché, sans sprite.
        // Ghibli : l'objet emporté est tenu à la main (la gauche sous le parapluie), montré par la boucle en repartant.
        const takes = v.type !== null && takesAway(v.type);
        const sprite = (p: FigurePose, withUmbrella: boolean, on: boolean): ReactElement =>
          ghibli ? (
            <GhibliFigure
              outfit={v.outfit}
              sky={sky}
              rainy={rainy}
              umbrella={withUmbrella}
              initial={p}
              hidden={!on}
              held={takes ? [{ anchor: withUmbrella ? 'handL' : 'handR', node: <g data-item-carry="" display={on && s.carry ? 'inline' : 'none'}><AccessorySprite id={ACCESSORY[v.type!]} sky={sky} /></g> }] : undefined}
            />
          ) : (
            <PersonSprite outfit={v.outfit} sky={sky} rainy={rainy} umbrella={withUmbrella} />
          );
        return (
          <Fragment key={v.id}>
            <g data-life-id={v.id} data-customer="" data-active={street ? 'true' : 'false'} transform={sidewalkTransform(v, street?.x ?? s.x, metrics, sgn)} opacity={onOff(street !== null)}>
              {sprite(street ? passagePose(v, street, metrics) : REST, umbrella, street !== null)}
              {/* Objet emporté du dessin classique (Ghibli : tenu par le pantin, voir `sprite`). */}
              {!ghibli && takes && (
                <g data-item="" transform={CARRY_AT} visibility={street && s.carry ? 'visible' : 'hidden'}>
                  <AccessorySprite id={ACCESSORY[v.type!]} sky={sky} />
                </g>
              )}
            </g>
            {/* Seuil d'une porte : <svg> imbriqué rogné à l'ouverture (ni clipPath ni masque : cette couche est copiée par <use>). */}
            <svg data-life-id={doorId(v)} data-customer-door="" data-visit={v.id} data-active={atDoor ? 'true' : 'false'} x={o.x.toFixed(2)} y={o.y.toFixed(2)} width={o.w.toFixed(2)} height={o.h.toFixed(2)} overflow="hidden" opacity={onOff(atDoor !== null)}>
              <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={atDoor ? doorDarkOpacity(dPos.depth).toFixed(2) : '0.00'} />
              <g data-door-fig="" transform={sillFigTransform(dPos, o, metrics, streetScale(v, metrics), sgn)} opacity={(1 - dPos.depth).toFixed(2)}>
                {sprite(passagePose(v, dPos, metrics), umbrella, atDoor !== null)}
              </g>
            </svg>
          </Fragment>
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

// Ghibli : pose d'un ouvrier (A monte, B reste au pied) selon sa pose du classique. Marche et port de profil dans le sens de
// marche ; sur l'échelle de dos (escalade, mains aux montants ; enseigne déposée ou posée bras au-dessus de la tête) ; au pied
// de trois quarts vers l'autre, la nouvelle enseigne portée à deux mains au moment de la passer.
type Pos = { x: number; y: number };
type CrewLook = { yaw: number; gait: 'walk' | 'climb' | 'stand'; arms: ArmPose };
function crewLook(c: CrewPose, i: number): CrewLook {
  const side = c.dir > 0 ? 2 : 6;
  switch (c.pose) {
    case 'walk': return { yaw: facingYaw(c.dir), gait: 'walk', arms: 'swing' };
    case 'carry': return { yaw: facingYaw(c.dir), gait: 'walk', arms: 'carry' };
    case 'climb': return { yaw: YAW_BACK, gait: 'climb', arms: 'swing' };
    case 'reach': return i === 0 ? { yaw: YAW_BACK, gait: 'climb', arms: 'overhead' } : { yaw: side, gait: 'stand', arms: 'carry' };
    default: return { yaw: side, gait: 'stand', arms: 'swing' };
  }
}
// Durée d'un déplacement de l'équipe (transition CSS entre deux minutes, WORKER_MOVE).
const WORKER_S = 30;
// Pose à l'instant t d'un ouvrier qui s'est déplacé de `dist` px depuis `since` (vitesse = dist / WORKER_S) : la phase suit
// la distance parcourue ; la marche finie, debout ; sur l'échelle, la dernière prise est gardée.
export type WorkerMove = { look: CrewLook; since: number; dist: number; k: number };
function workerPose(w: WorkerMove, t: number): PoseIn {
  const p = w.dist > 0.01 ? Math.min(1, Math.max(0, (t - w.since) / WORKER_S)) : 1;
  const { yaw, gait, arms } = w.look;
  if (gait === 'walk' && (p >= 1 || w.dist <= 0.01)) return { yaw, gait: 'stand', phase: 0, head: 0, arms };
  return { yaw, gait, phase: phaseIndexOf((p * w.dist) / w.k), head: 0, arms };
}

type WorksProps = { view: ShopView; frame: ShopFrame; change: Change | null; width: number; metrics: CityMetrics; sky: Sky; rainy: boolean; still: boolean; seed: number; ghibli?: boolean };

export function ShopWorks({ view, frame, change, width, metrics, sky, rainy, still, seed, ghibli = false }: WorksProps): ReactElement | null {
  const id = view.slot.id;
  const outfits = useMemo(() => [0, 1].map((i) => outfitFor('worker', mulberry32(seed ^ hashString(`${id}-crew-${i}`)))), [id, seed]);
  // Ghibli : début de la transition en cours (nouvelle étape ou progression, à la minute) et positions d'où elle part (celles de
  // la transition précédente), pour régler la marche sur la distance ; un re-rendu dans la même minute ne change rien.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const since = useMemo(() => Date.now() / 1000, [view.works?.step, view.works?.progress]);
  const track = useRef<{ key: string; from: Pos[]; at: Pos[] }>({ key: '', from: [], at: [] });
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
  const here = crew.map((c) => ({ x: c.x, y: c.y }));
  const key = `${step}|${progress}`;
  track.current = track.current.key === key ? { ...track.current, at: here } : { key, from: track.current.at, at: here };
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
      {crew.map((c, i) => {
        // Ghibli : pantin en gilet, sans miroir ; la boucle (placeWorkers) règle la marche et l'escalade sur la distance.
        const from = track.current.from[i] ?? c;
        const w: WorkerMove = { look: crewLook(c, i), since, dist: still ? 0 : Math.hypot(c.x - from.x, c.y - from.y), k };
        return (
          <g
            key={i}
            data-worker=""
            data-pose={c.pose}
            {...(ghibli ? { 'data-move': JSON.stringify(w) } : {})}
            style={{ transform: `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`, transition: move }}
          >
            <g transform={ghibli ? `scale(${k.toFixed(3)})` : `scale(${(c.dir * k).toFixed(3)} ${k.toFixed(3)})`}>
              {ghibli ? <GhibliFigure outfit={outfits[i]!} sky={sky} rainy={rainy} umbrella={false} work="vest" initial={workerPose(w, since)} /> : <PersonSprite outfit={outfits[i]!} sky={sky} rainy={rainy} umbrella={false} />}
            </g>
            {item(c.holds, c)}
          </g>
        );
      })}
    </g>
  );
}

// Ouvriers Ghibli, collectés une fois par jeu de nœuds, posés par la boucle (marche et escalade réglées sur la distance).
export type PlacedWorker = { fig: Element | null; move: WorkerMove };
export function collectWorkers(root: Element): PlacedWorker[] {
  const out: PlacedWorker[] = [];
  for (const node of root.querySelectorAll('[data-worker][data-move]')) out.push({ fig: node.querySelector('[data-figure]'), move: JSON.parse(node.getAttribute('data-move')!) as WorkerMove });
  return out;
}
export function placeWorkers(workers: PlacedWorker[], t: number, figures: FigureRegistry): void {
  for (const w of workers) poseFigure(figures, w.fig, workerPose(w.move, t));
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
  // Ghibli : pantins (personnel en geste, trajets à pied posés par la boucle) ; centres des entrées d'immeubles (bouts de trajet).
  ghibli?: boolean;
  doorXs?: readonly number[];
};

// ---------- Personnel à pied (Ghibli) ----------
// Script d'un employé sur le trottoir, posé par la boucle (placeStaffWalks) : segments enchaînés depuis `start` (s) ; après le
// dernier (il est entré par une porte, ou sorti du monde), caché. Jamais d'apparition sur place : on sort d'une porte (seuil de
// door-passage.ts), on marche, on rentre par une porte.
type WalkSeg =
  | { k: 'door'; rect: Rect; x: number; from: number; to: number; yaw: number; dur: number }
  | { k: 'turn'; x: number; from: number; to: number; via?: number; dur: number }
  | { k: 'walk'; from: number; to: number; dur: number }
  | { k: 'stand'; x: number; yaw: number; arms: ArmPose; dur: number };
// `k` : px du monde par unité du pantin (phase des pas réglée sur la distance).
export type StaffWalk = { start: number; k: number; segs: WalkSeg[] };
export type StaffWalkView = { where: 'street'; x: number; pose: PoseIn } | { where: 'door'; rect: Rect; passage: Passage; pose: PoseIn } | null;

function segView(s: WalkSeg, p: number, walked: number, k: number): StaffWalkView {
  switch (s.k) {
    case 'door': {
      const depth = s.from + (s.to - s.from) * p;
      return { where: 'door', rect: s.rect, passage: { stage: 'threshold', x: s.x, depth, yaw: s.yaw, gait: 'walk', walked }, pose: { yaw: s.yaw, gait: 'walk', phase: phaseIndexOf(walked / k + depth * 8), head: 0 } };
    }
    case 'turn':
      return { where: 'street', x: s.x, pose: { yaw: turnYaw(s.from, s.to, p, s.via), gait: 'step', phase: phaseIndexOf(walked / k), head: 0 } };
    case 'walk': {
      const d = (s.to - s.from) * p;
      return { where: 'street', x: s.from + d, pose: { yaw: facingYaw(s.to >= s.from ? 1 : -1), gait: 'walk', phase: phaseIndexOf((walked + Math.abs(d)) / k), head: 0 } };
    }
    default:
      return { where: 'street', x: s.x, pose: { yaw: s.yaw, gait: 'stand', phase: 0, head: 0, arms: s.arms } };
  }
}
export function staffWalkAt(w: StaffWalk, t: number): StaffWalkView {
  let c = Math.max(0, t - w.start);
  let walked = 0;
  for (const s of w.segs) {
    if (c < s.dur) return segView(s, s.dur > 0 ? c / s.dur : 1, walked, w.k);
    c -= s.dur;
    if (s.k === 'walk') walked += Math.abs(s.to - s.from);
  }
  return null;
}

// Durée d'une marche visible (la minute affichée, comme le classique) et marge pour être rentré avant le rendu suivant.
const WALK_SPAN_S = 60;
const WALK_SLACK_S = 1;
// Rideau : sortir par la porte du local, se tourner, le lever (ou le baisser) bras au-dessus de la tête, de dos, puis rentrer.
const SHUTTER_SCRIPT_S = THRESHOLD_S + TURN_S + SHUTTER_S;
type WalkCtx = { since: number; doorX: number; door: Rect; width: number; m: CityMetrics; k: number; doorXs: readonly number[] };
export function staffWalkOf(state: StaffState, c: WalkCtx): StaffWalk | null {
  const outOf = (rect: Rect, x: number, to: number, via?: number): WalkSeg[] => [
    { k: 'door', rect, x, from: 1, to: 0, yaw: YAW_FRONT, dur: THRESHOLD_S },
    { k: 'turn', x, from: YAW_FRONT, to, ...(via !== undefined ? { via } : {}), dur: TURN_S },
  ];
  const into = (rect: Rect, x: number, from: number): WalkSeg[] => [
    { k: 'turn', x, from, to: YAW_BACK, dur: TURN_S },
    { k: 'door', rect, x, from: 0, to: 1, yaw: YAW_BACK, dur: THRESHOLD_S },
  ];
  const side = state.side;
  switch (state.where) {
    case 'opening':
    case 'closing':
      return {
        start: c.since,
        k: c.k,
        segs: [...outOf(c.door, c.doorX, YAW_BACK, facingYaw(side)), { k: 'stand', x: c.doorX, yaw: YAW_BACK, arms: 'overhead', dur: SHUTTER_S }, { k: 'door', rect: c.door, x: c.doorX, from: 0, to: 1, yaw: YAW_BACK, dur: THRESHOLD_S }],
      };
    case 'walking-in':
    case 'walking-out': {
      // Bout du trajet du côté `side` (comme les clients) : une entrée d'immeuble, sinon le bord du monde (hors champ).
      const inbound = state.where === 'walking-in';
      const far = endDoorOf(c.doorX, (-side) as 1 | -1, c.width, c.doorXs, MAX_VISIT_FALLBACK_PX);
      const farX = far ?? (side > 0 ? -WORLD_MARGIN : c.width + WORLD_MARGIN);
      const farRect = far === null ? null : entranceOpening(far - DOOR_WIDTH / 2, c.m);
      const face = facingYaw(inbound ? side : ((-side) as 1 | -1));
      const head = inbound ? (farRect ? outOf(farRect, farX, face) : []) : outOf(c.door, c.doorX, face);
      const tail = inbound ? into(c.door, c.doorX, face) : farRect ? into(farRect, farX, face) : [];
      const used = [...head, ...tail].reduce((n, x) => n + x.dur, 0);
      const walk: WalkSeg = { k: 'walk', from: inbound ? farX : c.doorX, to: inbound ? c.doorX : farX, dur: Math.max(1, WALK_SPAN_S - WALK_SLACK_S - used) };
      return { start: c.since, k: c.k, segs: [...head, walk, ...tail] };
    }
    default:
      return null;
  }
}
const staffStreetT = (x: number, y: number, k: number): string => `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})`;
// Tenue de travail des employés : tablier pour les métiers de bouche.
const APRON: ReadonlySet<Family> = new Set(['counter', 'drink', 'table']);
const workOf = (type: ShopTypeId): Work => (APRON.has(SHOP_FAMILY[type]) ? 'apron' : 'none');

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const NO_DOORS: readonly number[] = [];

export function StaffLayer({ view, shifts, frame, metrics, minutes, reduced, date, width, sky, rainy, umbrella, seed, seats, post, ghibli = false, doorXs = NO_DOORS }: StaffProps): ReactElement | null {
  const outfits = useMemo(() => new Map(shifts.map((s) => [s.id, staffOutfit(seed, s.outfitKey)])), [shifts, seed]);
  const cast = staffCast(view, shifts, date, minutes, reduced);
  // Début de la minute affichée (horloge murale) : repère de la relève de l'ouvreur.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const since = useMemo(() => Date.now() / 1000, [minutes]);
  if (cast.shutter === null) return null;
  // Ghibli : l'ouvreur sort par la porte, lève le rideau et rentre (SHUTTER_SCRIPT_S + seuil) avant d'apparaître derrière la vitrine.
  const swapAt = (since + (ghibli ? SHUTTER_SCRIPT_S + THRESHOLD_S : SHUTTER_S)).toFixed(2);
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
              // Ghibli : le geste de l'instant du rendu (celui que la boucle posera), pour que le pantin ne saute pas à chaque minute.
              const pose = reduced ? STANDING : gestureAt(type, 'staff', ghibli ? since : 0, gseed);
              // Ghibli : de trois quarts vers sa place de travail (même côté que le classique), sans miroir.
              const yaw = dir > 0 ? 2 : 6;
              return (
                <g
                  key={s.id}
                  data-staff-member={s.id}
                  data-staff-where="inside"
                  data-posed="staff"
                  data-gesture-type={type}
                  data-gesture-seed={gseed}
                  {...(cast.handover === s.id ? { 'data-swap': 'in', 'data-swap-at': swapAt, opacity: 0 } : {})}
                  {...(ghibli ? { 'data-yaw': yaw } : {})}
                  transform={`translate(${x.toFixed(2)} ${win.h - 1}) scale(${(ghibli ? 1 : dir) * STAFF_SCALE} ${STAFF_SCALE})`}
                >
                  {ghibli ? (
                    <GhibliPosed outfit={outfits.get(s.id)!} sky={inSky} rainy={false} accessory={ACCESSORY[type]} figure={ghibliPoseOf(pose, yaw, false)} gesture={pose} work={workOf(type)} />
                  ) : (
                    <PosedPerson outfit={outfits.get(s.id)!} sky={inSky} rainy={false} umbrella={false} accessory={ACCESSORY[type]} pose={pose} />
                  )}
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
        if (ghibli) {
          // Pantin : trajet scripté (porte → trottoir → porte), posé par la boucle ; ni transition CSS ni opacité de fondu.
          const walk = visible && !reduced ? staffWalkOf(state, { since, doorX, door, width, m: metrics, k, doorXs }) : null;
          const v0 = walk ? staffWalkAt(walk, since) : null;
          const onStreet = v0?.where === 'street' ? v0 : null;
          const atSill = v0?.where === 'door' ? v0 : null;
          const dPos: Passage = atSill?.passage ?? { stage: 'threshold', x: doorX, depth: 1, yaw: YAW_FRONT, gait: 'walk', walked: 0 };
          const { clip, dark } = sillBox(atSill?.rect ?? door, dPos.depth, metrics, k);
          const withUmbrella = umbrella && !lifting;
          const fig = (p: FigurePose, on: boolean): ReactElement => <GhibliFigure outfit={outfit} sky={sky} rainy={rainy} umbrella={withUmbrella} work={workOf(type)} initial={p} hidden={!on} />;
          return (
            <g key={s.id} data-staff-member={s.id} data-staff-where={state.where} data-active={visible ? 'true' : 'false'} {...(walk ? { 'data-walk': JSON.stringify(walk) } : {})}>
              <g data-staff-street="" transform={staffStreetT(onStreet ? onStreet.x : x, metrics.doorY, k)} visibility={onStreet ? 'visible' : 'hidden'}>
                {fig(onStreet ? onStreet.pose : REST, onStreet !== null)}
              </g>
              <svg data-staff-door="" x={clip.x.toFixed(2)} y={clip.y.toFixed(2)} width={clip.w.toFixed(2)} height={clip.h.toFixed(2)} overflow="hidden" visibility={atSill ? 'visible' : 'hidden'}>
                <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={atSill ? doorDarkOpacity(dPos.depth).toFixed(2) : '0.00'} />
                <g data-door-fig="" transform={sillFigTransform(dPos, clip, metrics, k, 1)} opacity={(1 - dPos.depth).toFixed(2)}>
                  {fig(atSill ? atSill.pose : REST, atSill !== null)}
                </g>
              </svg>
            </g>
          );
        }
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
// Ghibli (`g`) : pantin orienté `yaw`, posé par poseFigure (registre `figures`).
export type PosedStaff = { h: PoseHandles; type: ShopTypeId; seed: number; g: GhibliPoseHandles | null; yaw: number };
export function collectPosedStaff(root: Element): PosedStaff[] {
  const out: PosedStaff[] = [];
  for (const node of root.querySelectorAll('[data-posed="staff"]')) {
    const ghibli = node.hasAttribute('data-yaw');
    out.push({ h: poseHandles(node), type: node.getAttribute('data-gesture-type') as ShopTypeId, seed: Number(node.getAttribute('data-gesture-seed')), g: ghibli ? ghibliHandles(node) : null, yaw: Number(node.getAttribute('data-yaw') ?? 0) });
  }
  return out;
}
export function placeStaff(staff: PosedStaff[], t: number, figures: FigureRegistry | null = null): void {
  for (const s of staff) {
    const pose = gestureAt(s.type, 'staff', t, s.seed);
    if (s.g && figures) applyGhibliPose(figures, s.g, ghibliPoseOf(pose, s.yaw, false), pose);
    else applyPose(s.h, pose);
  }
}

// Employés à pied (Ghibli) : script lu une fois par jeu de nœuds, posé à chaque image (trottoir ou seuil d'une porte).
export type WalkingStaff = { street: Element | null; door: Element | null; streetFig: Element | null; doorFig: Element | null; walk: StaffWalk };
export function collectStaffWalks(root: Element): WalkingStaff[] {
  const out: WalkingStaff[] = [];
  for (const node of root.querySelectorAll('[data-staff-member][data-walk]')) {
    const street = node.querySelector(':scope > [data-staff-street]');
    const door = node.querySelector(':scope > svg[data-staff-door]');
    out.push({ street, door, streetFig: street?.querySelector('[data-figure]') ?? null, doorFig: door?.querySelector('[data-figure]') ?? null, walk: JSON.parse(node.getAttribute('data-walk')!) as StaffWalk });
  }
  return out;
}
export function placeStaffWalks(walks: WalkingStaff[], t: number, m: CityMetrics, figures: FigureRegistry): void {
  for (const w of walks) {
    const v = staffWalkAt(w.walk, t);
    setIfChanged(w.street, 'visibility', v?.where === 'street' ? 'visible' : 'hidden');
    setIfChanged(w.door, 'visibility', v?.where === 'door' ? 'visible' : 'hidden');
    if (v?.where === 'street') {
      setIfChanged(w.street, 'transform', staffStreetT(v.x, m.doorY, w.walk.k));
      poseFigure(figures, w.streetFig, v.pose);
    } else hideFigure(figures, w.streetFig);
    if (v?.where === 'door' && w.door) {
      placeSill(w.door, v.rect, v.passage, m, w.walk.k, 1);
      poseFigure(figures, w.doorFig, v.pose);
    } else hideFigure(figures, w.doorFig);
  }
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
  ghibli?: boolean;
  // Largeur du monde et centres des entrées d'immeubles : d'où viennent les arrivées de la file de la boîte de nuit.
  width: number;
  doorXs?: readonly number[];
};

export function ShopOutdoors({ view, frame, metrics, minutes, date, weather, walkers, reduced, sky, seed, sessionT0, ghibli = false, width, doorXs = NO_DOORS }: OutdoorsProps): ReactElement | null {
  const type = view.sign?.type ?? null;
  if (type === 'nightclub') return <NightclubDoor view={view} frame={frame} metrics={metrics} minutes={minutes} date={date} reduced={reduced} sky={sky} seed={seed} sessionT0={sessionT0} ghibli={ghibli} width={width} doorXs={doorXs} />;
  if (type === null || SHOP_DEFS[type].terrace === 0) return null;
  // Une terrasse sortie attire : un fond de 0,3 s'ajoute à l'affluence du type (sinon les chaises restent presque toujours vides).
  const crowdOf = (m: number): number => Math.min(1, 0.3 + 0.9 * crowdAt(SHOP_DEFS[type], m) * (0.6 + 0.4 * walkers));
  return (
    <ShopTerrace
      view={view}
      frame={frame}
      metrics={metrics}
      minutes={minutes}
      date={date}
      weather={weather}
      crowd={crowdOf(minutes)}
      crowdNear={crowdOf}
      reduced={reduced}
      sky={sky}
      seed={seed}
      waiterOutfit={staffOutfit(seed, `${view.slot.id}-waiter`)}
      ghibli={ghibli}
    />
  );
}

// ---------- Plafond global des figurants (spec §6) ----------
// Toujours comptés, jamais retirés : personnel (derrière la vitrine ; à la porte ou en route, visible), serveur de terrasse et
// porteur de tables, équipe du chantier, déménageurs et camion, videurs ; la file de la boîte compte pour sa longueur maximale.
// Derrière la vitrine : les nœuds posés (`data-posed`), sauf celui de la relève de l'ouvreur (`data-swap`), qui est la même
// personne que celle à la porte ; le nœud de sortie caché (data-staff-where="inside", inactif) n'est pas compté.
const KEEP_SELECTOR = [
  '[data-posed="staff"]:not([data-swap])',
  '[data-staff-member][data-active="true"]',
  '[data-terrace-waiter]',
  '[data-terrace-carrier]',
  '[data-worker]',
  '[data-mover="porter"]',
  '[data-mover="truck"]',
  '[data-bouncer]',
].join(', ');

export type ShopSpriteCount = { keep: number; customers: number; guests: number };

function budgetSprites(root: Element): { sprites: BudgetSprite[]; guests: Element[] } {
  const sprites: BudgetSprite[] = [];
  root.querySelectorAll(KEEP_SELECTOR).forEach((_, i) => sprites.push({ id: `keep-${i}`, kind: 'keep', x: 0 }));
  root.querySelectorAll('[data-queue-max]').forEach((n, i) => sprites.push({ id: `queue-${i}`, kind: 'keep', x: 0, weight: Number(n.getAttribute('data-queue-max')) }));
  // Une visite compte pour une silhouette (sur le trottoir OU derrière la vitrine), si son local peut recevoir des clients.
  for (const n of root.querySelectorAll('[data-customer-inside][data-may="true"]')) sprites.push({ id: n.getAttribute('data-visit')!, kind: 'customer', x: Number(n.getAttribute('data-x')) });
  const guests = [...root.querySelectorAll('[data-terrace-guest]')];
  guests.forEach((g, i) => sprites.push({ id: `guest-${i}`, kind: 'terrace', x: Number(g.getAttribute('data-x')) }));
  return { sprites, guests };
}

// Combien de figurants de chaque classe la scène peut montrer à cette minute (les clients comptent tous ceux qui peuvent venir).
export function countShopSprites(root: Element): ShopSpriteCount {
  const { sprites } = budgetSprites(root);
  const sum = (kind: BudgetSprite['kind']): number => sprites.filter((s) => s.kind === kind).reduce((n, s) => n + (s.weight ?? 1), 0);
  return { keep: sum('keep'), customers: sum('customer'), guests: sum('terrace') };
}

// Appliqué une fois par minute (à chaque nouveau jeu de nœuds) : cache les convives de terrasse en trop (visibility) et rend les
// visites à suspendre pour la minute (placeCustomers). Stable sur la minute : pas de clignotement quand un client entre ou sort.
export function shopSpriteBudget(root: Element, width: number, cap = capFor(width)): Set<string> {
  const { sprites, guests } = budgetSprites(root);
  const drop = spriteBudget(sprites, width / 2, cap);
  guests.forEach((g, i) => setIfChanged(g, 'visibility', drop.has(`guest-${i}`) ? 'hidden' : 'visible'));
  return new Set([...drop].filter((id) => !id.startsWith('guest-')));
}

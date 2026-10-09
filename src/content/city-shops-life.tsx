import { useMemo, type ReactElement } from 'react';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor } from '../core/library/city/people';
import { visitAt, visitHappens, type Visit } from '../core/library/city/shops/customers';
import type { Change } from '../core/library/city/shops/lifecycle';
import type { ShopFrame } from '../core/library/city/shops/slots';
import type { ShopView } from '../core/library/city/shops/view';
import { WORK_STEPS, type WorkStep } from '../core/library/city/shops/works';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { PersonSprite } from './city-sprites';
import { SHOP_DEFS } from '../core/library/city/shops/catalog';
import { LIT_SKY } from './shop-interiors';
import { CarriedPlacard, CarriedSign, LadderSprite, type WorkerPose } from './shop-sprites';

// Vie des commerces dans le calque animé de la Ville (vague 1b-iv-a) : clients qui entrent, restent derrière la vitrine et
// ressortent ; équipe du chantier du matin (deux ouvriers, une échelle, l'ancienne et la nouvelle enseigne).
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
export type CustomerState = { on: boolean; inside: boolean; x: number; fade: number };

// Présence d'une visite à l'instant t : en route (ou dans le magasin) et tirée pour ce tour de cycle, local ouvert (gate > 0).
export function customerState(v: Visit, gate: number, width: number, t: number): CustomerState {
  const pos = visitAt(v, width, t);
  const on = pos !== null && gate > 0 && visitHappens(v, t, gate);
  return { on, inside: pos?.stage === 'inside', x: pos?.x ?? v.doorX, fade: on && pos ? pos.fade : 0 };
}

const sidewalkTransform = (v: Visit, x: number, m: CityMetrics): string => {
  const k = m.unit * STREET_SCALE.person * v.scale;
  return `translate(${x.toFixed(1)} ${m.doorY.toFixed(1)}) scale(${(v.dir * k).toFixed(3)} ${k.toFixed(3)})`;
};
const insideTransform = (v: Visit, f: ShopFrame, shift = 0): string => {
  const k = INSIDE_SCALE * v.scale;
  return `translate(${(v.innerX - f.window.x).toFixed(1)} ${(f.window.h - shift - INSIDE_DY).toFixed(1)}) scale(${(v.dir * k).toFixed(3)} ${k.toFixed(3)})`;
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
    }
    const inn = nodes.get(insideId(v));
    if (inn) {
      const on = s.on && s.inside;
      setIfChanged(inn, 'data-active', on ? 'true' : 'false');
      setIfChanged(inn, 'opacity', (on ? s.fade : 0).toFixed(2));
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
                  <PersonSprite outfit={v.outfit} sky={lit ? LIT_SKY : sky} rainy={false} umbrella={false} />
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

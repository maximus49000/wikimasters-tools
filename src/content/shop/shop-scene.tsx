import { Fragment, memo, useLayoutEffect, useMemo, useRef, type ReactElement } from 'react';
import { DOOR_DARK } from '../../core/library/city/doorway';
import { STREET_SCALE, type CityMetrics } from '../../core/library/city/metrics';
import { outfitFor, type Outfit } from '../../core/library/city/people';
import { ACCESSORY } from '../../core/library/city/shops/gestures';
import type { PictoId, PropId } from '../../core/library/city/shops/scene/moves';
import { slotIndexAt } from '../../core/library/city/shops/scene/slots';
import { ghibliWorktopOf } from '../../core/library/city/shops/scene/stage';
import type { StreetState } from '../../core/library/city/shops/scene/types';
import { mulberry32 } from '../../core/library/scene-world';
import type { Sky } from '../../core/library/sky';
import { sillBox } from '../door-passage';
import { useFigureRegistry } from '../figure/figure-host';
import { GhibliFigure, type PoseIn } from '../figure/ghibli-figure';
import { LIT_SKY } from '../shop-interiors';
import { ghibliAwningShift } from './ghibli-shop-glass';
import { PictoGlyph } from './picto';
import { CARRIED, CARRY_SLOTS, PROP_SLOTS, STAFF_SCALE, collectScene, placeScene, runtimes, workOf, type ShopRt } from './scene-place';
import { PropSpriteMemo, WornFramesMemo } from './scene-props';
import { makeScore, peekScore, planOf, propsOf, sizeCache, slotGate, type SceneShop } from './scene-scores';

export { collectScene, forgetScenes, muteScene, placeScene, sceneBudget, sceneParties, type SceneNodes } from './scene-place';
export type { SceneShop, SceneStaff } from './scene-scores';

// Scène Ghibli des commerces (G4b, spec §7) : rend, pour chaque boutique du metteur en scène, une réserve de nœuds que la boucle
// (placeScene) pose à chaque image sans re-rendu : employés derrière la vitrine (un <svg> imbriqué chacun, rogné au plan de
// travail quand il est derrière le comptoir), clients dans la vitrine (repère et rognage de la vitrine, comme ShopCustomers),
// sur le trottoir et dans la porte (seuil rogné de door-passage) ; quelques emplacements d'objets en main, de montures portées
// et de pictos par boutique, posés aux accroches du pantin qui les porte. Remplace en Ghibli les clients intérieurs de
// ShopCustomers et le personnel « debout à son poste » de StaffLayer, pour les boutiques `inScene`.
type Props = {
  shops: SceneShop[];
  seed: number;
  day: number;
  secondsOfDay: number;
  // Horloge murale du rendu (s) : la boucle lit la scène à `secondsOfDay + (t − t0)`.
  t0: number;
  width: number;
  metrics: CityMetrics;
  sky: Sky;
  rainy: boolean;
  umbrella: boolean;
  gates: Map<string, number>;
  street: (slotId: string, slotStartS: number, length: number) => StreetState;
  doorXs: readonly number[];
  still: boolean;
  // Taille de la réserve de clients imposée (tests : réserve épuisée) ; absente : poolFor(capacité).
  pool?: number;
};

// Calculs de partitions au rendu : au montage, le créneau courant des premières boutiques ; à chaque re-rendu (passage d'un
// créneau), une seule ; les autres viennent par la boucle (une par image).
const MOUNT_SCORES = 4;
const RENDER_SCORES = 1;
// Pantin de réserve : sa tenue et sa palette sont posées par la boucle à l'affectation (le rendu ne les relit jamais).
const SPARE: Outfit = outfitFor('ordinary', mulberry32(7));
const REST: PoseIn = { yaw: 4, gait: 'stand', phase: 0, head: 0, arms: 'down' };
const PICTOS: readonly PictoId[] = ['question', 'bang', 'note', 'joy', 'sweat', 'heart'];
const WORN_YAWS = Array.from({ length: 16 }, (_, i) => i);
const WORN_SLOTS = 2;
// Clients à la fois dans la réserve d'une boutique (dedans, à la porte, sur le trottoir) : sa capacité et deux de plus.
export const poolFor = (capacity: number): number => Math.max(4, Math.min(10, capacity + 2));
// Ciel au huitième de jour près (comme la palette des pantins) : objets et tenues ne se redessinent pas à chaque minute.
const useStepSky = (sky: Sky): Sky => {
  const q = Math.round(sky.daylight * 8) / 8;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ ...sky, daylight: q }), [q]);
};

function PropSet({ ids, sky, accessory }: { ids: readonly PropId[]; sky: Sky; accessory: string | null }): ReactElement {
  return (
    <>
      {ids.map((id) => (
        <g key={id} data-scene-prop={id} display="none">
          <PropSpriteMemo id={id} sky={sky} accessory={accessory} />
        </g>
      ))}
    </>
  );
}

type NodesProps = { shop: SceneShop; rt: ShopRt; ids: readonly PropId[]; pool: number; shift: number; present: string; sky: Sky; inSky: Sky; rainy: boolean; umbrella: boolean; kStreet: number };
// Nœuds d'une boutique : re-rendus seulement quand leur structure, la présence des employés ou le ciel (au huitième) change.
const ShopNodes = memo(
  function ShopNodes({ shop, rt, ids, pool, shift, present, sky, inSky, rainy, umbrella, kStreet }: NodesProps): ReactElement {
    const { frame } = shop;
    const accessory = ACCESSORY[rt.plan.type];
    const carried = ids.filter((id) => CARRIED.has(id));
    const { clip, dark } = sillBox(frame.door, 1, rt.metrics, kStreet);
    return (
      <g data-scene-shop={rt.plan.id}>
        <svg data-shop-window={rt.plan.id} data-scene="" x={frame.window.x} y={frame.window.y + shift} width={frame.window.w} height={rt.hSvg} overflow="hidden">
          {shop.staff.map((s, i) => (
            <svg key={s.id} data-scene-staff={s.id} data-present={present[i] === '1' ? 'true' : 'false'} data-active="false" display="none" x={0} y={0} width={frame.window.w} height={rt.hSvg} overflow="hidden">
              <g data-scene-fig="" transform={`translate(0 ${rt.staffFloor}) scale(${STAFF_SCALE})`}>
                <GhibliFigure outfit={s.outfit} sky={inSky} rainy={false} umbrella={false} work={rt.work} initial={REST} hidden />
              </g>
            </svg>
          ))}
          <g data-scene-back="">
            {Array.from({ length: pool }, (_, i) => (
              <g key={i} data-scene-actor="" data-entry={i} data-active="false" display="none" transform={`translate(0 ${rt.floor})`}>
                <GhibliFigure outfit={SPARE} sky={LIT_SKY} rainy={false} umbrella={false} initial={REST} hidden />
              </g>
            ))}
          </g>
          <g data-scene-front="" />
          {Array.from({ length: PROP_SLOTS }, (_, i) => (
            <g key={i} data-prop-slot={i} display="none">
              <PropSet ids={ids} sky={inSky} accessory={accessory} />
            </g>
          ))}
          {ids.includes('frames') &&
            Array.from({ length: WORN_SLOTS }, (_, i) => (
              <g key={i} data-worn-slot={i} display="none">
                {WORN_YAWS.map((y) => (
                  <g key={y} data-worn-yaw={y} display="none">
                    <WornFramesMemo yaw={y} sky={inSky} />
                  </g>
                ))}
              </g>
            ))}
          {[0, 1].map((i) => (
            <g key={i} data-picto-slot={i} display="none">
              <g data-picto-pop="">
                {PICTOS.map((id) => (
                  <g key={id} data-picto-glyph={id} display="none">
                    <PictoGlyph id={id} />
                  </g>
                ))}
              </g>
            </g>
          ))}
        </svg>
        {Array.from({ length: pool }, (_, i) => (
          <Fragment key={i}>
            <g data-scene-street="" data-entry={i} data-active="false" display="none" transform={`translate(${rt.doorX.toFixed(1)} ${rt.metrics.doorY.toFixed(1)})`}>
              <GhibliFigure outfit={SPARE} sky={LIT_SKY} rainy={false} umbrella={false} initial={REST} hidden />
            </g>
            <svg data-scene-door="" data-entry={i} data-active="false" display="none" x={clip.x.toFixed(2)} y={clip.y.toFixed(2)} width={clip.w.toFixed(2)} height={clip.h.toFixed(2)} overflow="hidden">
              <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity="0.00" />
              <g data-door-fig="">
                <GhibliFigure outfit={SPARE} sky={LIT_SKY} rainy={false} umbrella={false} initial={REST} hidden />
              </g>
            </svg>
          </Fragment>
        ))}
        {carried.length > 0 &&
          Array.from({ length: CARRY_SLOTS }, (_, i) => (
            <g key={i} data-carry-slot={i} display="none">
              <PropSet ids={carried} sky={sky} accessory={accessory} />
            </g>
          ))}
      </g>
    );
  },
  (a, b) => a.present === b.present && a.ids.join() === b.ids.join() && a.sky === b.sky && a.inSky === b.inSky && a.rainy === b.rainy && a.umbrella === b.umbrella && a.kStreet === b.kStreet,
);

export function ShopScene({ shops, seed, day, secondsOfDay, t0, width, metrics, sky, rainy, umbrella, gates, street, doorXs, still, pool: poolSize }: Props): ReactElement {
  const root = useRef<SVGGElement | null>(null);
  const mounted = useRef(false);
  sizeCache(shops.length);
  const figures = useFigureRegistry();
  const env = useMemo(() => ({ seed, day, street }), [seed, day, street]);
  const stepSky = useStepSky(sky);
  const offset = secondsOfDay - t0;
  let budget = mounted.current ? RENDER_SCORES : MOUNT_SCORES;
  const geo = `${width}|${doorXs.join(',')}`;
  const items = shops.map((shop) => {
    const plan = planOf(shop, env);
    const gate = gates.get(plan.id) ?? 0;
    // Rendu initial : seulement le créneau courant, pour les premières boutiques (le reste par la boucle, une par image).
    if (!still && shop.open && budget > 0) {
      const n = slotIndexAt(plan.type, secondsOfDay);
      const g = slotGate(plan, n, gate);
      if (!peekScore(plan, n, g)) {
        budget--;
        makeScore(plan, n, g);
      }
    }
    const { frame, view } = shop;
    const shift = ghibliAwningShift(view, frame, sky);
    const hSvg = frame.window.h - shift;
    const doorSide = plan.stage.doorEdge === 'right' ? 'left' : 'right';
    const lit = sky.daylight < 0.45 && view.phase === 'open';
    const rt: ShopRt = {
      plan, open: shop.open, gate, offset, still, geo: `${frame.door.x}|${geo}`, staffById: new Map(shop.staff.map((s) => [s.id, s])), winX: frame.window.x, hSvg, floor: hSvg - 3, staffFloor: hSvg - 1,
      worktop: ghibliWorktopOf(plan.type, frame.sign.w, doorSide) - shift, doorX: frame.door.x + frame.door.w / 2, doorRect: frame.door,
      metrics, width, doorXs, sky, inSky: lit ? LIT_SKY : sky, rainy, umbrella, work: workOf(plan.type),
    };
    const ids = propsOf(plan);
    const pool = poolSize ?? poolFor(plan.capacity);
    const present = shop.staff.map((s) => (shop.open && s.spans.some(([a, b]) => secondsOfDay >= a && secondsOfDay < b) ? '1' : '0')).join('');
    // Structure dans la clé (réserve, employés, géométrie) : un changement remonte la boutique entière (aucun nœud déplacé par la
    // boucle — calque avant de la vitrine — n'est jamais retiré seul par React ; l'état de la boucle est gardé par local). Un objet
    // nouvellement vu s'ajoute aux emplacements par simple re-rendu.
    const key = `${seed}|${plan.id}|${plan.type}|${pool}|${shift}|${frame.window.x},${frame.window.w},${frame.window.h}|${frame.door.x}|${metrics.doorY}|${shop.staff.map((s) => s.id).join(',')}`;
    return { shop, rt, ids, pool, shift, present, key, inSky: lit ? LIT_SKY : stepSky };
  });
  // Après la mise en page : chaque boutique publie son état d'exécution (lu par collectScene), puis première pose.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    for (const node of el.querySelectorAll(':scope > [data-scene-shop]')) {
      const it = items.find((x) => x.rt.plan.id === node.getAttribute('data-scene-shop'));
      if (it) runtimes.set(node, it.rt);
    }
    mounted.current = true;
    placeScene(collectScene(el), t0, figures, []);
  });
  const kStreet = metrics.unit * STREET_SCALE.person;
  return (
    <g data-shop-scene="" ref={root}>
      {items.map((it) => (
        <ShopNodes key={it.key} shop={it.shop} rt={it.rt} ids={it.ids} pool={it.pool} shift={it.shift} present={it.present} sky={stepSky} inSky={it.inSky} rainy={rainy} umbrella={umbrella} kStreet={kStreet} />
      ))}
    </g>
  );
}

import { useEffect, useId, useMemo, useReducer, type ReactElement, type ReactNode, type Ref } from 'react';
import { FADE_S, useFadeLight } from './fade-light';
import { lampLit, lampsFor } from '../core/library/city/lamps';
import { STREET_SCALE, cityMetrics } from '../core/library/city/metrics';
import { LANTERN, lampBlobs, patchBox, shopBlobs, wetHalfWidth, wetStrokes } from '../core/library/city/night-light';
import { PAINT_VERSION, TILE, momentKey } from '../core/library/paint/city-painter';
import type { FondMoment } from '../core/library/paint/fond-time';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import { idle } from './paint-queue';
import { PaintRegistry } from './paint-registry';
import { AMBER, AMBER_CORE, litPatchPainter, paintWetColumn } from './painted-city';

// Lumière de nuit de la ville peinte (G5, « deux peintures », maquette g5-fetes notes §5), hors filtre d'étalonnage. Les
// tranches de nuit restent bleues ; par lampadaire allumé et par vitrine allumée, une DÉCOUPE de la version éclairée du décor
// de jour (painted-city.ts, paintLitPatch) est posée par-dessus : près de la lumière, le décor retrouve ses couleurs,
// réchauffées. Dans l'air, seul un bloom serré autour du verre (le sprite du lampadaire ne peint que le verre allumé) ; sous
// la pluie, halo diffus, cône très léger et colonne de lumière en traits sur la chaussée mouillée. Pas de reflet inversé
// flou (hors premier portage, notes §5 (d)).
// Un groupe par lampadaire (`lampsFor`), allumé selon la même règle que le sprite (`lampLit`) ; `dim` règle l'intensité
// (nuit ou ciel couvert), avec la transition d'opacité de 4 s des lumières de la ville.

export type NightShop = { x: number; w: number; top: number; lit: boolean };
type Props = {
  width: number;
  height: number;
  seed: number;
  minutes: number;
  daylight: number;
  dim: number;
  forcedNight?: boolean;
  plan: CityPaintPlan | null;
  // Instant du fond vivant des tranches affichées (la découpe éclairée repeint les mêmes volets et le même linge).
  moment?: FondMoment;
  shops: readonly NightShop[];
  rainy: boolean;
};

const FADE = `opacity ${FADE_S}s ease`;
// Lumière à fondu de 4 s (vitrine, réverbère, halo) : opacité `dim` allumée ; éteinte au repos, cachée (display none,
// fade-light.ts : un nœud à opacité 0 reste peint et passe par la mise en calques à chaque image). Rien ne change à l'écran :
// allumage depuis 0 (nœud montré, style relu), extinction cachée seulement après le fondu.
function FadeG({ lit, dim, children, ...data }: { lit: boolean; dim: number; children: ReactNode } & Record<`data-${string}`, string | number>): ReactElement {
  const f = useFadeLight(lit);
  return (
    <g ref={f.ref as Ref<SVGGElement>} {...data} opacity={f.on ? dim : 0} display={f.display} style={{ transition: FADE }}>
      {children}
    </g>
  );
}
// Découpes et colonnes de pluie : au plus une peinture par image d'animation, partagées par toutes les scènes (même graine).
const NIGHT_MAX = 160;
let registry = new PaintRegistry('night-light', { max: NIGHT_MAX, perFrame: 1, schedule: (cb) => void idle(cb) });
export function resetNightLightForTests(): void {
  registry = new PaintRegistry('night-light', { max: NIGHT_MAX, perFrame: 1, schedule: (cb) => void idle(cb) });
}

type Job = { key: string; paint: () => string };

// Images de nuit voulues : demandées au registre (rien n'est demandé sans tâche : jamais de découpe de jour) ; re-rendu
// quand une image arrive. La lecture se fait par `registry.get` au rendu.
function useNightImages(jobs: readonly Job[]): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const sig = jobs.map((j) => j.key).join('\n');
  useEffect(() => {
    const cancels = jobs.filter((j) => registry.get(j.key) === null).map((j) => registry.want(j.key, j.paint, bump));
    return () => {
      for (const c of cancels) c();
    };
    // `sig` résume les clés : les tâches recréées à chaque rendu avec les mêmes clés ne relancent rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}

export function GhibliNightLight({ width, height, seed, minutes, daylight, dim, forcedNight = false, plan, shops, rainy, moment }: Props): ReactElement {
  const lamps = useMemo(() => lampsFor(width, seed), [width, seed]);
  const m = cityMetrics(height);
  const k = m.unit * STREET_SCALE.lamp;
  const u = m.unit;
  const depth = m.farSide - m.curb;
  const ids = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const bloomId = `${ids}-bloom`;
  const haloId = `${ids}-halo`;
  const coneId = `${ids}-cone`;
  const base = `${seed}|${width}|${height}|${PAINT_VERSION}`;
  // États lents des tranches sous la boîte : la découpe est repeinte quand ils changent.
  const slow = (box: { x: number; w: number }): string => {
    if (!plan || !moment) return '';
    const t0 = Math.max(0, Math.floor(box.x / TILE));
    const t1 = Math.max(t0, Math.floor((box.x + box.w) / TILE));
    const out: string[] = [];
    for (let t = t0; t <= t1 && t * TILE < plan.width; t++) out.push(momentKey(plan, t, moment));
    return `|${out.join('~')}`;
  };

  const lampViews = lamps.map((lamp) => {
    const lit = lampLit(lamp, minutes, daylight, forcedNight);
    const blobs = lampBlobs(lamp.x, m.curb, u, k);
    // Colonne de pluie : 10u de demi-largeur (maquette 7u ; trop étroite au banc face à night-rain).
    const hw = 10 * u;
    return {
      lamp,
      lit,
      blobs,
      box: patchBox(blobs),
      patchKey: `lamp|${base}|${lamp.x}|${k.toFixed(3)}${lit ? slow(patchBox(blobs)) : ''}`,
      wetKey: `wet|${seed}|${lamp.x}|${hw.toFixed(2)}|${u.toFixed(3)}|${depth.toFixed(1)}`,
      hw,
      colW: 2 * wetHalfWidth(hw, u),
    };
  });
  const shopViews = shops.map((s, i) => {
    const blobs = shopBlobs(s.x, s.w, m.ground, s.top, u);
    const hw = 0.22 * s.w;
    return {
      shop: s,
      i,
      blobs,
      box: patchBox(blobs),
      patchKey: `shop|${base}|${s.x.toFixed(1)}|${s.w.toFixed(1)}|${s.top.toFixed(1)}${s.lit ? slow(patchBox(blobs)) : ''}`,
      wetKey: `wet|${seed}|${(s.x + s.w / 2).toFixed(1)}|${hw.toFixed(2)}|${u.toFixed(3)}|${depth.toFixed(1)}`,
      hw,
      colW: 2 * wetHalfWidth(hw, u),
    };
  });

  // Tâches : seulement pour ce qui est allumé (une découpe n'est jamais peinte de jour).
  const jobs: Job[] = [];
  const paintPatch = litPatchPainter();
  const wetJob = (key: string, x: number, hw: number, w: number): Job => ({
    key,
    paint: () => paintWetColumn(wetStrokes(hw, depth, u, (seed ^ Math.round(x * 131)) >>> 0), w, depth),
  });
  for (const v of lampViews) {
    if (!v.lit) continue;
    if (plan) jobs.push({ key: v.patchKey, paint: () => paintPatch(plan, v.box, v.blobs, undefined, moment) });
    if (rainy) jobs.push(wetJob(v.wetKey, v.lamp.x, v.hw, v.colW));
  }
  for (const v of shopViews) {
    if (!v.shop.lit) continue;
    if (plan) jobs.push({ key: v.patchKey, paint: () => paintPatch(plan, v.box, v.blobs, undefined, moment) });
    if (rainy) jobs.push(wetJob(v.wetKey, v.shop.x + v.shop.w / 2, v.hw, v.colW));
  }
  useNightImages(jobs);

  // Image cuite (gardée pendant le fondu de sortie quand la lumière s'éteint), sinon rien.
  const patchImage = (key: string, box: { x: number; y: number; w: number; h: number }, shop = false): ReactElement | null => {
    const url = plan ? registry.get(key) : null;
    return url ? <image data-lit-patch="" data-shop={shop ? '' : undefined} href={url} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="none" /> : null;
  };
  const column = (key: string, cx: number, w: number): ReactElement => {
    const url = registry.get(key);
    return (
      <g data-rain-column="">
        {url ? <image href={url} x={(cx - w / 2).toFixed(1)} y={m.curb.toFixed(1)} width={w.toFixed(1)} height={depth.toFixed(1)} preserveAspectRatio="none" /> : null}
      </g>
    );
  };

  return (
    <g data-ghibli-night="">
      <defs>
        {/* Bloom du verre : cœur ambre pâle α 0,85 → ambre 0,45 à 30 % → 0. */}
        <radialGradient id={bloomId}>
          <stop offset="0" stopColor={AMBER_CORE} stopOpacity={0.85} />
          <stop offset="0.3" stopColor={AMBER} stopOpacity={0.45} />
          <stop offset="1" stopColor={AMBER} stopOpacity={0} />
        </radialGradient>
        {/* Pluie : halo diffus r 22u et cône vertical très léger. */}
        <radialGradient id={haloId}>
          <stop offset="0" stopColor={AMBER} stopOpacity={0.22} />
          <stop offset="0.5" stopColor={AMBER} stopOpacity={0.07} />
          <stop offset="1" stopColor={AMBER} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={coneId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={AMBER} stopOpacity={0.12} />
          <stop offset="1" stopColor={AMBER} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Vitrines allumées : découpe sur le mur autour et sur le trottoir (la devanture peinte passe par-dessus). */}
      <g data-night-shops="">
        {shopViews.map((v) => (
          <FadeG key={v.i} lit={v.shop.lit} dim={dim} data-night-shop={v.i} data-lit={v.shop.lit ? 'true' : 'false'}>
            {patchImage(v.patchKey, v.box, true)}
          </FadeG>
        ))}
      </g>
      {lampViews.map((v) => (
        <FadeG key={v.lamp.id} lit={v.lit} dim={dim} data-night-lamp={v.lamp.id} data-lit={v.lit ? 'true' : 'false'}>
          {patchImage(v.patchKey, v.box)}
        </FadeG>
      ))}
      {/* Lumière « dans l'air », en screen : UN seul groupe de fusion (l'opacité du groupe de la découpe isolerait le mélange). */}
      <g style={{ mixBlendMode: 'screen' }}>
        {lampViews.map((v) => {
          const gx = v.lamp.x + LANTERN.dx * k;
          const gy = m.curb + LANTERN.dy * k;
          return (
            <FadeG key={v.lamp.id} lit={v.lit} dim={dim} data-night-glow={v.lamp.id}>
              <circle data-bloom="" cx={gx.toFixed(1)} cy={gy.toFixed(1)} r={(6 * k).toFixed(2)} fill={`url(#${bloomId})`} />
              {rainy && (
                <>
                  <circle data-rain-halo="" cx={gx.toFixed(1)} cy={gy.toFixed(1)} r={(22 * u).toFixed(2)} fill={`url(#${haloId})`} />
                  <path
                    data-rain-cone=""
                    d={`M${(gx - 4 * k).toFixed(1)} ${gy.toFixed(1)}H${(gx + 4 * k).toFixed(1)}L${(gx + 22 * u).toFixed(1)} ${m.curb.toFixed(1)}H${(gx - 26 * u).toFixed(1)}Z`}
                    fill={`url(#${coneId})`}
                  />
                  {column(v.wetKey, v.lamp.x + 3 * u, v.colW)}
                </>
              )}
            </FadeG>
          );
        })}
        {rainy && (
          <g data-night-shop-glow="">
            {shopViews.map((v) => (
              <FadeG key={v.i} lit={v.shop.lit} dim={dim}>
                {column(v.wetKey, v.shop.x + v.shop.w / 2, v.colW)}
              </FadeG>
            ))}
          </g>
        )}
      </g>
    </g>
  );
}

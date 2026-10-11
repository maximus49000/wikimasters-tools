// src/content/vehicle/ghibli-car.tsx
import { useRef, type ReactElement } from 'react';
import { anchorsOf } from '../../core/library/figure/bake';
import { shapeOf, signatureOf } from '../../core/library/figure/dress';
import type { ArmPose } from '../../core/library/figure/skeleton';
import { carArt, type CarArt, type Seat } from '../../core/library/city/traffic/car-art';
import type { CarSpec } from '../../core/library/city/traffic/cars';
import { occupantPose } from '../../core/library/city/traffic/occupants';
import { outfitFor, type Outfit } from '../../core/library/city/people';
import { mulberry32 } from '../../core/library/scene-world';
import type { Sky } from '../../core/library/sky';
import { tone } from '../city-sprites';
import type { FigureRegistry } from '../figure/figure-host';
import { GhibliFigure, poseFigure } from '../figure/ghibli-figure';
import { layerBox, layerKey, litOf, paintLayer, paintWheel, useCarRegistry, wheelBox, wheelKey, type CarLayer, type CarRegistry, type Lit } from './car-host';

// Voiture Ghibli (spec véhicules §3) dans le repère du véhicule (roues au sol y = 0), tournée vers `dir` SANS miroir : la
// voie du fond a ses propres sprites peints vers la gauche (lumière toujours en haut à gauche) et ses pantins tournés vers la
// gauche (yaw 8). De bas en haut : habitacle sombre ; occupants (pantins assis) dans un <svg> imbriqué au rectangle des
// vitres (rognage sans clipPath : la couche est recopiée par <use>) ; caisse percée aux vitres, qui recouvre ce qui dépasse
// des occupants ; vitrage translucide ; roues (images tournées par la boucle) et leur reflet fixe ; jupes ; phare ; feu stop.
// La boucle (placeCar) n'écrit que des attributs : rotation des roues, buste des occupants (inertie, pavés, hochements),
// tête (sprite, au plus 4 changements par seconde), volant, et les images peintes qui manquaient (jour/nuit par paliers :
// l'image courante reste tant que la nouvelle n'est pas peinte).
const LAYERS: readonly CarLayer[] = ['interior', 'body', 'glazing', 'over'];
const DEG = 180 / Math.PI;
const n2 = (x: number): string => x.toFixed(2);

const outfitOf = (s: Seat): Outfit => outfitFor('ordinary', mulberry32(s.outfitSeed));
const armsOf = (s: Seat): ArmPose => (s.role === 'driver' ? 'handlebar' : 'swing');
const yawOf = (dir: 1 | -1): number => (dir > 0 ? 0 : 8);

// Place d'un occupant : tête du pantin assis (repère du sprite) sur (x, headY) du siège, à l'échelle du siège.
function seatPlacement(s: Seat, dir: 1 | -1): { transform: string; hands: readonly [number, number] } {
  const sig = signatureOf(shapeOf(outfitOf(s), false));
  const a = anchorsOf({ sig, yaw: yawOf(dir), gait: 'seated', phase: 0, head: 0, arms: armsOf(s), lean: 0 });
  const tx = s.x * dir - a.head[0] * s.k;
  const ty = s.headY - a.head[1] * s.k;
  const hx = (a.handR[0] + a.handL[0]) / 2;
  const hy = (a.handR[1] + a.handL[1]) / 2;
  return { transform: `translate(${n2(tx)} ${n2(ty)}) scale(${s.k})`, hands: [tx + hx * s.k, ty + hy * s.k] };
}

function wantLayer(c: CarSpec, art: CarArt, layer: CarLayer, lit: Lit): { key: string; paint: () => string } {
  return { key: layerKey(c, layer, lit), paint: () => paintLayer(art, layer, lit) };
}

export function GhibliCar({ car, dir, sky, rainy, lights }: { car: CarSpec; dir: 1 | -1; sky: Sky; rainy: boolean; lights: boolean }): ReactElement {
  const reg = useCarRegistry();
  const root = useRef<SVGGElement | null>(null);
  const art = carArt(car);
  const { day, night } = litOf(sky);
  const lit: Lit = { day, night, dir };
  const box = layerBox(art, dir);
  const t = (c: string): string => tone(c, sky);
  // Image d'une couche : sprite voulu s'il existe ; sinon l'image déjà affichée (rendu précédent) reste et le voulu est
  // demandé ; première apparition : peint tout de suite.
  const hrefOf = (sel: string, key: string, paint: () => string): string => {
    const prev = root.current?.querySelector(sel)?.getAttribute('href') ?? null;
    if (prev === null) return reg.ensure(key, paint);
    return reg.request(key, paint) ?? prev;
  };
  const wk = wheelKey(car.rim, car.rimColor, car.wheelR, day);
  const wheelHref = hrefOf('[data-wheel] > image', wk, () => paintWheel(car.rim, car.rimColor, car.wheelR, day));
  const wb = wheelBox(car.wheelR);
  const cabin = art.cabin;
  const driver = art.seats.find((s) => s.role === 'driver');
  const steer = driver ? seatPlacement(driver, dir).hands : null;
  const occupants = art.seats.map((s) => {
    const p = seatPlacement(s, dir);
    return (
      <g key={s.role} data-seat={s.role} data-hx={n2(s.x * dir)} data-hy={n2(s.headY)}>
        <g transform={p.transform}>
          <GhibliFigure outfit={outfitOf(s)} sky={sky} rainy={rainy} umbrella={false} initial={{ yaw: yawOf(dir), gait: 'seated', phase: 0, head: 0, arms: armsOf(s) }} />
        </g>
      </g>
    );
  });
  const steering = steer && (
    <ellipse data-steer="" cx={n2(steer[0] + 0.8 * dir)} cy={n2(steer[1] - 0.4)} rx={0.6} ry={2} fill="none" stroke={t('#33241f')} strokeWidth={0.8} transform={`rotate(${n2(0.35 * dir * DEG)} ${n2(steer[0] + 0.8 * dir)} ${n2(steer[1] - 0.4)})`} />
  );
  const tail = { x: art.tail.x * dir, y: art.tail.y };
  const head = { x: art.head.x * dir, y: art.head.y };
  return (
    <g data-ghibli-car="" data-arch={car.arch} data-day={day} data-night={night ? '1' : '0'} data-dir={dir} ref={root}>
      {LAYERS.map((layer) => {
        if (layer === 'over' && art.over.length === 0) return null;
        // Cabriolet : pas d'habitacle, occupants à découvert (sous la caisse, qui cache le bas du corps).
        if (layer === 'interior' && art.interior.length === 0)
          return (
            <g key="cabin" data-cabin="">
              {occupants}
              {steering}
            </g>
          );
        const w = wantLayer(car, art, layer, lit);
        const href = hrefOf(`[data-layer="${layer}"]`, w.key, w.paint);
        const img = <image key={layer} data-layer={layer} data-want={w.key} data-shown={href ? w.key : undefined} href={href} x={n2(box.x)} y={n2(box.y)} width={n2(box.w)} height={n2(box.h)} />;
        if (layer !== 'interior') return img;
        // Habitacle puis occupants (rognés au rectangle des vitres ; cabriolet : rien à rogner, la caisse cache le bas).
        return [
          img,
          cabin ? (
            <svg key="cabin" data-cabin="" x={n2(dir > 0 ? cabin.x : -(cabin.x + cabin.w))} y={n2(cabin.y)} width={n2(cabin.w)} height={n2(cabin.h)} viewBox={`${n2(dir > 0 ? cabin.x : -(cabin.x + cabin.w))} ${n2(cabin.y)} ${n2(cabin.w)} ${n2(cabin.h)}`} overflow="hidden">
              {occupants}
              {steering}
            </svg>
          ) : null,
        ];
      })}
      {art.wheels.map((w, i) => (
        <g key={i}>
          <g data-wheel="" data-r={w.r} transform={`translate(${n2(w.x * dir)} ${n2(-w.r)}) rotate(0)`}>
            <image data-want={wk} href={wheelHref} x={n2(wb.x)} y={n2(wb.y)} width={n2(wb.w)} height={n2(wb.h)} />
          </g>
          <circle cx={n2(w.x * dir - 0.25 * w.r)} cy={n2(-w.r * 1.25)} r={n2(w.r * 0.12)} fill="#FFFFFF" opacity={0.8 * Math.max(0.3, day)} />
        </g>
      ))}
      {art.head.round && <circle cx={n2(head.x)} cy={n2(head.y)} r={1.3} fill={lights ? '#FFF2C0' : t('#E8E2D0')} stroke={t('#33241f')} strokeWidth={0.6} />}
      {lights && (
        <g data-headlight="">
          <circle cx={n2(head.x)} cy={n2(head.y)} r={4} fill="#FFECAA" opacity={0.35} />
          <path d={`M${n2(head.x)} ${n2(head.y)} L${n2(head.x + 22 * dir)} ${n2(head.y + 5)} L${n2(head.x + 22 * dir)} ${n2(head.y - 5)}Z`} fill="#FFE9A0" opacity={0.22} />
        </g>
      )}
      <g data-brake="" opacity={0}>
        <circle cx={n2(tail.x)} cy={n2(tail.y)} r={2.4} fill="#FF3C28" opacity={0.3} />
        <circle cx={n2(tail.x)} cy={n2(tail.y)} r={1.1} fill="#FF3B2F" />
      </g>
    </g>
  );
}

// Pose par la boucle : `a.dist` et `a.v` en unités de la voiture (px du monde / échelle d'affichage), `a.lean` : inertie
// du moteur (> 0 : freinage), `t` : instant (s).
export function placeCar(fig: FigureRegistry, cars: CarRegistry, node: Element, a: { car: CarSpec; dist: number; v: number; lean: number; seed: number }, dir: 1 | -1, t: number): void {
  const art = carArt(a.car);
  // Images peintes manquantes (palette changée au dernier rendu) : posées dès qu'elles existent ; clés gardées en vie.
  const day = Number(node.getAttribute('data-day'));
  const night = node.getAttribute('data-night') === '1';
  const lit: Lit = { day, night, dir };
  for (const img of node.querySelectorAll('image[data-layer]')) {
    const layer = img.getAttribute('data-layer') as CarLayer;
    const want = img.getAttribute('data-want')!;
    const url = cars.request(want, () => paintLayer(art, layer, lit));
    if (url !== null && img.getAttribute('data-shown') !== want) {
      img.setAttribute('href', url);
      img.setAttribute('data-shown', want);
    }
  }
  const wheels = node.querySelectorAll('[data-wheel]');
  let wheelUrl: string | null | undefined;
  for (const w of wheels) {
    const img = w.firstElementChild!;
    const want = img.getAttribute('data-want')!;
    wheelUrl ??= cars.request(want, () => paintWheel(a.car.rim, a.car.rimColor, a.car.wheelR, day));
    if (wheelUrl !== null && img.getAttribute('href') !== wheelUrl) img.setAttribute('href', wheelUrl);
    // Rotation : distance parcourue / rayon (sens horaire en allant vers la droite).
    const r = Number(w.getAttribute('data-r'));
    const tr = w.getAttribute('transform')!;
    const next = tr.replace(/rotate\([^)]*\)/, `rotate(${n2(((a.dist / r) * DEG * dir) % 360)})`);
    if (next !== tr) w.setAttribute('transform', next);
  }
  for (const s of art.seats) {
    const el = node.querySelector(`[data-seat="${s.role}"]`);
    if (!el) continue;
    const p = occupantPose({ role: s.role, seed: a.seed, t, v: a.v, dist: a.dist, lean: a.lean, unit: 1 });
    const hx = el.getAttribute('data-hx');
    const hy = el.getAttribute('data-hy');
    const tr = `translate(${n2(p.dx * dir)} ${n2(p.dy)}) rotate(${n2(p.tilt * dir * DEG)} ${hx} ${hy})`;
    if (el.getAttribute('transform') !== tr) el.setAttribute('transform', tr);
    poseFigure(fig, el.querySelector('[data-figure]'), { yaw: yawOf(dir), gait: 'seated', phase: 0, head: p.head * dir, arms: armsOf(s) });
    if (s.role === 'driver') {
      const st = node.querySelector('[data-steer]');
      if (st) {
        const cx = st.getAttribute('cx');
        const cy = st.getAttribute('cy');
        const rot = `rotate(${n2((0.35 * dir + p.wheel) * DEG)} ${cx} ${cy})`;
        if (st.getAttribute('transform') !== rot) st.setAttribute('transform', rot);
      }
    }
  }
}

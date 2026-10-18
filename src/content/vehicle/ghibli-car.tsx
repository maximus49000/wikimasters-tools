// src/content/vehicle/ghibli-car.tsx
import { useRef, type ReactElement } from 'react';
import { anchorsOf } from '../../core/library/figure/bake';
import { shapeOf, signatureOf } from '../../core/library/figure/dress';
import type { ArmPose, Gait } from '../../core/library/figure/skeleton';
import { INK, type Seat } from '../../core/library/city/traffic/car-art';
import type { VehicleLook } from '../../core/library/city/traffic/look';
import { occupantPose } from '../../core/library/city/traffic/occupants';
import { outfitFor, type Outfit } from '../../core/library/city/people';
import { mulberry32 } from '../../core/library/scene-world';
import type { Sky } from '../../core/library/sky';
import { tone } from '../city-sprites';
import type { FigureRegistry } from '../figure/figure-host';
import { GhibliFigure, poseFigure, prewarmCitizen } from '../figure/ghibli-figure';
import { layerBox, layerKey, litOf, paintLayer, paintWheel, useCarRegistry, wheelBox, wheelKey, type CarLayer, type CarRegistry, type Lit } from './car-host';

// Véhicule Ghibli (spec véhicules §3-4 : voiture générée ou véhicule à part, voir look.ts) dans le repère du véhicule (roues au sol y = 0), tournée vers `dir` SANS miroir : la
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

const outfitOf = (s: Seat): Outfit => s.outfit ?? outfitFor('ordinary', mulberry32(s.outfitSeed));
const armsOf = (s: Seat): ArmPose => s.arms ?? (s.role === 'driver' ? 'handlebar' : 'swing');
const gaitOf = (s: Seat): Gait => s.gait ?? 'seated';
const yawOf = (dir: 1 | -1): number => (dir > 0 ? 0 : 8);

// Place d'un occupant : tête du pantin assis, selle (en selle) ou pieds (debout ; origine du sprite) sur (x, headY) du
// siège, à l'échelle du siège. Habitant 3D : l'accroche qui sert à le placer (tête, selle) est épinglée sur celle du pantin
// (`pinOf`) : l'image 3D garde sa place dans les vitres, quelle que soit sa silhouette.
const pinOf = (s: Seat): 'head' | 'seat' | undefined => (gaitOf(s) === 'seated' ? 'head' : gaitOf(s) === 'mount' ? 'seat' : undefined);
function seatPlacement(s: Seat, dir: 1 | -1): { transform: string; hands: readonly [number, number] } {
  const sig = signatureOf(shapeOf(outfitOf(s), false));
  const gait = gaitOf(s);
  const a = anchorsOf({ sig, yaw: yawOf(dir), gait, phase: 0, head: 0, arms: armsOf(s), lean: 0 });
  const p = gait === 'seated' ? a.head : gait === 'mount' ? a.seat : ([0, 0] as const);
  const tx = s.x * dir - p[0] * s.k;
  const ty = s.headY - p[1] * s.k;
  const hx = (a.handR[0] + a.handL[0]) / 2;
  const hy = (a.handR[1] + a.handL[1]) / 2;
  return { transform: `translate(${n2(tx)} ${n2(ty)}) scale(${s.k})`, hands: [tx + hx * s.k, ty + hy * s.k] };
}

function wantLayer(look: VehicleLook, layer: CarLayer, lit: Lit): { key: string; paint: () => string } {
  return { key: layerKey(look, layer, lit), paint: () => paintLayer(look.art, layer, lit) };
}

// `still` (mouvement réduit) : aucune boucle ne posera une image en attente, elle est donc peinte tout de suite.
// Véhicule sans boucle (V5 : véhicules scénarisés déplacés par transition CSS d'un rendu à la minute au suivant) :
// `paintNow` peint aussi tout de suite ; `roll` fait tourner les roues par la MÊME transition que le véhicule (angle = x / r,
// x : position du véhicule en unités du véhicule, sens du monde) ; `blink` fait clignoter les gyrophares par <animate>.
// `occupied` faux : cabine vide (l'équipe est descendue).
type GhibliCarProps = {
  look: VehicleLook; dir: 1 | -1; sky: Sky; rainy: boolean; lights: boolean; still?: boolean;
  roll?: { x: number; move?: string }; paintNow?: boolean; occupied?: boolean; blink?: boolean;
};
export function GhibliCar({ look, dir, sky, rainy, lights, still = false, roll, paintNow = false, occupied = true, blink = false }: GhibliCarProps): ReactElement {
  const reg = useCarRegistry();
  const root = useRef<SVGGElement | null>(null);
  const art = look.art;
  const { day, night } = litOf(sky);
  const lit: Lit = { day, night, dir };
  const box = layerBox(art, dir);
  const t = (c: string): string => tone(c, sky);
  // Image d'une couche et clé réellement montrée : sprite voulu s'il existe ; sinon l'image déjà affichée (rendu précédent)
  // reste avec sa clé et le voulu est demandé (la boucle le pose une fois peint) ; première apparition ou mouvement réduit :
  // peint tout de suite.
  const shownOf = (sel: string, key: string, paint: () => string): { href: string; shown: string } => {
    const prev = root.current?.querySelector(sel) ?? null;
    const prevHref = prev?.getAttribute('href') ?? null;
    if (prevHref === null || still || paintNow) return { href: reg.ensure(key, paint), shown: key };
    const url = reg.request(key, paint);
    return url !== null ? { href: url, shown: key } : { href: prevHref, shown: prev!.getAttribute('data-shown') ?? key };
  };
  const hrefOf = (sel: string, key: string, paint: () => string): string => shownOf(sel, key, paint).href;
  const cabin = art.cabin;
  const seats = occupied ? art.seats : [];
  const driver = seats.find((s) => s.role === 'driver');
  // Volant : conducteur assis seulement (les pilotes des deux-roues tiennent leur guidon peint).
  const steer = driver && gaitOf(driver) === 'seated' ? seatPlacement(driver, dir).hands : null;
  const seatNode = (s: Seat, i: number): ReactElement => {
    const p = seatPlacement(s, dir);
    return (
      <g key={i} data-seat={i} data-role={s.role} data-hx={n2(s.x * dir)} data-hy={n2(s.headY)}>
        <g transform={p.transform}>
          <GhibliFigure outfit={outfitOf(s)} sky={sky} rainy={rainy} umbrella={false} initial={{ yaw: yawOf(dir), gait: gaitOf(s), phase: 0, head: 0, arms: armsOf(s) }} citizen={s.outfitSeed} kind={s.child ? 'child' : undefined} pin={pinOf(s)} />
        </g>
      </g>
    );
  };
  const occupants = seats.map((s, i) => (s.over ? null : seatNode(s, i)));
  const overSeats = seats.map((s, i) => (s.over ? seatNode(s, i) : null));
  const steering = steer && (
    <ellipse data-steer="" cx={n2(steer[0] + 0.8 * dir)} cy={n2(steer[1] - 0.4)} rx={0.6} ry={2} fill="none" stroke={t('#33241f')} strokeWidth={0.8} transform={`rotate(${n2(0.35 * dir * DEG)} ${n2(steer[0] + 0.8 * dir)} ${n2(steer[1] - 0.4)})`} />
  );
  const tail = { x: art.tail.x * dir, y: art.tail.y };
  const layerImage = (layer: CarLayer): ReactElement => {
    const w = wantLayer(look, layer, lit);
    const s = shownOf(`[data-layer="${layer}"]`, w.key, w.paint);
    return <image key={layer} data-layer={layer} data-want={w.key} data-shown={s.shown} href={s.href} x={n2(box.x)} y={n2(box.y)} width={n2(box.w)} height={n2(box.h)} />;
  };
  const head = { x: art.head.x * dir, y: art.head.y };
  return (
    <g data-ghibli-car="" data-arch={look.arch} data-day={day} data-night={night ? '1' : '0'} data-dir={dir} ref={root}>
      {LAYERS.map((layer) => {
        // Jupes et ailes : par-dessus les roues (rendues après elles).
        if (layer === 'over') return null;
        // Cabriolet : pas d'habitacle, occupants à découvert (sous la caisse, qui cache le bas du corps).
        if (layer === 'interior' && art.interior.length === 0)
          return (
            <g key="cabin" data-cabin="">
              {occupants}
              {steering}
            </g>
          );
        const img = layerImage(layer);
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
      {art.wheels.map((w, i) => {
        const wk = wheelKey(look.rim, look.rimColor, w.r, day);
        const wb = wheelBox(w.r);
        const img = <image data-want={wk} href={hrefOf(`[data-wheel][data-r="${w.r}"] image`, wk, () => paintWheel(look.rim, look.rimColor, w.r, day))} x={n2(wb.x)} y={n2(wb.y)} width={n2(wb.w)} height={n2(wb.h)} />;
        return (
          <g key={i}>
            {roll ? (
              <g data-wheel="" data-r={w.r} transform={`translate(${n2(w.x * dir)} ${n2(-w.r)})`}>
                <g data-wheel-spin="" style={{ transform: `rotate(${n2((roll.x / w.r) * DEG)}deg)`, transition: still ? undefined : roll.move }}>
                  {img}
                </g>
              </g>
            ) : (
              <g data-wheel="" data-r={w.r} transform={`translate(${n2(w.x * dir)} ${n2(-w.r)}) rotate(0)`}>
                {img}
              </g>
            )}
            <circle cx={n2(w.x * dir - 0.25 * w.r)} cy={n2(-w.r * 1.25)} r={n2(w.r * 0.12)} fill="#FFFFFF" opacity={0.8 * Math.max(0.3, day)} />
          </g>
        );
      })}
      {overSeats}
      {art.over.length > 0 && layerImage('over')}
      {art.beacons.map((b, i) => (
        <rect key={i} data-beacon={i} data-on={b.on} data-off={b.off ?? ''} x={n2(dir > 0 ? b.x : -(b.x + b.w))} y={n2(b.y)} width={n2(b.w)} height={n2(b.h)} rx={n2(b.h / 2)} fill={b.off ?? (lights ? b.on : t(b.on))} stroke={t(INK)} strokeWidth={0.4}>
          {blink && !still && b.off && <animate attributeName="fill" values={`${b.on};${b.off};${b.on}`} dur="0.66s" begin={`${(i % 2) * 0.33}s`} repeatCount="indefinite" />}
        </rect>
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
export function placeCar(fig: FigureRegistry, cars: CarRegistry, node: Element, a: { look: VehicleLook; dist: number; v: number; lean: number; seed: number }, dir: 1 | -1, t: number): void {
  const art = a.look.art;
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
  for (const w of wheels) {
    const img = w.firstElementChild!;
    const want = img.getAttribute('data-want')!;
    const r0 = Number(w.getAttribute('data-r'));
    const wheelUrl = cars.request(want, () => paintWheel(a.look.rim, a.look.rimColor, r0, day));
    if (wheelUrl !== null && img.getAttribute('href') !== wheelUrl) img.setAttribute('href', wheelUrl);
    // Rotation : distance parcourue / rayon (sens horaire en allant vers la droite).
    const r = Number(w.getAttribute('data-r'));
    const tr = w.getAttribute('transform')!;
    const next = tr.replace(/rotate\([^)]*\)/, `rotate(${n2(((a.dist / r) * DEG * dir) % 360)})`);
    if (next !== tr) w.setAttribute('transform', next);
  }
  // Gyrophares : alternés (deux feux d'un même véhicule en opposition), 3 changements par seconde.
  const blink = Math.floor(t * 3) % 2 === 0;
  for (const b of node.querySelectorAll('[data-beacon]')) {
    const off = b.getAttribute('data-off');
    if (!off) continue;
    const fill = blink !== (Number(b.getAttribute('data-beacon')) % 2 === 1) ? b.getAttribute('data-on')! : off;
    if (b.getAttribute('fill') !== fill) b.setAttribute('fill', fill);
  }
  for (let i = 0; i < art.seats.length; i++) {
    const s = art.seats[i]!;
    const el = node.querySelector(`[data-seat="${i}"]`);
    if (!el) continue;
    const p = occupantPose({ role: s.role, seed: a.seed, t, v: a.v, dist: a.dist, lean: a.lean, unit: 1 });
    const hx = el.getAttribute('data-hx');
    const hy = el.getAttribute('data-hy');
    const tr = `translate(${n2(p.dx * dir)} ${n2(p.dy)}) rotate(${n2(p.tilt * dir * DEG)} ${hx} ${hy})`;
    if (el.getAttribute('transform') !== tr) el.setAttribute('transform', tr);
    poseFigure(fig, el.querySelector('[data-figure]'), { yaw: yawOf(dir), gait: gaitOf(s), phase: 0, head: p.head * dir, arms: armsOf(s) });
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

// Habitants 3D : occupants d'un véhicule pas encore entré (arrivée planifiée : bus, tram…, sièges connus d'avance par
// scheduledCrew) rendus d'avance, mêmes palettes que leurs GhibliFigure (graine du siège, enfant) et poses du début du trajet
// (regard devant ; conducteur : coup d'œil, passagers : tête tournée de part et d'autre).
const PREWARM_HEADS: Readonly<Record<Seat['role'], readonly number[]>> = { driver: [0, 1], front: [0, 2, -2], rear: [0, 2, -2] };
// `lead` : secondes avant l'entrée du véhicule.
export function prewarmSeats(fig: FigureRegistry, seats: readonly Seat[], dir: 1 | -1, sky: Sky, rainy: boolean, lead = Infinity): void {
  for (const s of seats) {
    const poses = PREWARM_HEADS[s.role].map((h) => ({ yaw: yawOf(dir), gait: gaitOf(s), phase: 0, head: h * dir, arms: armsOf(s) }));
    prewarmCitizen(fig, { outfit: outfitOf(s), sky, rainy, umbrella: false, id: { citizen: s.outfitSeed, ...(s.child ? { kind: 'child' as const } : {}) } }, poses, lead);
  }
}

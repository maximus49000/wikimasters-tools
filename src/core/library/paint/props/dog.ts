import { INK, TAU } from '../cel';
import { hexRgb, mixRgb, rgba } from '../color';
import { mulberry32 } from '../../scene-world';
import { lightOf, shadeOf, type CelOpts } from '../shop/cel';
import type { TintedCtx } from '../shop/ctx';
import { ball, celD, disc, ED, groundShadow, PD, tube } from './kit';
import { registerProps, type PropArgs, type PropPaint } from './index';

// Chien du promeneur cellulo (G5, tâche 13), porté de la maquette validée (docs/superpowers/maquettes/g5-fetes/index.html :
// `BREEDS`, `dog`) dans le repère du chien classique de city-event-sprites.tsx (notes.md §1 « Chien » : `translate(26 0)`
// depuis le promeneur ; corps −8..6 × −11..−5, tête r 3,5 à (7, −11), queue (−8,−10)→(−12,−14), pattes à x = −6 et 3, sol à
// y = 0). Chaque race étire cette boîte par (L, H) ; la race et la robe sont tirées de la graine du promeneur (dogOf), puis
// passées en arguments au peintre (la mécanique ne change pas : même chien à chaque cuisson). Huit poses de marche sur
// DOG_CYCLE_S (notes §2 « Chien ») : pattes diagonales en phase (±15°, genou 25°·max(0, cos)), rebond du corps 0,4,
// hochement de tête 0,5, oreilles tombantes qui suivent, queue qui bat (un battement par cycle pour boucler). Sans laisse :
// le pantin du promeneur la tend jusqu'au collier (collarOf) dans le repère du chien. Pas de partie lumineuse (rien dans
// glowing) ; la nuit, tout est teint par le registre. Orientation par `facing` (kit) : jamais de miroir de l'image.

export const DOG_CYCLE_S = 0.5;
const FRAMES = 8;
const GOLD = '#E8B93A';
const COLLAR = '#C0302B';
const DARK = '#1E1A18';

export type Breed = {
  id: string;
  L: number;
  H: number;
  ear: 'flop' | 'point' | 'bat';
  tail: 'straight' | 'up' | 'pom' | 'plume' | 'stub';
  snout: number;
  coats: readonly [string, string, string];
  shaggy?: boolean;
  curly?: boolean;
  saddle?: boolean;
  spots?: boolean;
};

// Six races (notes §3) : proportions (L, H) de la boîte classique, oreilles, queue, longueur du museau, trois robes.
export const BREEDS: readonly Breed[] = [
  { id: 'labrador', L: 1, H: 1, ear: 'flop', tail: 'straight', snout: 1, coats: ['#E8D9B8', '#2A2420', '#8A5A2B'] },
  { id: 'teckel', L: 1.35, H: 0.72, ear: 'flop', tail: 'straight', snout: 1.3, coats: ['#8A5A2B', '#2A2420', '#B97A52'] },
  { id: 'terrier', L: 0.85, H: 0.85, ear: 'point', tail: 'up', snout: 0.8, coats: ['#E8D9B8', '#C9A878', '#2A2420'], shaggy: true },
  { id: 'caniche', L: 0.9, H: 1, ear: 'flop', tail: 'pom', snout: 0.9, coats: ['#F4EFE6', '#4A3A30', '#C98A5E'], curly: true },
  { id: 'berger', L: 1.1, H: 1.08, ear: 'point', tail: 'plume', snout: 1.2, coats: ['#8A5A2B', '#2A2420', '#B97A52'], saddle: true },
  { id: 'bouledogue', L: 0.85, H: 0.82, ear: 'bat', tail: 'stub', snout: 0.5, coats: ['#E8D9B8', '#8A7A6A', '#2A2420'], spots: true },
];

// Race puis robe tirées de la graine (mulberry32, comme la maquette) : indices dans BREEDS et dans `coats`.
export function dogOf(seed: number): { breed: number; coat: number } {
  const rng = mulberry32(seed);
  const breed = Math.floor(rng() * BREEDS.length);
  const coat = Math.floor(rng() * 3);
  return { breed, coat };
}

const breedOf = (i: number): Breed => BREEDS[Number.isInteger(i) && i >= 0 && i < BREEDS.length ? i : 0]!;

// Point du collier dans le repère du chien, où le pantin accroche sa laisse : (4,6·L, −9,2·H) (≈ (−4, −9) du classique).
export const collarOf = (breed: number): [number, number] => {
  const b = breedOf(breed);
  return [4.6 * b.L, -9.2 * b.H];
};

const num = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);
const op = (lw: number, s: number, l: number, sx = 0.68, lx = 0.18): CelOpts => ({ lw, s, sx, l, lx });

// Cadre : queue et oreilles dressées comprises (museau jusqu'à 7L + 4,8 + 2,6·museau ; queue jusqu'à −8L − 6,5 ; haut aux
// oreilles pointues / chauve-souris ou au pompon du caniche, sinon au sommet du crâne ; sol + ombre portée).
function box(a: PropArgs): readonly [number, number, number, number] {
  const b = breedOf(num(a.breed));
  const x0 = -8 * b.L - 6.5;
  const x1 = 7 * b.L + 4.8 + 2.6 * b.snout;
  const y0 = -11 * b.H - (b.ear === 'flop' && !b.curly ? 5.3 : 7.6);
  return [x0, y0, x1 - x0, 1.7 - y0];
}

function dog(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const b = breedOf(num(a.breed));
  const coat = b.coats[((num(a.coat) % 3) + 3) % 3] ?? b.coats[0];
  const mark = b.saddle ? shadeOf(coat, 0.45) : b.spots ? rgba(mixRgb(hexRgb(coat), hexRgb('#2A2420'), 0.7), 1) : null;
  const L_ = b.L;
  const Hh = b.H;
  const g = p.frame / FRAMES;
  const bob = Math.sin(TAU * g * 2) * 0.4;
  // Pattes : hanche à (−6, −6H), épaule à (3, −6H) ; balancement ±15°, genou plié au retour ; celles du fond assombries.
  const leg = (x0: number, ph: number, far: boolean): void => {
    const ang = 15 * Math.sin(TAU * (g + ph));
    const bend = Math.max(0, Math.cos(TAU * (g + ph))) * 25;
    const col = far ? shadeOf(coat, 0.3) : coat;
    const li = far ? 0.05 : 0.25;
    x.save();
    x.translate(x0, -6 * Hh);
    x.rotate((ang * Math.PI) / 180);
    tube(x, 0, 0, 0, 3 * Hh, 1.8, col, { lw: 0.4, li });
    x.translate(0, 3 * Hh);
    x.rotate((-bend * Math.PI) / 180);
    tube(x, 0, 0, 0.2, 3 * Hh, 1.5, col, { lw: 0.4, li });
    ball(x, 0.3, 3 * Hh + 0.2, 0.9, col, 0.3);
    x.restore();
  };
  groundShadow(x, -1, 0.5, 8 * L_, 1.1, 0.18);
  leg(-5, 0.5, true);
  leg(4, 0, true);
  x.save();
  x.translate(0, bob);
  // Corps : −8..6 × −11..−5 (×L, ×H), selle ou taches rognées à la forme, frange hirsute ou bouclée, ventre clair.
  const body = (): void => {
    x.moveTo(-8 * L_, -8 * Hh);
    x.quadraticCurveTo(-8.5 * L_, -11 * Hh, -4 * L_, -11 * Hh);
    x.lineTo(4 * L_, -11 * Hh);
    x.quadraticCurveTo(7 * L_, -11 * Hh, 6.5 * L_, -8 * Hh);
    x.quadraticCurveTo(6 * L_, -5 * Hh, 2 * L_, -5 * Hh);
    x.lineTo(-5 * L_, -5 * Hh);
    x.quadraticCurveTo(-8.5 * L_, -5 * Hh, -8 * L_, -8 * Hh);
    x.closePath();
  };
  celD(x, body, coat, { lw: 0.5, box: [-9 * L_, -11 * Hh, 16 * L_, 6 * Hh], s: 0.3, sx: 0.62, l: 0.22, lx: 0.2 });
  if (mark) {
    x.save();
    x.beginPath();
    body();
    x.clip();
    x.fillStyle = mark;
    x.beginPath();
    if (b.saddle) x.ellipse(-2 * L_, -11 * Hh, 6 * L_, 3.2 * Hh, 0, 0, TAU);
    else {
      x.ellipse(-3 * L_, -9 * Hh, 2.2, 1.8, 0.3, 0, TAU);
      x.fill();
      x.beginPath();
      x.ellipse(3 * L_, -7.5 * Hh, 1.6, 1.3, 0, 0, TAU);
    }
    x.fill();
    x.restore();
  }
  if (b.shaggy || b.curly) {
    x.fillStyle = lightOf(coat, 0.25);
    for (let fx = -7 * L_; fx < 5 * L_; fx += 2.2) {
      x.beginPath();
      x.arc(fx, -5.2 * Hh, 1.1, 0, Math.PI);
      x.fill();
    }
  }
  x.fillStyle = lightOf(coat, 0.3);
  x.beginPath();
  x.ellipse(-1 * L_, -5.8 * Hh, 4.5 * L_, 0.8, 0, 0, TAU);
  x.fill();
  // Queue (−8, −10) → (−12, −14) : un battement par cycle (boucle sur les 8 poses).
  const wag = Math.sin(TAU * g) * 0.9;
  x.save();
  x.translate(-8 * L_, -10 * Hh);
  if (b.tail === 'stub') ball(x, -0.8, -0.6, 1.1, coat, 0.35);
  else if (b.tail === 'pom') {
    tube(x, 0, 0, -3, -3.4 + wag, 1.2, coat, { lw: 0.4 });
    ball(x, -3.4, -4 + wag, 1.8, lightOf(coat, 0.2), 0.4);
  } else if (b.tail === 'plume') {
    x.beginPath();
    x.moveTo(0, 0);
    x.quadraticCurveTo(-3, -1, -4.5, -4 + wag);
    x.strokeStyle = INK;
    x.lineWidth = 3.2;
    x.lineCap = 'round';
    x.stroke();
    x.strokeStyle = coat;
    x.lineWidth = 2.4;
    x.stroke();
    x.strokeStyle = lightOf(coat, 0.3);
    x.lineWidth = 0.7;
    x.beginPath();
    x.moveTo(-0.5, -0.8);
    x.quadraticCurveTo(-3, -1.8, -4, -4 + wag);
    x.stroke();
  } else if (b.tail === 'up') tube(x, 0, 0, -1.5, -4.5 + wag * 0.5, 1.4, coat, { lw: 0.4 });
  else tube(x, 0, 0, -4, -4 + wag, 1.5, coat, { lw: 0.4 });
  x.restore();
  x.restore();
  leg(-6, 0, false);
  leg(3, 0.5, false);
  x.save();
  x.translate(0, bob);
  // Cou, puis tête r 3,5 à (7, −11) qui hoche ; le museau s'allonge avec la race.
  const hx = 7 * L_;
  const hy = -11 * Hh + Math.sin(TAU * g * 2 + 0.8) * 0.5;
  celD(
    x,
    () => {
      x.moveTo(3 * L_, -11 * Hh);
      x.lineTo(hx - 1, hy - 2.2);
      x.lineTo(hx + 1, hy + 1);
      x.lineTo(4 * L_, -7 * Hh);
      x.closePath();
    },
    coat,
    { lw: 0.45, box: [3 * L_, hy - 3, 5, 6], s: 0.3, sx: 0.6, l: 0.2, lx: 0.18 },
  );
  const sn = b.snout;
  celD(
    x,
    () => {
      x.moveTo(hx - 3.2, hy - 1.5);
      x.quadraticCurveTo(hx - 2.5, hy - 4.2, hx + 0.5, hy - 3.8);
      x.quadraticCurveTo(hx + 3, hy - 3.6, hx + 3.2 + 2.6 * sn, hy - 1.4);
      x.quadraticCurveTo(hx + 3.6 + 2.6 * sn, hy + 0.6, hx + 2 + 2 * sn, hy + 1.2);
      x.quadraticCurveTo(hx - 1, hy + 2.6, hx - 3, hy + 1);
      x.closePath();
    },
    coat,
    { lw: 0.5, box: [hx - 3.5, hy - 4.5, 8 + 3 * sn, 7], s: 0.3, sx: 0.62, l: 0.22, lx: 0.18 },
  );
  if (b.curly) {
    x.fillStyle = lightOf(coat, 0.2);
    x.beginPath();
    x.arc(hx - 1, hy - 4, 2.2, 0, TAU);
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 0.35;
    x.stroke();
  }
  // Truffe, œil et sa lueur, bouche.
  ball(x, hx + 3.4 + 2.6 * sn, hy - 1.2, 0.75, DARK, 0);
  disc(x, hx + 0.4, hy - 1.6, 0.5, DARK, 0);
  x.fillStyle = '#FFFFFF';
  x.fillRect(hx + 0.1, hy - 1.9, 0.3, 0.3);
  x.strokeStyle = 'rgba(42,26,24,0.55)';
  x.lineWidth = 0.3;
  x.beginPath();
  x.moveTo(hx + 1.5 + 2 * sn, hy + 0.8);
  x.quadraticCurveTo(hx + 1, hy + 1.6, hx + 0.2, hy + 0.8);
  x.stroke();
  // Oreilles : tombantes (suivent le pas), pointues, ou « chauve-souris » à l'intérieur rose.
  const flap = Math.sin(TAU * g * 2 + 1) * 0.6;
  if (b.ear === 'flop') {
    celD(
      x,
      () => {
        x.moveTo(hx - 2.2, hy - 3);
        x.quadraticCurveTo(hx - 4.6, hy - 1 + flap, hx - 3, hy + 2 + flap);
        x.quadraticCurveTo(hx - 1.2, hy + 1, hx - 0.8, hy - 2.4);
        x.closePath();
      },
      shadeOf(coat, 0.2),
      { lw: 0.4, box: [hx - 5, hy - 3, 4.5, 5], s: 0.3, l: 0 },
    );
  } else if (b.ear === 'point') {
    PD(x, [[hx - 2.6, hy - 2.4], [hx - 2.2, hy - 7], [hx - 0.2, hy - 3.2]], coat, op(0.4, 0.3, 0.2));
    PD(x, [[hx - 0.4, hy - 3], [hx + 0.8, hy - 6.8], [hx + 2, hy - 3]], coat, op(0.4, 0.3, 0.2, 0.5));
  } else {
    ED(x, hx - 1.8, hy - 5, 1.6, 2.4, coat, op(0.4, 0.3, 0.2));
    ED(x, hx + 1.2, hy - 4.8, 1.5, 2.3, coat, op(0.4, 0.3, 0.2, 0.5));
    ED(x, hx - 1.8, hy - 4.8, 0.7, 1.4, '#E8A8A8', { lw: 0, s: 0, l: 0 });
  }
  // Collier rouge à médaille d'or sur l'encolure (la laisse du pantin arrive à collarOf).
  x.beginPath();
  x.moveTo(4.2 * L_, -10.2 * Hh);
  x.quadraticCurveTo(5.6 * L_, -7.4 * Hh, hx - 0.5, -7.6 * Hh);
  x.strokeStyle = INK;
  x.lineWidth = 1.5;
  x.lineCap = 'round';
  x.stroke();
  x.strokeStyle = COLLAR;
  x.lineWidth = 0.9;
  x.stroke();
  disc(x, 5.4 * L_, -7.8 * Hh, 0.6, GOLD, 0.2);
  x.restore();
}

registerProps({
  dog: { box, frames: FRAMES, paint: dog },
});

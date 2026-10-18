import { INK, TAU } from '../cel';
import { hexRgb, mixRgb, rgba } from '../color';
import { L, lightOf, shadeOf, type CelOpts } from '../shop/cel';
import type { TintedCtx } from '../shop/ctx';
import { ball, celD, disc, halo, PD, RD, tube } from './kit';
import { registerProps, type PropArgs, type PropPaint } from './index';

// Père Noël cellulo (G5, tâche 10), porté de la maquette validée (docs/superpowers/maquettes/g5-fetes/index.html :
// `reindeer`, `sleigh`, `trail`, `santaSack`) dans le repère de santa-sprite.tsx (notes.md §1 « Renne », « Traîneau »,
// « Lanterne », « Traînée », « Hotte » : patins à y = 0, rennes vers +x, traînée vers −x). Lumineux la nuit (glowing quand
// `lit`) : la lanterne du traîneau, le nez du meneur, les étoiles de la traînée ; le reste est teint par le registre.
// Poses clés : galop du renne (8 sur REINDEER_CYCLE_S), vie du renne posé (4, répétées, sur REINDEER_IDLE_S), scintillement
// de la traînée (8 sur TRAIL_CYCLE_S, bouclées : les étoiles tournent d'un huitième de tour, la poussière dérive d'une
// boucle). `far` (0–1) : mélange au bleu de brume #9CC0E4 (groupe posé sur la colline, notes §7 : 0,28).

export const REINDEER_CYCLE_S = 0.55;
export const REINDEER_IDLE_S = 6;
export const TRAIL_CYCLE_S = 0.8;
const FRAMES = 8;
const IDLE_FRAMES = 4;

const SRED = '#C8283A';
const GOLD = '#E8B93A';
const FUR = '#8A5A34';
const DARK = '#5A3A20';
const BLACK = '#1E1A18';
const IRON = '#4A5A58';
const HARNESS = '#A02030';
const HAZE = hexRgb('#9CC0E4');
const num = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);
const op = (lw: number, s: number, l: number, sx = 0.68, lx = 0.18): CelOpts => ({ lw, s, sx, l, lx });
// Couleur éloignée : mélangée au bleu de brume (rien à `far` = 0).
const hazer = (far: number) => (c: string): string => (far > 0 ? rgba(mixRgb(hexRgb(c), HAZE, far), 1) : c);

// ---------- Renne (Reindeer : corps ellipse 5 × 2,8 à (0, 0), cou vers (8, −4), tête r 2 à (9, −4,5), bois, nez (10,8, −4,2),
// clochette (4,5, 0,5)). Galop (notes §2) : g = pose/8 ; antérieurs cuisse −15° − 55°·cos(2πg), genou 42°·max(0, −cos) ;
// postérieurs en opposition ; corps ×(1 + 0,09·cos). Posé : pattes d'aplomb (±6°), 4 poses de vie : repos, souffle, tête
// secouée, sabot qui gratte (le meneur regarde autour sur les deux dernières). ----------
function reindeer(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const lead = a.lead === true;
  const landed = a.landed === true;
  const hz = hazer(num(a.far));
  const fur = hz(FUR);
  const belly = lightOf(fur, 0.3);
  const idle = landed ? p.frame % IDLE_FRAMES : 0;
  const g = landed ? 0 : p.frame / FRAMES;
  const shake = idle === 2 ? 0.12 : 0;
  const scratch = idle === 3 ? 0.8 : 0;
  const look = lead && idle >= 2 ? 0.16 : 0;
  const puff = idle === 1 ? 0.45 : idle === 3 ? 0.9 : 0;
  // Patte : cuisse 2,6 + canon 2,2 + sabot ; celles du fond assombries, sans rehaut.
  const leg = (x0: number, y0: number, front: boolean, far: boolean): void => {
    let a1: number;
    let a2: number;
    if (landed) {
      a1 = front ? 6 : -6;
      a2 = front ? -6 : 6;
      if (front && !far && scratch > 0) {
        a1 = -6 - 30 * scratch;
        a2 = 18 * scratch;
      }
    } else {
      const k = front ? g : (g + 0.5) % 1;
      a1 = front ? -15 - 55 * Math.cos(TAU * k) : 15 + 55 * Math.cos(TAU * k);
      a2 = (front ? 1 : -1) * 42 * Math.max(0, -Math.cos(TAU * k));
    }
    const col = far ? shadeOf(fur, 0.3) : fur;
    x.save();
    x.translate(x0, y0);
    x.rotate((a1 * Math.PI) / 180);
    tube(x, 0, 0, 0, 2.6, 1.7, col, { lw: 0.4, li: far ? 0.05 : 0.3 });
    x.translate(0, 2.6);
    x.rotate((a2 * Math.PI) / 180);
    tube(x, 0, 0, 0, 2.2, 1.3, col, { lw: 0.4, li: far ? 0.05 : 0.3 });
    PD(x, [[-0.9, 1.9], [0.9, 1.9], [1, 2.9], [-1, 2.9]], hz(BLACK), op(0.3, 0, 0.3));
    x.restore();
  };
  leg(-2.6, 1, false, true);
  leg(3.4, 1, true, true);
  // Corps : s'allonge à la détente, se tasse au rassemblé ; ventre clair ; queue.
  const stretch = landed ? 1 : 1 + 0.09 * Math.cos(TAU * g);
  celD(x, () => x.ellipse(0, 0, 5 * stretch, 2.8, 0, 0, TAU), fur, { lw: 0.5, box: [-5.5, -2.8, 11, 5.6], s: 0.3, sx: 0.6, l: 0.22, lx: 0.2 });
  x.fillStyle = belly;
  x.beginPath();
  x.ellipse(-0.4, 1.3, 3.2 * stretch, 0.9, 0, 0, TAU);
  x.fill();
  PD(x, [[-5, -1.2], [-6.8, -2.6], [-5.2, 0.2]], fur, op(0.35, 0.3, 0));
  leg(-3.2, 1.4, false, false);
  leg(3, 1.4, true, false);
  // Cou et tête (pivot à (3,4, −2,2) : secouée ou tournée quand il est posé) ; museau jusqu'à 12,4.
  x.save();
  x.translate(3.4, -2.2);
  x.rotate(shake + look);
  x.translate(-3.4, 2.2);
  celD(
    x,
    () => {
      x.moveTo(3.4, -2.2);
      x.lineTo(6.8, -6.2);
      x.lineTo(9.8, -4);
      x.lineTo(5.2, 0.6);
      x.closePath();
    },
    fur,
    { lw: 0.5, box: [3, -6.5, 7, 7.5], s: 0.3, sx: 0.6, l: 0.2, lx: 0.18 },
  );
  celD(
    x,
    () => {
      x.moveTo(6.8, -6.8);
      x.quadraticCurveTo(9.4, -8.2, 11.8, -5.6);
      x.quadraticCurveTo(12.8, -4.2, 11.6, -3);
      x.quadraticCurveTo(9.4, -2.2, 6.8, -4);
      x.closePath();
    },
    fur,
    { lw: 0.5, box: [6.5, -8.5, 6.5, 6], s: 0.3, sx: 0.6, l: 0.22, lx: 0.18 },
  );
  x.fillStyle = belly;
  x.beginPath();
  x.ellipse(10.4, -3.8, 1.5, 0.8, 0.3, 0, TAU);
  x.fill();
  // Bois : deux perches ramifiées, encre puis brun.
  const antler = (lw: number, c: string): void => {
    x.strokeStyle = c;
    x.lineWidth = lw;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(8.4, -6.6);
    x.lineTo(6.6, -10.4);
    x.moveTo(7.6, -8.4);
    x.lineTo(5.4, -9.2);
    x.moveTo(7.1, -9.4);
    x.lineTo(6.4, -12);
    x.moveTo(8.8, -6.6);
    x.lineTo(10.8, -10.4);
    x.moveTo(9.8, -8.4);
    x.lineTo(12, -9.2);
    x.moveTo(10.3, -9.4);
    x.lineTo(10.6, -12);
    x.stroke();
  };
  antler(1.7, INK);
  antler(0.9, hz(DARK));
  PD(x, [[7, -6.6], [5.6, -8], [7.4, -7.6]], fur, op(0.3, 0, 0));
  // Œil, nez (le meneur : rouge, lumineux la nuit).
  disc(x, 9.6, -5.6, 0.5, hz(BLACK), 0);
  x.fillStyle = '#FFFFFF';
  x.fillRect(9.3, -5.9, 0.3, 0.3);
  if (!lead) disc(x, 12, -4.5, 0.55, hz('#2A1A10'), 0);
  else if (p.lit) {
    x.glowing(() => {
      halo(x, 11.9, -4.6, 2.2, '#FF3B3B', 0.4);
      ball(x, 11.9, -4.6, 1.1, '#FF5B5B', 0.3);
    });
  } else ball(x, 11.9, -4.6, 1.1, hz('#FF3B3B'), 0.3);
  // Harnais rouge à grelot d'or.
  x.strokeStyle = hz(HARNESS);
  x.lineWidth = 0.7;
  x.beginPath();
  x.moveTo(2.4, -2.6);
  x.quadraticCurveTo(3.2, 0.6, 1.4, 2.4);
  x.stroke();
  ball(x, 4.5, 0.5, 0.9, hz(GOLD), 0.3);
  x.restore();
  // Souffle blanc devant le museau (posé) : trois disques croissants qui s'éloignent.
  if (puff > 0) {
    x.fillStyle = `rgba(255,255,255,${(0.4 * (1 - puff * 0.7)).toFixed(3)})`;
    for (let k = 0; k < 3; k++) {
      x.beginPath();
      x.arc(13.4 + k * 1.6 + puff * 3, -3.8 - k * 0.9 - puff * 2, (0.7 + k * 0.35) * (0.6 + puff), 0, TAU);
      x.fill();
    }
  }
}

// ---------- Traîneau (caisse −18..10 × −14..−4 à filet d'or et dossier capitonné, patins −20..13 à volute, lanterne à (11, −11)).
// Allumé : verre jaune et halo r 3,2 dans glowing. ----------
function sleigh(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const hz = hazer(num(a.far));
  const red = hz(SRED);
  const gold = hz(GOLD);
  celD(
    x,
    () => {
      x.moveTo(-18, -8);
      x.quadraticCurveTo(-19, -14, -14, -14);
      x.lineTo(-12, -9);
      x.lineTo(10, -9);
      x.quadraticCurveTo(12, -7, 9, -4);
      x.lineTo(-14, -4);
      x.quadraticCurveTo(-18, -4, -18, -8);
      x.closePath();
    },
    red,
    { lw: 0.55, box: [-19, -14, 31, 10], s: 0.3, sx: 0.66, l: 0.22, lx: 0.2 },
  );
  L(x, -14, -9, 9, -9, gold, 1);
  L(x, -16, -6, 7, -6, gold, 0.4);
  // Rehaut du dossier.
  x.beginPath();
  x.moveTo(-17, -8.5);
  x.quadraticCurveTo(-17.6, -12.6, -14.2, -13);
  x.strokeStyle = 'rgba(255,230,160,0.7)';
  x.lineWidth = 0.5;
  x.stroke();
  // Patins dorés cernés d'encre, boule à la volute.
  const run = (): void => {
    x.beginPath();
    x.moveTo(-20, 0);
    x.quadraticCurveTo(-22, -2, -19, -3);
    x.lineTo(9, -3);
    x.quadraticCurveTo(13, -3, 13, -7);
    x.moveTo(-16, -3);
    x.lineTo(-16, 0);
    x.moveTo(0, -3);
    x.lineTo(0, 0);
    x.moveTo(-20, 0);
    x.lineTo(10, 0);
  };
  run();
  x.strokeStyle = INK;
  x.lineWidth = 2.2;
  x.lineCap = 'round';
  x.stroke();
  run();
  x.strokeStyle = gold;
  x.lineWidth = 1.4;
  x.stroke();
  ball(x, 13, -7, 0.9, gold, 0.3);
  // Lanterne accrochée à l'avant : potence, verre, chapeau.
  tube(x, 11, -9, 11, -12.4, 0.6, hz(IRON), { lw: 0.25 });
  const glass: readonly (readonly [number, number])[] = [[9.6, -12.6], [12.4, -12.6], [12.2, -9.4], [9.8, -9.4]];
  if (p.lit) {
    x.glowing(() => {
      halo(x, 11, -11, 3.2, '#FFE6A0', 0.45);
      PD(x, glass, '#FFF3B0', { lw: 0.4, s: 0, l: 0 });
      x.fillStyle = '#FFFFFF';
      x.fillRect(10.3, -12, 1.4, 1.4);
    });
  } else PD(x, glass, hz('#E8E2CC'), op(0.4, 0.2, 0.3));
  RD(x, 9.4, -13.1, 3.2, 0.7, hz(IRON), op(0.3, 0, 0.2));
}

// ---------- Traînée (sparkle : étoiles à (−30,−9) (−40,−7) (−51,−10) (−62,−8) (−72,−9,5)) : étoiles à 8 branches qui tournent
// d'un huitième de tour sur le cycle (seamless), opacité 0,52 ± 0,38, halo la nuit (glowing) ; 16 grains d'or qui dérivent
// d'une boucle de 3 u sur le cycle et clignotent, s'éteignant vers l'arrière. ----------
const STARS: readonly (readonly [number, number, number])[] = [[-30, -9, 1.6], [-40, -7, 1.2], [-51, -10, 1.4], [-62, -8, 1], [-72, -9.5, 0.8]];
function trail(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const hz = hazer(num(a.far));
  const u = p.frame / FRAMES;
  const star = (sx: number, sy: number, r: number, i: number, alpha: number): void => {
    x.fillStyle = `rgba(255,243,176,${alpha.toFixed(3)})`;
    x.beginPath();
    for (let k = 0; k < 8; k++) {
      const rr = k % 2 ? r * 0.4 : r * 1.4;
      const an = (k * Math.PI) / 4 + (u * Math.PI) / 4 + i;
      x.lineTo(sx + Math.cos(an) * rr, sy + Math.sin(an) * rr);
    }
    x.closePath();
    x.fill();
  };
  STARS.forEach(([sx, sy, r], i) => {
    const alpha = 0.52 + 0.38 * Math.sin(TAU * u + i);
    if (p.lit) {
      x.glowing(() => {
        halo(x, sx, sy, r * 2.6, '#FFF3B0', alpha * 0.5);
        star(sx, sy, r, i, alpha);
      });
    } else {
      star(sx, sy, r, i, alpha);
      x.strokeStyle = 'rgba(42,26,24,0.35)';
      x.lineWidth = 0.25;
      x.stroke();
    }
  });
  // Poussière d'or (positions fixes, tirées une fois).
  for (let k = 0; k < 16; k++) {
    const dy = ((k * 7919) % 11) / 11 - 0.5;
    const alpha = (0.25 + 0.3 * Math.abs(Math.sin(TAU * u + k))) * (1 - k / 18);
    x.fillStyle = hz('#FFDC78');
    x.globalAlpha = alpha;
    x.beginPath();
    x.arc(-26 - k * 3 + u * 3, -8.5 + dy * 4, 0.45, 0, TAU);
    x.fill();
    x.globalAlpha = 1;
  }
}

// ---------- Hotte (SantaSack : fond à y = −2, centré ; `M−3 −2 Q−8 −10 −1 −13 Q5 −10 3 −2`) : sac brun, cordon, deux
// paquets qui dépassent. ----------
function sack(x: TintedCtx, a: PropArgs): void {
  const hz = hazer(num(a.far));
  celD(
    x,
    () => {
      x.moveTo(-3, -2);
      x.quadraticCurveTo(-8, -10, -1, -13);
      x.quadraticCurveTo(5, -10, 3, -2);
      x.closePath();
    },
    hz('#8A6A3E'),
    { lw: 0.5, box: [-8, -13, 11, 11], s: 0.3, sx: 0.62, l: 0.22, lx: 0.2 },
  );
  x.beginPath();
  x.moveTo(-3, -11);
  x.quadraticCurveTo(-1, -14, 2, -11);
  x.strokeStyle = INK;
  x.lineWidth = 1.4;
  x.lineCap = 'round';
  x.stroke();
  x.strokeStyle = hz(DARK);
  x.lineWidth = 0.8;
  x.stroke();
  RD(x, -2.6, -14.6, 2.2, 2.2, hz('#E0305A'), op(0.3, 0.3, 0.2));
  L(x, -1.5, -14.6, -1.5, -12.4, hz(GOLD), 0.4);
  RD(x, 0, -15.2, 2, 2.4, hz('#3B6FD6'), op(0.3, 0.3, 0.2));
  L(x, 0, -14, 2, -14, hz(GOLD), 0.4);
}

registerProps({
  reindeer: { box: () => [-10.5, -13.5, 32.5, 23.5], frames: FRAMES, paint: reindeer },
  sleigh: { box: () => [-23, -17.5, 41, 19], paint: sleigh },
  'santa-trail': { box: () => [-78, -15.5, 57, 13], frames: FRAMES, paint: trail },
  'santa-sack': { box: () => [-9, -16, 13, 15], paint: sack },
});

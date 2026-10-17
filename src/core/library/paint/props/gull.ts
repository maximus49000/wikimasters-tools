import { ink, TAU } from '../cel';
import type { TintedCtx } from '../shop/ctx';
import { ball, disc, ED, PD } from './kit';
import { registerProps, type PropArgs, type PropPaint } from './index';

// Mouette cellulo (G5, tâche 14), portée de la maquette validée (docs/superpowers/maquettes/g5-fetes/index.html : `gull`, notes.md
// §10) dans le repère de l'ancien sprite figé du décor (supprimé en G5 : origine au corps, ailes vers ±x, tête vers +x). Corps
// 5,2 × 2 blanc à dos gris, tête, bec jaune, œil ; ailes en deux courbes (bord d'attaque convexe, bord de fuite) à bout noir,
// aile du fond grise, aile de devant blanche. Quatre ailes (`wing`) : `flap` battement en 8 poses clés (ailes à plat → basses →
// à plat → hautes, le corps suit d'un peu moins d'une unité en sens inverse), `glide` plané (ailes tendues légèrement
// relevées), `turn` virage (plané vu de biais : aile du côté du virage raccourcie ×0,75, l'autre ×0,65), `perched` posée (ailes
// repliées vers le bas, envergure réduite). Les trois dernières ne dépendent pas de la pose (le calque passe frame 0). Le
// lointain (`far` de la maquette : mélange au bleu de brume) est rendu par l'opacité du calque, pas ici ; la taille `s` par
// l'échelle de l'image. Le sens de vol (`dir`) est le retournement du canvas par l'hôte (peint vers +x, jamais un miroir
// d'image). Rien de lumineux : la nuit, la mouette est simplement teinte (de toute façon, il n'y en a pas).

const WHITE = '#F8F8F4';
const GREY = '#B8BEC8';
const TIP = '#3A3E48';
const BEAK = '#E8B030';
const EYE = '#1E1A18';

// Rythme du battement : 3,3 battements par seconde, 8 poses par battement (la pose k est l'instant k/8 du battement).
export const GULL_FLAP_HZ = 3.3;
export const GULL_FLAP_PERIOD_S = 1 / GULL_FLAP_HZ;
export const GULL_FRAMES = 8;

export type GullWing = 'flap' | 'glide' | 'turn' | 'perched';
export const gullWing = (a: PropArgs): GullWing => (a.wing === 'glide' || a.wing === 'turn' || a.wing === 'perched' ? a.wing : 'flap');

// Paramètres de dessin d'une aile (maquette) : `flap` −1 (hautes)..1 (basses), `glide`, `turn` −1..1, `bob` : décalage du corps.
type Pose = { flap: number; glide: boolean; turn: number; bob: number };
function poseOf(wing: GullWing, frame: number): Pose {
  if (wing === 'glide') return { flap: 0, glide: true, turn: 0, bob: 0 };
  if (wing === 'turn') return { flap: 0, glide: true, turn: 0.6, bob: 0 };
  if (wing === 'perched') return { flap: 0.95, glide: false, turn: 0.6, bob: 0 };
  const flap = Math.sin((TAU * frame) / GULL_FRAMES);
  return { flap, glide: false, turn: 0, bob: -0.6 * flap };
}

// Aile d'un côté (`side` −1 : fond, grise ; 1 : devant, blanche) : deux courbes quadratiques fermées, trait encré, bout noir.
function wingOf(x: TintedCtx, side: 1 | -1, { flap, glide, turn }: Pose): void {
  const sx = side * (1 - 0.35 * Math.abs(turn)) * (side * turn > 0 ? 0.75 : 1);
  const tipY = glide ? -1.6 : flap * 3.6;
  const midY = glide ? -1.4 : flap * 1.6;
  x.beginPath();
  x.moveTo(0, -0.4);
  x.quadraticCurveTo(sx * 3.2, midY - 1.2, sx * 7.2, tipY - 0.4);
  x.quadraticCurveTo(sx * 4, midY + 0.9, sx * 1.2, 0.8);
  x.closePath();
  x.fillStyle = side < 0 ? GREY : WHITE;
  x.fill();
  x.strokeStyle = ink(0.9);
  x.lineWidth = 0.35;
  x.stroke();
  x.fillStyle = TIP;
  x.beginPath();
  x.moveTo(sx * 5.4, tipY - 0.9);
  x.lineTo(sx * 7.2, tipY - 0.4);
  x.lineTo(sx * 5.8, tipY + 0.2);
  x.fill();
}

function gull(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const pose = poseOf(gullWing(a), p.frame);
  x.save();
  x.translate(0, pose.bob);
  wingOf(x, -1, pose);
  ED(x, 0.2, 0.4, 2.6, 1, WHITE, { lw: 0.35, s: 0.25, sx: 0.55, l: 0.2 });
  wingOf(x, 1, pose);
  ball(x, 2.8, -0.4, 0.95, WHITE, 0.3);
  PD(x, [[3.6, -0.5], [5.2, -0.2], [3.6, 0.1]], BEAK, { lw: 0.25, s: 0, l: 0 });
  disc(x, 3, -0.6, 0.22, EYE, 0);
  x.restore();
}

// Cadre : envergure ±7,2 (+ trait), bouts d'aile de −5,5 (hautes, corps remonté) à 4,4 (basses, corps descendu), bec à 5,2.
registerProps({
  gull: { box: () => [-8, -6, 16, 11], frames: GULL_FRAMES, paint: gull },
});

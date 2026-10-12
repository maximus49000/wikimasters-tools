import type { ReactElement } from 'react';
import type { PictoId } from '../../core/library/city/shops/scene/moves';
import { INK } from '../../core/library/paint/cel';

// Pictogrammes manga des commerces (G4b) : six dessins au trait tremblé (« ? », « ! », ♪, traits de joie, goutte de gêne, cœur),
// portés de la planche de la maquette du 2026-10-12. Un picto vit PICTO_LIFE (1 s) au-dessus de la tête (ancre `headTop`) : petit
// saut d'apparition sur POP_S (grand puis à sa taille, en montant), effacement sur les FADE_S dernières. Repère : (0, 0) = sommet
// du crâne, le dessin s'étend vers le haut (y < 0), ≈ 10 unités du pantin (≈ 5 px derrière une vitrine). Pas de teinte de nuit :
// l'encre et les couleurs du picto sont celles d'un trait de crayon, pas d'un objet éclairé. Aucun id, aucune animation CSS :
// le metteur en scène rend le picto avec son âge à chaque image.
export const PICTO_LIFE = 1;
const POP_S = 0.15;
const FADE_S = 0.2;
// Échelle du dessin (unités de la planche → unités du pantin, 40 de haut) : un peu plus grand que la planche (× 0,9) pour
// rester lisible à 21 px (« ? » ≈ 7 px de haut).
const S = 1.3;
const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const f = (v: number): number => Math.round(v * 1000) / 1000;

// Trait tremblé : chaque sommet est décalé d'une petite valeur déterministe (fonction de son rang et de sa position), comme le
// `wob` de la maquette ; les points sont calculés une fois.
const wob = (i: number): number => Math.sin(i * 12.9898) * 0.18;
const shaky = (pts: readonly (readonly [number, number])[]): string => pts.map(([x, y], i) => `${f(x + wob(i + x))},${f(y + wob(i * 3 + y))}`).join(' ');
const stroke = (points: string, w: number, c = INK): ReactElement => <polyline key={points} points={points} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;

// Points précalculés (unités de la planche).
const Q_TAIL = shaky([[1.4, -3.2], [0.3, -2], [0, -0.4]]);
const BANG = shaky([[0.3, -7], [-0.2, -1]]);
const NOTE_STEM = shaky([[1.8, -7], [1.6, -0.5]]);
const NOTE_FLAG = shaky([[1.8, -7], [4.2, -5.6], [4, -3.6]]);
const JOY_RAYS = [-1.15, -0.5, 0.15, 0.8].map((a) => shaky([[Math.cos(a) * 2.5, -2 + Math.sin(a) * 2.5], [Math.cos(a) * 5.5, -2 + Math.sin(a) * 5.5]]));

const GLYPH: Readonly<Record<PictoId, ReactElement>> = {
  // « ? » : crochet, queue tremblée, point.
  question: (
    <>
      <path d="M-2.17 -4.94 A2.2 2.2 0 1 1 1.56 -3.04" fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
      {stroke(Q_TAIL, 1.1)}
      <circle cx={0} cy={1.6} r={0.7} fill={INK} />
    </>
  ),
  // « ! » : barre épaisse, point.
  bang: (
    <>
      {stroke(BANG, 1.5)}
      <circle cx={0} cy={1.3} r={0.85} fill={INK} />
    </>
  ),
  // ♪ : hampe, crochet, tête penchée.
  note: (
    <>
      {stroke(NOTE_STEM, 1)}
      {stroke(NOTE_FLAG, 1)}
      <ellipse cx={0.3} cy={-0.2} rx={1.7} ry={1.2} fill={INK} transform="rotate(-23 0.3 -0.2)" />
    </>
  ),
  // Traits de joie : quatre rayons orange soulignés d'un trait d'encre fin.
  joy: (
    <>
      {JOY_RAYS.map((p) => stroke(p, 1.1, '#E8A030'))}
      {JOY_RAYS.map((p) => stroke(p, 0.45))}
    </>
  ),
  // Goutte de gêne : aplat bleu, ombre violacée à droite, rehaut, encre.
  sweat: (
    <>
      <path d="M0 -6 Q3 -1.5 0 0.8 Q-3 -1.5 0 -6Z" fill="#7AC8E8" />
      <path d="M0.4 -4.4 Q2.4 -1.4 0.3 0.4 Q1.5 -1.6 0.4 -4.4Z" fill="#6A9ED0" />
      <circle cx={-0.8} cy={-2.2} r={0.6} fill="#FFFFFF" />
      <path d="M0 -6 Q3 -1.5 0 0.8 Q-3 -1.5 0 -6Z" fill="none" stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />
    </>
  ),
  // Cœur : aplat rose, ombre sur le lobe droit, rehaut sur le gauche, encre.
  heart: (
    <>
      <path d="M0 1.2 C-5.5 -2.5 -2.6 -7 0 -3.8 C2.6 -7 5.5 -2.5 0 1.2Z" fill="#E8456B" />
      <path d="M0 1.2 C2.2 -0.6 3.6 -2.2 3.9 -3.8 C3.4 -2.2 2 -0.8 0 0.2Z" fill="#B8406E" />
      <path d="M-3 -4.2 Q-2.4 -5.2 -1.6 -5" fill="none" stroke="#FFC0CC" strokeWidth={0.6} strokeLinecap="round" />
      <path d="M0 1.2 C-5.5 -2.5 -2.6 -7 0 -3.8 C2.6 -7 5.5 -2.5 0 1.2Z" fill="none" stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />
    </>
  ),
};

// Picto à l'âge `age` (s) : null hors de [0, PICTO_LIFE[. Saut d'apparition (échelle 1,6 → 1, montée de 2 à 5 unités), puis
// léger retrait et fondu sur la fin.
export function Picto({ id, age }: { id: PictoId; age: number }): ReactElement | null {
  if (age < 0 || age >= PICTO_LIFE) return null;
  const pop = ease(Math.min(1, age / POP_S));
  const out = age > PICTO_LIFE - FADE_S ? (PICTO_LIFE - age) / FADE_S : 1;
  const sc = S * (1.6 - 0.6 * pop) * (0.85 + 0.15 * out);
  const lift = 2 + 3 * pop;
  const opacity = Math.max(0, Math.min(1, Math.min(1, age / POP_S) * out));
  return (
    <g data-picto={id} transform={`translate(0 ${f(-lift)}) scale(${f(sc)})`} opacity={f(opacity)}>
      {GLYPH[id]}
    </g>
  );
}

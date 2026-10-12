import type { ReactElement } from 'react';
import type { PictoId } from '../../core/library/city/shops/scene/moves';
import { INK } from '../../core/library/paint/cel';

// Pictogrammes manga des commerces (G4b) : six dessins au trait tremblé (« ? », « ! », ♪, traits de joie, goutte de gêne, cœur),
// portés de la planche de la maquette du 2026-10-12. Un picto vit PICTO_LIFE (1 s) au-dessus de la tête (ancre `headTop`) : petit
// saut d'apparition sur POP_S (grand puis à sa taille, en montant), effacement sur les FADE_S dernières. Repère : (0, 0) = sommet
// du crâne, le dessin s'étend vers le haut (y < 0), ≈ 10 unités du pantin (≈ 5 px derrière une vitrine). Pas de teinte de nuit :
// l'encre et les couleurs du picto sont celles d'un trait de crayon, pas d'un objet éclairé. Un halo crème sous le trait (comme
// le blanc de la case d'un manga) le garde lisible sur une enseigne sombre ou de nuit. Aucun id, aucune animation CSS :
// le metteur en scène rend le picto avec son âge à chaque image.
export const PICTO_LIFE = 1;
const POP_S = 0.15;
const FADE_S = 0.2;
// Échelle du dessin (unités de la planche → unités du pantin, 40 de haut) : un peu plus grand que la planche (× 0,9) pour
// rester lisible à 21 px (« ? » ≈ 7 px de haut).
const S = 1.3;
// Halo : couleur et épaisseur ajoutée autour de chaque trait.
const HALO = '#F4EAD0';
const HALO_W = 1.3;
const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const f = (v: number): number => Math.round(v * 1000) / 1000;

// Trait tremblé : chaque sommet est décalé d'une petite valeur déterministe (fonction de son rang et de sa position), comme le
// `wob` de la maquette ; les points sont calculés une fois.
const wob = (i: number): number => Math.sin(i * 12.9898) * 0.18;
const shaky = (pts: readonly (readonly [number, number])[]): string => pts.map(([x, y], i) => `${f(x + wob(i + x))},${f(y + wob(i * 3 + y))}`).join(' ');

// Points précalculés (unités de la planche).
const Q_TAIL = shaky([[1.4, -3.2], [0.3, -2], [0, -0.4]]);
const BANG = shaky([[0.3, -7], [-0.2, -1]]);
const NOTE_STEM = shaky([[1.8, -7], [1.6, -0.5]]);
const NOTE_FLAG = shaky([[1.8, -7], [4.2, -5.6], [4, -3.6]]);
const JOY_RAYS = [-1.15, -0.5, 0.15, 0.8].map((a) => shaky([[Math.cos(a) * 2.5, -2 + Math.sin(a) * 2.5], [Math.cos(a) * 5.5, -2 + Math.sin(a) * 5.5]]));
const Q_HOOK = 'M-2.17 -4.94 A2.2 2.2 0 1 1 1.56 -3.04';
const DROP = 'M0 -6 Q3 -1.5 0 0.8 Q-3 -1.5 0 -6Z';
const HEART = 'M0 1.2 C-5.5 -2.5 -2.6 -7 0 -3.8 C2.6 -7 5.5 -2.5 0 1.2Z';

// Dessin d'un picto : `halo` vrai trace la même forme en crème, élargie (dessous), faux le trait d'encre et ses aplats.
function glyph(id: PictoId, halo: boolean): ReactElement[] {
  const c = (ink: string): string => (halo ? HALO : ink);
  const w = (v: number): number => (halo ? v + HALO_W : v);
  const line = (points: string, lw: number, col = INK): ReactElement => <polyline key={`${points}|${halo}`} points={points} fill="none" stroke={c(col)} strokeWidth={w(lw)} strokeLinecap="round" strokeLinejoin="round" />;
  const path = (d: string, fill: string | null, lw: number, key: string): ReactElement => (
    <path key={key} d={d} fill={fill === null ? 'none' : c(fill)} stroke={halo || fill === null ? c(INK) : 'none'} strokeWidth={halo ? w(lw) : lw} strokeLinejoin="round" strokeLinecap="round" />
  );
  const disc = (cx: number, cy: number, r: number, fill: string, key: string): ReactElement => <circle key={key} cx={cx} cy={cy} r={halo ? r + HALO_W / 2 : r} fill={c(fill)} />;
  switch (id) {
    // « ? » : crochet, queue tremblée, point.
    case 'question':
      return [path(Q_HOOK, null, 1.1, 'hook'), line(Q_TAIL, 1.1), disc(0, 1.6, 0.7, INK, 'dot')];
    // « ! » : barre épaisse, point.
    case 'bang':
      return [line(BANG, 1.5), disc(0, 1.3, 0.85, INK, 'dot')];
    // ♪ : hampe, crochet, tête penchée.
    case 'note':
      return [line(NOTE_STEM, 1), line(NOTE_FLAG, 1), <ellipse key="head" cx={0.3} cy={-0.2} rx={halo ? 1.7 + HALO_W / 2 : 1.7} ry={halo ? 1.2 + HALO_W / 2 : 1.2} fill={c(INK)} transform="rotate(-23 0.3 -0.2)" />];
    // Traits de joie : quatre rayons orange soulignés d'un trait d'encre fin.
    case 'joy':
      return halo ? JOY_RAYS.map((p) => line(p, 1.1)) : [...JOY_RAYS.map((p) => line(p, 1.1, '#E8A030')), ...JOY_RAYS.map((p) => <polyline key={`${p}|ink`} points={p} fill="none" stroke={INK} strokeWidth={0.45} strokeLinecap="round" strokeLinejoin="round" />)];
    // Goutte de gêne : aplat bleu, ombre violacée à droite, rehaut, encre.
    case 'sweat':
      return halo
        ? [path(DROP, HALO, 0.7, 'drop')]
        : [
            path(DROP, '#7AC8E8', 0, 'fill'),
            <path key="shade" d="M0.4 -4.4 Q2.4 -1.4 0.3 0.4 Q1.5 -1.6 0.4 -4.4Z" fill="#6A9ED0" />,
            <circle key="hi" cx={-0.8} cy={-2.2} r={0.6} fill="#FFFFFF" />,
            path(DROP, null, 0.7, 'ink'),
          ];
    // Cœur : aplat rose, ombre sur le lobe droit, rehaut sur le gauche, encre.
    default:
      return halo
        ? [path(HEART, HALO, 0.7, 'heart')]
        : [
            path(HEART, '#E8456B', 0, 'fill'),
            <path key="shade" d="M0 1.2 C2.2 -0.6 3.6 -2.2 3.9 -3.8 C3.4 -2.2 2 -0.8 0 0.2Z" fill="#B8406E" />,
            <path key="hi" d="M-3 -4.2 Q-2.4 -5.2 -1.6 -5" fill="none" stroke="#FFC0CC" strokeWidth={0.6} strokeLinecap="round" />,
            path(HEART, null, 0.7, 'ink'),
          ];
  }
}
const GLYPH: Readonly<Record<PictoId, ReactElement>> = Object.fromEntries(
  (['question', 'bang', 'note', 'joy', 'sweat', 'heart'] as const).map((id) => [id, <>{glyph(id, true)}{glyph(id, false)}</>]),
) as Record<PictoId, ReactElement>;

// Allure d'un picto à l'âge `age` (s) : null hors de [0, PICTO_LIFE[. Saut d'apparition (échelle 1,6 → 1, montée de 2 à 5
// unités), puis léger retrait et fondu sur la fin. Lue par Picto et par la boucle de la scène des commerces (shop-scene).
export function pictoLook(age: number): { transform: string; opacity: string } | null {
  if (age < 0 || age >= PICTO_LIFE) return null;
  const pop = ease(Math.min(1, age / POP_S));
  const out = age > PICTO_LIFE - FADE_S ? (PICTO_LIFE - age) / FADE_S : 1;
  const sc = S * (1.6 - 0.6 * pop) * (0.85 + 0.15 * out);
  const lift = 2 + 3 * pop;
  const opacity = Math.max(0, Math.min(1, Math.min(1, age / POP_S) * out));
  return { transform: `translate(0 ${f(-lift)}) scale(${f(sc)})`, opacity: String(f(opacity)) };
}

// Dessin seul d'un picto (sans saut ni fondu), pour les emplacements pré-rendus de la scène.
export function PictoGlyph({ id }: { id: PictoId }): ReactElement {
  return GLYPH[id];
}

export function Picto({ id, age }: { id: PictoId; age: number }): ReactElement | null {
  const look = pictoLook(age);
  if (!look) return null;
  return (
    <g data-picto={id} transform={look.transform} opacity={look.opacity}>
      {GLYPH[id]}
    </g>
  );
}

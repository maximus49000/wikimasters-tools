import type { ReactElement } from 'react';
import type { FacadeLayout, FacadeWindow, Home, HomeTone, Level } from '../core/library/city/facade-layout';

// Dessin des fenêtres du calque de nuit (vague Ghibli, décor cellulo) : composants de présentation seuls, branchés par
// ghibli-windows.tsx (calque animé) et, pour la cage d'escalier, par le calque des halls. Dessin PROVISOIRE (rectangles
// teintés) : le port du code de la maquette (paintWindow, paintBalcony) remplace les corps sans toucher aux signatures.
// Contraintes du calque (perfs Android, rien n'apparaît sur place) :
// - le nombre de nœuds d'une fenêtre ne dépend ni de l'heure ni de `tone` (la barre de télé reste montée, transparente
//   hors télé) : seule l'opacité du groupe parent bascule ;
// - budget : le calque entier reste sous la borne mesurée sur main (≈ 18 nœuds par fenêtre allumable, lueur comprise) ;
// - aucune animation, aucun dégradé, aucun filtre.
const INK = '#2A1A18';
export const GLOW = 'rgba(255,214,130,0.22)';
const TONES: Record<HomeTone, string> = { warm: '#FFD86A', cream: '#FFF0C0', orange: '#FFB048', tv: '#9CC4FF' };
export const toneColor = (tone: HomeTone): string => TONES[tone];

// Taille de la lueur arrondie au demi-pixel : une définition partagée par toutes les fenêtres de même gabarit.
const q = (v: number): number => Math.round(v * 2) / 2;
export const glowSize = (w: number, h: number): { w: number; h: number } => ({ w: q(w), h: q(h) });
export const glowId = (prefix: string, w: number, h: number): string => `${prefix}-glow-${q(w) * 10}x${q(h) * 10}`;

// Lueur qui retombe sous l'appui, en coordonnées de la fenêtre (coin haut gauche en 0,0) : trapèze à fond arrondi.
function glowPath(w: number, h: number): string {
  const d = Math.min(9, Math.max(4, h * 0.7));
  return `M-0.5 ${h}H${w + 0.5}L${w + 3} ${h + d * 0.8}Q${w / 2} ${h + d + 2} -3 ${h + d * 0.8}Z`;
}

export function GlowDefs({ prefix, sizes }: { prefix: string; sizes: readonly { w: number; h: number }[] }): ReactElement {
  return (
    <defs>
      {sizes.map((s) => {
        const id = glowId(prefix, s.w, s.h);
        return <path key={id} id={id} data-glow-def="" d={glowPath(q(s.w), q(s.h))} fill={GLOW} />;
      })}
    </defs>
  );
}

// Mélange de deux couleurs hexadécimales (t = part de b).
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
// Mur ambiant de nuit (notes.md : amb(c) = mix(c, #1E2A5A, 0,64)) ; vitre éteinte = #232D52 mêlé à 25 % au mur ambiant.
const nightGlass = (wall: string): string => mix('#232D52', mix(wall, '#1E2A5A', 0.64), 0.25);

// Vitres éteintes d'un immeuble la nuit : deux chemins (vitre sombre, reflet) couvrant toutes ses vitres et lucarnes
// (`windows` : étages, cage, entresol, lucarnes vitrées ; œils-de-bœuf de `dormers`). `layout` du socle des jumeaux :
// ses fenêtres seules, sans lucarnes.
export function NightGlass({ layout, wall, opacity }: { layout: Pick<FacadeLayout, 'windows' | 'dormers'>; wall: string; opacity: number }): ReactElement {
  let glass = '';
  let shine = '';
  for (const { x, y, w, h } of layout.windows) {
    glass += `M${x} ${y}h${w}v${h}h${-w}z`;
    shine += `M${x} ${y + h * 0.55}L${x + w * 0.5} ${y}H${x + w * 0.7}L${x} ${y + h * 0.95}z`;
  }
  for (const d of layout.dormers) {
    if (d.type !== 'oeil') continue;
    const r = Math.min(d.w, d.h) / 2 - 0.6;
    const cx = d.cx;
    const cy = d.y + d.h / 2;
    glass += `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
  }
  return (
    <g data-night-glass="" opacity={opacity} style={{ transition: 'opacity 4s ease' }}>
      <path d={glass} fill={nightGlass(wall)} />
      <path d={shine} fill="rgba(150,170,230,0.22)" />
    </g>
  );
}

// Silhouette (tête + buste) dans certaines fenêtres sans accessoire (tirage fixe par fenêtre, indépendant de l'allumage).
export const windowFigure = (win: Pick<FacadeWindow, 'u' | 'bay'>, home: Home | null): boolean => {
  if (!home) return false;
  const i = home.bays.indexOf(win.bay);
  return (home.props[i] ?? null) === null && (win.u * 17 + win.bay * 0.29) % 1 < 0.12;
};

// Fenêtre allumée : lueur (<use> de la définition de sa taille), vitre teintée, barre de télé (toujours montée), rideaux du
// logement, silhouette, menuiserie. `level` : étage (balcon devant une porte-fenêtre), null pour lucarnes et socle.
export function LitWindow({ win, home, level, tone, glow }: { win: FacadeWindow; home: Home | null; level: Level | null; tone: HomeTone; glow: string }): ReactElement {
  void level;
  const { x, y, w, h } = win;
  const side = home?.curtain?.style === 'side' ? home.curtain.color : null;
  const cw = Math.min(1.8, Math.max(1, w * 0.22));
  return (
    <>
      <use href={`#${glow}`} x={x} y={y} />
      <rect x={x} y={y} width={w} height={h} fill={toneColor(tone)} />
      <rect x={x + 0.6} y={y + h * 0.35} width={Math.max(0, w - 1.2)} height={h * 0.3} fill="#FFFFFF" opacity={tone === 'tv' ? 0.35 : 0} />
      {side && <path d={`M${x} ${y}h${cw}v${h}h${-cw}zM${x + w - cw} ${y}h${cw}v${h}h${-cw}z`} fill={side} />}
      {windowFigure(win, home) && (
        <g data-figure="" fill="#3A2018">
          <circle cx={x + w / 2} cy={y + h * 0.45} r={Math.min(w, h) * 0.16} />
          <rect x={x + w * 0.3} y={y + h * 0.6} width={w * 0.4} height={h * 0.4} />
        </g>
      )}
      <path d={`M${x} ${y}h${w}v${h}h${-w}zM${x + w / 2} ${y}v${h}`} fill="none" stroke={INK} strokeWidth={0.55} />
    </>
  );
}

// Fenêtre de cage d'escalier allumée (minuterie des halls).
export function StairWindow({ win }: { win: FacadeWindow }): ReactElement {
  const { x, y, w, h } = win;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill="#F4F0D8" />
      <path d={`M${x} ${y}h${w}v${h}h${-w}z`} fill="none" stroke={INK} strokeWidth={0.5} />
    </>
  );
}

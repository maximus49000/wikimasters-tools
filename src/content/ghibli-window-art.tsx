import { useMemo, type ReactElement } from 'react';
import type { FacadeLayout, FacadeWindow, Home, HomeTone, Level } from '../core/library/city/facade-layout';

// Dessin des fenêtres du calque de nuit (vague Ghibli, décor cellulo) : composants de présentation seuls, branchés par
// ghibli-windows.tsx (calque animé) et, pour la cage d'escalier, par le calque des halls. Port de la branche allumée de
// `paintWindow` et de la lumière retombée de `paintBalcony` (docs/superpowers/maquettes/facades-parisiennes/maquette.html).
// Contraintes du calque (perfs Android, rien n'apparaît sur place) :
// - le nombre de nœuds d'une fenêtre ne dépend ni de l'heure ni de `tone` (la barre de télé et le reflet haut restent montés,
//   l'un transparent quand l'autre est visible) : seule l'opacité du groupe parent bascule ; les nœuds varient d'une
//   fenêtre à l'autre (rideaux, accessoire, silhouette, balcon, appui, jardinière), jamais pour une même fenêtre ;
// - budget : le calque entier reste sous la borne mesurée sur main (≈ 18 nœuds par fenêtre allumable, lueur comprise) ;
//   ici 7 à 14 nœuds par fenêtre, la lueur (deux paliers + liseré) étant une définition partagée par taille (<use>) ;
// - aucune animation, aucun dégradé, aucun filtre.
const INK = '#2A1A18';
export const GLOW = 'rgba(255,214,130,0.22)';
// Liseré fin autour du cadre, appui éclairé, lumière sur la jardinière et la dalle du balcon (notes.md §Lumière).
const GLOW_RIM = 'rgba(255,214,130,0.16)';
const GLOW_SLAB = 'rgba(255,214,130,0.3)';
const SILL_LIT = '#FFE8B0';
const TONES: Record<HomeTone, string> = { warm: '#FFD86A', cream: '#FFF0C0', orange: '#FFB048', tv: '#9CC4FF' };
export const toneColor = (tone: HomeTone): string => TONES[tone];
// Cage d'escalier allumée (minuterie), bois des accessoires, feuillage.
const STAIR = '#F4F0D8';
const LAMP_WOOD = '#6E3A2A';
const PLANT = '#2A4A30';
const POT = '#5A3A2E';
const SHELF = 'rgba(60,30,30,0.6)';
const SHELF_BACK = 'rgba(60,30,30,0.45)';
const VOILE = 'rgba(255,248,230,0.45)';
// Garde-corps : hauteur de la rambarde (filant / balconnet) et pas des barreaux, comme `paintBalcony`.
const RAIL_H = { filant: 5.5, balconnet: 4 } as const;
const BAR_STEP = 1.5;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
// Taille de la lueur arrondie au demi-pixel : une définition partagée par toutes les fenêtres de même gabarit.
const q = (v: number): number => Math.round(v * 2) / 2;
export const glowSize = (w: number, h: number): { w: number; h: number } => ({ w: q(w), h: q(h) });
export const glowId = (prefix: string, w: number, h: number): string => `${prefix}-glow-${q(w) * 10}x${q(h) * 10}`;

// Lueur qui retombe sous l'appui, en coordonnées de la fenêtre (coin haut gauche en 0,0) : trapèze à fond arrondi de
// `d = clamp(0,7 h, 4, 9)` px, bord net ; `k` = palier (1 : forme entière, 0,55 : palier intérieur plus court et plus étroit).
function glowPath(w: number, h: number, k: number): string {
  const d = clamp(h * 0.7, 4, 9);
  return `M-0.5 ${h}H${w + 0.5}L${w + 1.5 + 1.5 * k} ${h + d * k * 0.8}Q${w / 2} ${h + d * k + 2 * k} ${-1.5 - 1.5 * k} ${h + d * k * 0.8}Z`;
}

// Lueur d'une fenêtre allumée : deux paliers plats (forme douce à bord net) + liseré fin autour du cadre, par taille.
function Glow({ w, h }: { w: number; h: number }): ReactElement {
  return (
    <>
      <path d={glowPath(w, h, 1)} fill={GLOW} />
      <path d={glowPath(w, h, 0.55)} fill={GLOW} />
      <rect x={-1.6} y={-1.2} width={w + 3.2} height={h + 1.2} fill={GLOW_RIM} />
    </>
  );
}

export function GlowDefs({ prefix, sizes }: { prefix: string; sizes: readonly { w: number; h: number }[] }): ReactElement {
  return (
    <defs>
      {sizes.map((s) => {
        const id = glowId(prefix, s.w, s.h);
        return (
          <g key={id} id={id} data-glow-def="">
            <Glow w={q(s.w)} h={q(s.h)} />
          </g>
        );
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
export const amb = (c: string): string => mix(c, '#1E2A5A', 0.64);
export const nightGlass = (wall: string): string => mix('#232D52', amb(wall), 0.25);
// Bord haut de la vitre éteinte : ombre nette du linteau (shade(#232D52, 0,45) vers #5A4A9C de cel.ts).
const GLASS_TOP = mix('#232D52', '#5A4A9C', 0.45);
// Luminance d'une couleur hexadécimale (pondération sRGB, 0 à 255).
export function luminance(c: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Rideaux des vitres éteintes la nuit, jamais plus clairs que le mur ambiant (spec : une vitre éteinte ne ressort pas claire) :
// voilage = à mi-chemin entre la vitre sombre et le mur ambiant (toujours entre les deux) ; rideau latéral = sa couleur
// ambiante, assombrie dans le même rapport sur ses trois canaux si elle dépasse la luminance du mur (teinte conservée).
export const nightVoile = (wall: string): string => mix(nightGlass(wall), amb(wall), 0.5);
export function nightCurtain(color: string, wall: string): string {
  const c = amb(color);
  const max = luminance(amb(wall));
  const lum = luminance(c);
  if (lum <= max) return c;
  const k = max / lum;
  return `#${[1, 3, 5].map((i) => Math.floor(parseInt(c.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
}

const rectPath = (x: number, y: number, w: number, h: number): string => `M${x} ${y}h${w}v${h}h${-w}z`;
const curtainWidth = (w: number): number => clamp(w * 0.22, 1, 1.8);
// Menuiserie d'une fenêtre : cadre, meneau, traverse si h ≥ 8 (comme `paintDayWindow`).
const joineryPath = (x: number, y: number, w: number, h: number): string => `${rectPath(x, y, w, h)}M${x + w / 2} ${y}v${h}${h >= 8 ? `M${x} ${y + h * 0.33}h${w}` : ''}`;

// Vitres éteintes d'un immeuble la nuit : chemins couvrant toutes ses vitres et lucarnes (`windows` : étages, cage,
// entresol, lucarnes vitrées ; œils-de-bœuf de `dormers`) : vitre sombre, reflet, ombre du linteau, rideaux des logements
// teintés par l'ambiance (jamais plus clairs que le mur ; un chemin par couleur, voilages à part) quand `homes` est fourni,
// puis, par-dessus (le calque couvre le décor peint), la menuiserie de toutes les fenêtres en un seul chemin et les
// barreaux des garde-corps devant les vitres (portes-fenêtres d'un étage filant, balconnets) quand `levels` et `x` sont
// fournis. `layout` du socle des jumeaux : fenêtres et logements seuls, sans lucarnes ni balcons. Les chemins ne dépendent
// que de la mise en page et du mur : mémorisés, seule l'opacité change au fil des minutes.
type GlassLayout = Pick<FacadeLayout, 'windows' | 'dormers'> & Partial<Pick<FacadeLayout, 'homes' | 'levels' | 'x'>>;
export function NightGlass({ layout, wall, opacity }: { layout: GlassLayout; wall: string; opacity: number }): ReactElement {
  const paths = useMemo(() => {
    let glass = '';
    let shine = '';
    let top = '';
    let voile = '';
    let frames = '';
    let bars = '';
    const curtains = new Map<string, string>();
    for (const win of layout.windows) {
      const { x, y, w, h } = win;
      glass += rectPath(x, y, w, h);
      shine += `M${x} ${y + h * 0.55}L${x + w * 0.5} ${y}H${x + w * 0.7}L${x} ${y + h * 0.95}z`;
      top += rectPath(x, y, w, 1);
      frames += joineryPath(x, y, w, h);
      const balcony = balconyOf(win, layout.levels?.[win.level] ?? null, layout.x);
      if (balcony) bars += barsPath(win, balcony);
      const curtain = win.kind !== 'stair' && win.home >= 0 ? (layout.homes?.[win.home]?.curtain ?? null) : null;
      if (!curtain) continue;
      if (curtain.style === 'voile') voile += rectPath(x, y, w, h);
      else {
        const cw = curtainWidth(w);
        const c = nightCurtain(curtain.color, wall);
        curtains.set(c, (curtains.get(c) ?? '') + rectPath(x, y, cw, h) + rectPath(x + w - cw, y, cw, h));
      }
    }
    for (const d of layout.dormers) {
      if (d.type !== 'oeil') continue;
      const r = Math.min(d.w, d.h) / 2 - 0.6;
      const cx = d.cx;
      const cy = d.y + d.h / 2;
      glass += `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
      // Croisillon de l'œil-de-bœuf (le disque le recouvre).
      frames += `M${cx - r} ${cy}h${2 * r}M${cx} ${cy - r}v${2 * r}`;
    }
    return { glass, shine, top, voile, frames, bars, curtains: [...curtains.entries()] };
  }, [layout, wall]);
  return (
    <g data-night-glass="" opacity={opacity} style={{ transition: 'opacity 4s ease' }}>
      <path d={paths.glass} fill={nightGlass(wall)} />
      <path d={paths.shine} fill="rgba(150,170,230,0.22)" />
      <path d={paths.top} fill={GLASS_TOP} />
      {paths.voile && <path data-night-voile="" d={paths.voile} fill={nightVoile(wall)} />}
      {paths.curtains.map(([c, d]) => <path key={c} data-night-curtain="" d={d} fill={c} />)}
      <path data-night-frames="" d={paths.frames} fill="none" stroke={INK} strokeWidth={0.55} />
      {paths.bars && <path data-night-bars="" d={paths.bars} fill="none" stroke={INK} strokeWidth={0.5} />}
    </g>
  );
}

// Silhouette (tête + buste) dans certaines fenêtres sans accessoire (tirage fixe par fenêtre, indépendant de l'allumage).
export const windowFigure = (win: Pick<FacadeWindow, 'u' | 'bay'>, home: Home | null): boolean => {
  if (!home) return false;
  const i = home.bays.indexOf(win.bay);
  return (home.props[i] ?? null) === null && (win.u * 17 + win.bay * 0.29) % 1 < 0.12;
};

// Accessoire posé derrière la vitre : lampe à abat-jour (pied dans le même chemin), plante en pot, étagère de livres.
function Prop({ kind, x, y, w, h }: { kind: 'lamp' | 'plant' | 'shelf'; x: number; y: number; w: number; h: number }): ReactElement {
  if (kind === 'lamp') {
    return (
      <>
        <path d={`M${x + w * 0.55} ${y + h * 0.3}H${x + w * 0.95}L${x + w * 0.9} ${y + h * 0.55}H${x + w * 0.6}z${rectPath(x + w * 0.73, y + h * 0.55, 0.6, h * 0.45)}`} fill={LAMP_WOOD} />
        <rect x={x + w * 0.62} y={y + h * 0.33} width={w * 0.26} height={h * 0.1} fill="rgba(255,255,255,0.55)" />
      </>
    );
  }
  if (kind === 'plant') {
    const r1 = w * 0.2;
    const r2 = w * 0.16;
    const disc = (cx: number, cy: number, r: number): string => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
    return (
      <>
        <path d={disc(x + w * 0.3, y + h * 0.6, r1) + disc(x + w * 0.42, y + h * 0.5, r2)} fill={PLANT} />
        <rect x={x + w * 0.18} y={y + h * 0.72} width={w * 0.26} height={h * 0.28} fill={POT} />
      </>
    );
  }
  let boards = '';
  for (let k = 0; k < 3; k++) boards += rectPath(x + 0.8, y + 1 + k * (h / 3.2), w * 0.5, 0.6);
  return (
    <>
      <rect x={x + 0.8} y={y + 1} width={w * 0.5} height={Math.max(0, h - 2)} fill={SHELF_BACK} />
      <path d={boards} fill={SHELF} />
    </>
  );
}

// Balcon devant une fenêtre (étage noble ou filant : porte-fenêtre ; balconnet : fenêtre courante) : `by` dessus de la
// dalle, `rh` hauteur du garde-corps, `x0` premier barreau devant la vitre (pas 1,5 ; filant : barreaux depuis
// `x de la façade + 1,5 + 0,8` comme `paintBalcony`, approchés depuis la fenêtre quand ce x n'est pas connu).
type Balcony = { by: number; rh: number; x0: number };
function balconyOf(win: FacadeWindow, level: Level | null, facadeX?: number): Balcony | null {
  if (!level || level.balcony === 'none') return null;
  if (level.balcony === 'filant' && win.kind === 'french') {
    const first = facadeX !== undefined ? facadeX + 2.3 : win.x + 0.35;
    const x0 = first + Math.ceil(Math.max(0, win.x - first) / BAR_STEP) * BAR_STEP;
    return { by: level.y + level.h, rh: RAIL_H.filant, x0 };
  }
  // Balconnet : dalle sous la fenêtre, garde-corps de x − 1,2 à x + w + 1,2, premier barreau à 0,8 du bord.
  if (level.balcony === 'balconnet' && (win.kind === 'std' || win.kind === 'top')) return { by: win.y + win.h, rh: RAIL_H.balconnet, x0: win.x - 1.2 + 0.8 };
  return null;
}

// Lisse et barreaux du garde-corps en silhouette sur la vitre (partie du garde-corps devant la fenêtre seulement).
function barsPath(win: FacadeWindow, { by, rh, x0 }: Balcony): string {
  const { x, y, w, h } = win;
  const top = Math.max(y, by - rh);
  let bars = `M${x} ${top + 0.35}H${x + w}`;
  for (let k = x0; k < x + w; k += BAR_STEP) if (k >= x) bars += `M${k + 0.22} ${top}V${Math.min(y + h, by)}`;
  return bars;
}

// Lumière retombée d'une fenêtre allumée sur son balcon : garde-corps et dalle teintés, barreaux en silhouette sur la vitre.
function LitBalcony({ win, balcony }: { win: FacadeWindow; balcony: Balcony }): ReactElement {
  const { x, w } = win;
  const { by, rh } = balcony;
  return (
    <>
      <rect x={x - 1} y={by - rh} width={w + 2} height={rh} fill={GLOW} />
      <rect x={x - 1.5} y={by - 0.4} width={w + 3} height={1.4} fill={GLOW_SLAB} />
      <path d={barsPath(win, balcony)} fill="none" stroke={INK} strokeWidth={0.5} />
    </>
  );
}

// Fenêtre allumée : lueur (<use> de la définition de sa taille), vitre teintée, reflet haut ou barre de télé (tous deux
// montés, l'un transparent), voilage ou rideaux du logement, accessoire ou silhouette, menuiserie, appui éclairé,
// jardinière et balcon éclairés. `level` : étage (balcon devant la fenêtre), null pour lucarnes et socle.
export function LitWindow({ win, home, level, tone, glow }: { win: FacadeWindow; home: Home | null; level: Level | null; tone: HomeTone; glow: string }): ReactElement {
  const { x, y, w, h } = win;
  const tv = tone === 'tv';
  const curtain = home?.curtain ?? null;
  const prop = home ? (home.props[home.bays.indexOf(win.bay)] ?? null) : null;
  const balcony = balconyOf(win, level);
  // Appui éclairé : seules les fenêtres d'étage en ont un de peint (pas la porte-fenêtre ; les lucarnes non plus, roof-painter).
  const sill = win.kind === 'std' || win.kind === 'top';
  let voile = '';
  if (curtain?.style === 'voile') for (let k = 1; k < w; k += 1.6) voile += `M${x + k} ${y}L${x + k - 0.6} ${y + h}`;
  const cw = curtainWidth(w);
  return (
    <>
      <use href={`#${glow}`} x={x} y={y} />
      <rect x={x} y={y} width={w} height={h} fill={toneColor(tone)} />
      <rect x={x} y={y} width={w} height={h * 0.3} fill="#FFFFFF" opacity={tv ? 0 : tone === 'cream' ? 0.3 : 0.2} />
      <rect x={x + 0.6} y={y + h * 0.35} width={Math.max(0, w - 1.2)} height={h * 0.3} fill="#FFFFFF" opacity={tv ? 0.35 : 0} />
      {curtain?.style === 'voile' && (
        <>
          <rect x={x} y={y} width={w} height={h} fill={VOILE} />
          <path d={voile} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={0.4} />
        </>
      )}
      {prop && <Prop kind={prop} x={x} y={y} w={w} h={h} />}
      {windowFigure(win, home) && (
        <g data-figure="" fill="#3A2018">
          <circle cx={x + w / 2} cy={y + h * 0.45} r={Math.min(w, h) * 0.16} />
          <rect x={x + w * 0.3} y={y + h * 0.6} width={w * 0.4} height={h * 0.4} />
        </g>
      )}
      {curtain?.style === 'side' && (
        <>
          <path d={rectPath(x, y, cw, h) + rectPath(x + w - cw, y, cw, h)} fill={curtain.color} />
          <rect x={x + cw - 0.4} y={y} width={0.4} height={h} fill="rgba(0,0,0,0.18)" />
        </>
      )}
      <path d={joineryPath(x, y, w, h)} fill="none" stroke={INK} strokeWidth={0.55} />
      {sill && <rect x={x - 1.2} y={y + h} width={w + 2.4} height={1} fill={SILL_LIT} />}
      {win.box && <rect x={x - 0.4} y={y + h + 0.2} width={w + 0.8} height={1.2} fill={GLOW_SLAB} />}
      {balcony && <LitBalcony win={win} balcony={balcony} />}
    </>
  );
}

// Fenêtre de cage d'escalier allumée (minuterie des halls) : lueur à deux paliers (en place, la cage n'a pas de
// définition partagée), vitre crème, reflet haut, menuiserie, appui éclairé.
export function StairWindow({ win }: { win: FacadeWindow }): ReactElement {
  const { x, y, w, h } = win;
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={glowPath(w, h, 1)} fill={GLOW} />
      <path d={glowPath(w, h, 0.55)} fill={GLOW} />
      <rect width={w} height={h} fill={STAIR} />
      <rect width={w} height={h * 0.3} fill="rgba(255,255,255,0.2)" />
      <path d={`${rectPath(0, 0, w, h)}M${w / 2} 0v${h}`} fill="none" stroke={INK} strokeWidth={0.55} />
      <rect x={-1.2} y={h} width={w + 2.4} height={1} fill={SILL_LIT} />
    </g>
  );
}

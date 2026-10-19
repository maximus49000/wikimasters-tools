import type { ReactElement, SVGProps } from 'react';
import type { CityEvent } from '../core/library/city/events';
import { FIREWORK_VARIANTS } from '../core/library/city/fireworks-show';

// Parties vectorielles des événements Ghibli (G5) qui restent des particules SVG, calculées en `t` par la couche : feux
// d'artifice en cellulo (gerbes à bord net, brins qui retombent, pointe blanche, étincelle secondaire, halo), traînée de
// condensation de l'avion de ligne, côté de la flèche de la grue. Chaque dessin est décrit par une liste de nœuds (`Art`) :
// rendue au montage (pose de l'instant du rendu), puis rejouée par la boucle de la ville (poseEventArt, à chaque image) sur
// le DOM : attributs réécrits quand ils changent, nœuds recréés seulement si la structure change (montée → gerbe → rien).
// Le conteneur (`ArtGroup`) reçoit ce contenu en balisage brut (dangerouslySetInnerHTML) : React ne réconcilie pas des
// enfants que la boucle a remplacés (un re-rendu après une montée devenue gerbe ferait sinon échouer removeChild) ; un
// re-rendu à un autre instant réécrit simplement le contenu, que la boucle reprend. Pas d'animation SMIL ; mouvement
// réduit : feux d'artifice en gerbe à 30 %, traînée à t = 0.

export type Art = { tag: 'g' | 'circle' | 'path' | 'line'; attrs: Record<string, string | number>; children?: Art[] };
const SVG_NS = 'http://www.w3.org/2000/svg';
const frac = (v: number): number => v - Math.floor(v);
const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();
const f2 = (v: number): string => (Math.round(v * 100) / 100).toString();
// Attribut DOM d'une clé React (strokeWidth → stroke-width ; data-* et noms simples inchangés).
const attrName = (k: string): string => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

// Balisage SVG d'une description (valeurs échappées ; parsé dans l'espace de noms SVG sous un élément SVG).
const esc = (v: string | number): string => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export const artHtml = (arts: readonly Art[]): string =>
  arts.map((a) => `<${a.tag}${Object.entries(a.attrs).map(([k, v]) => ` ${attrName(k)}="${esc(v)}"`).join('')}>${a.children ? artHtml(a.children) : ''}</${a.tag}>`).join('');
// Groupe dont le contenu appartient à la boucle (voir l'en-tête).
export function ArtGroup({ arts, ...attrs }: { arts: readonly Art[] } & SVGProps<SVGGElement>): ReactElement {
  return <g {...attrs} dangerouslySetInnerHTML={{ __html: artHtml(arts) }} />;
}

// Rejoue `arts` sur les enfants de `parent` : même structure (balises dans l'ordre) → attributs mis à jour, sinon enfants
// recréés. Les attributs disparus sont retirés.
export function syncArt(parent: Element, arts: readonly Art[]): void {
  const kids = parent.children;
  let same = kids.length === arts.length;
  for (let i = 0; same && i < arts.length; i++) if (kids[i]!.tagName !== arts[i]!.tag) same = false;
  if (!same) {
    parent.replaceChildren();
    for (const a of arts) parent.append(build(a));
    return;
  }
  for (let i = 0; i < arts.length; i++) {
    const el = kids[i]!;
    const a = arts[i]!;
    const keep = new Set<string>();
    for (const [k, v] of Object.entries(a.attrs)) {
      const name = attrName(k);
      keep.add(name);
      const s = String(v);
      if (el.getAttribute(name) !== s) el.setAttribute(name, s);
    }
    for (const name of el.getAttributeNames()) if (!keep.has(name)) el.removeAttribute(name);
    if (a.children) syncArt(el, a.children);
    else if (el.childElementCount) el.replaceChildren();
  }
}
function build(a: Art): Element {
  const el = document.createElementNS(SVG_NS, a.tag);
  for (const [k, v] of Object.entries(a.attrs)) el.setAttribute(attrName(k), String(v));
  for (const c of a.children ?? []) el.append(build(c));
  return el;
}

// ---------- Feux d'artifice (notes §2) : 5 fusées à cx = −120 + 60k, cy = 40 + (k%3)·20, période 6 s décalée de 1,2 s ;
// u < 13 % : montée de y 250 à cy (décélérée), point blanc, traînée ambrée, halo ; 13..62 % : gerbe à l'échelle s 0,2 → 1 sur
// le premier quart puis 1 → 1,15, opacité 0 → 1 en 5 % puis 1 → 0 sur les 60 % derniers, 12 brins (8 → 22) qui retombent
// (fall = 14·max(0, p − 0,3)), pointe blanche, étincelle secondaire après 15 %, halo r 13·s ; au-delà : rien. ----------
export const ROCKET_COLORS = ['#FF4F4F', '#F2C94C', '#4FD8FF', '#B04FFF', '#4FFF8A'] as const;
export const ROCKET_PERIOD_S = 6;
export const ROCKET_STAGGER_S = 1.2;
export const STILL_ROCKET_U = 0.3;
export const rocketU = (e: CityEvent, t: number, k: number, still: boolean): number => (still ? STILL_ROCKET_U : frac((t - e.start - k * ROCKET_STAGGER_S) / ROCKET_PERIOD_S));
const haloArt = (cx: number, cy: number, r: number, c: string, a: number): Art[] => [
  { tag: 'circle', attrs: { cx: f1(cx), cy: f1(cy), r: f1(r), fill: c, opacity: f2(a * 0.55) } },
  { tag: 'circle', attrs: { cx: f1(cx), cy: f1(cy), r: f1(r * 0.5), fill: c, opacity: f2(a) } },
];
// `shift` : couleurs décalées d'une salve du spectacle des jours de fête (`variant` de la salve) ; 0 pour les salves isolées.
export const rocketShift = (e: CityEvent): number => (e.key.startsWith('show-') ? Math.floor(e.variant * FIREWORK_VARIANTS) : 0);
export function rocketArt(k: number, u: number, shift = 0): Art[] {
  const col = ROCKET_COLORS[(k + shift) % ROCKET_COLORS.length]!;
  const cx = -120 + k * 60;
  const cy = 40 + (k % 3) * 20;
  if (u < 0.13) {
    const p = u / 0.13;
    const y = 250 + (cy - 250) * (1 - (1 - p) * (1 - p));
    return [
      ...haloArt(cx, y, 3, '#FFF3B0', 0.4),
      { tag: 'line', attrs: { x1: cx, y1: f1(y + 2), x2: cx - 1, y2: f1(y + 14), stroke: 'rgba(255,220,150,0.6)', strokeWidth: 1 } },
      { tag: 'circle', attrs: { 'data-rise': '', cx, cy: f1(y), r: 1.5, fill: 'rgba(255,255,255,0.9)' } },
    ];
  }
  if (u >= 0.62) return [];
  const p = (u - 0.13) / 0.49;
  const s = p < 0.25 ? 0.2 + 0.8 * (p / 0.25) : 1 + 0.15 * ((p - 0.25) / 0.75);
  const a = p < 0.05 ? p / 0.05 : 1 - Math.max(0, (p - 0.4) / 0.6);
  const fall = Math.max(0, p - 0.3) * 14;
  const children: Art[] = haloArt(0, 0, 13.2 * s, col, 0.25);
  for (let j = 0; j < 12; j++) {
    const an = (j * Math.PI) / 6;
    const x1 = Math.cos(an) * 8 * s;
    const y1 = Math.sin(an) * 8 * s;
    const x2 = Math.cos(an) * 22 * s;
    const y2 = Math.sin(an) * 22 * s + fall;
    children.push({ tag: 'path', attrs: { 'data-spark': '', d: `M${f1(x1)} ${f1(y1)} Q${f1((x1 + x2) / 2)} ${f1((y1 + y2) / 2 + fall * 0.4)} ${f1(x2)} ${f1(y2)}`, stroke: col, strokeWidth: 1.4, strokeLinecap: 'round', fill: 'none' } });
    children.push({ tag: 'circle', attrs: { cx: f1(x2), cy: f1(y2), r: 0.9, fill: '#FFFFFF' } });
    if (p > 0.15) children.push({ tag: 'circle', attrs: { cx: f1(x2 * 0.8), cy: f1(y2 * 0.8 + fall * 0.3), r: 0.6, fill: col } });
  }
  return [{ tag: 'g', attrs: { 'data-burst': '', transform: `translate(${cx} ${cy})`, opacity: f2(a) }, children }];
}
export function GhibliFireworks({ event: e, t, still }: { event: CityEvent; t: number; still: boolean }): ReactElement {
  return (
    <g data-fireworks-ghibli="">
      {ROCKET_COLORS.map((_, k) => (
        <ArtGroup key={k} data-rocket={k} arts={rocketArt(k, rocketU(e, t, k, still), rocketShift(e))} />
      ))}
    </g>
  );
}
function poseFireworks(node: Element, e: CityEvent, t: number, still: boolean): void {
  for (const g of node.querySelectorAll('[data-rocket]')) {
    const k = Number(g.getAttribute('data-rocket'));
    syncArt(g, rocketArt(k, rocketU(e, t, k, still), rocketShift(e)));
  }
}

// ---------- Traînée de condensation (notes §9) : 2 × 42 disques (toujours 84) nés derrière chaque réacteur (y 7 et 10), âge 0,32 s par
// cran, rayon 0,5 + 0,26·âge, opacité 0,55·(1 − âge/13,5) modulée (effilochage), dérive vers le haut et ondulation
// sin(1,7·âge + 0,8·t). Positions fixes, seules l'ordonnée et l'opacité bougent. `t` : secondes depuis le début de l'événement.
export function contrailArt(t: number): Art[] {
  const out: Art[] = [];
  for (const ey of [7, 10]) {
    for (let k = 0; k < 42; k++) {
      const age = k * 0.32;
      const wob = Math.sin(age * 1.7 + t * 0.8 + ey) * 0.4 * age;
      const a = 0.55 * Math.max(0, 1 - age / 13.5) * (0.8 + 0.2 * Math.sin(k * 2.3 + t * 2));
      // Disque presque invisible : opacité 0 plutôt que retiré (un nombre de disques constant évite à syncArt de tout recréer).
      out.push({ tag: 'circle', attrs: { cx: f1(-14 - k * 3.3 - ey * 0.4), cy: f1(ey + 0.6 - age * 0.12 + wob * 0.35), r: f2(0.5 + age * 0.26), fill: '#FFFFFF', opacity: a <= 0.01 ? 0 : f2(a) } });
    }
  }
  return out;
}
export const contrailT = (e: CityEvent, t: number, still: boolean): number => (still ? 0 : t - e.start);
export function Contrail({ event: e, t, still }: { event: CityEvent; t: number; still: boolean }): ReactElement {
  return <ArtGroup data-contrail="" arts={contrailArt(contrailT(e, t, still))} />;
}

// ---------- Grue : la flèche pivote d'un côté à l'autre comme le classique (`scale x = signe(cos(2πt/80))`, t depuis le début
// de l'événement) ; côté 1 en mouvement réduit. Deux images (une par côté), la boucle montre la bonne. ----------
export const craneSideAt = (e: CityEvent, t: number, still: boolean): 1 | -1 => (still || Math.cos((2 * Math.PI * (t - e.start)) / 80) >= 0 ? 1 : -1);
function poseCrane(node: Element, e: CityEvent, t: number, still: boolean): void {
  const side = craneSideAt(e, t, still);
  for (const g of node.querySelectorAll('[data-crane-side]')) {
    const want = Number(g.getAttribute('data-crane-side')) === side ? 'inline' : 'none';
    if (g.getAttribute('display') !== want) g.setAttribute('display', want);
  }
}

// Pose des parties vectorielles d'un nœud d'événement Ghibli à l'instant t (appelé par la boucle de la ville).
export function poseEventArt(node: Element, e: CityEvent, t: number, still: boolean): void {
  if (e.id === 'fireworks') poseFireworks(node, e, t, still);
  else if (e.id === 'plane') {
    const g = node.querySelector('[data-contrail]');
    if (g) syncArt(g, contrailArt(contrailT(e, t, still)));
  } else if (e.id === 'crane') poseCrane(node, e, t, still);
}

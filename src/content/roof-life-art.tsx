import type { ReactElement } from 'react';
import { anchorsOf, bakeFigure, INK_WIDTH, type Baked, type FigureKey } from '../core/library/figure/bake';
import { facingYaw } from '../core/library/figure/gait';
import { PHASES, type ArmPose, type Gait } from '../core/library/figure/skeleton';
import { shapeFromSignature } from '../core/library/figure/dress';
import { INK } from '../core/library/paint/cel';
import { amb } from './ghibli-window-art';
import { DARK_ALPHA, DARK_VEIL } from './window-life-art';

// Dessins des toits vivants (chantier « vie au-dessus de la rue », spec §5.2) : port en SVG de `paintCat`, `paintPigeon`
// (`flockPaint`), `paintSmoke` et `paintRoofer` de docs/superpowers/maquettes/vie-etages/src/07b-balcon-toit.js (couleurs de
// notes.md §Couleurs). Composants de présentation seuls, branchés par le calque des toits (tâche 10). Règle du calque
// (perfs Android) : un composant rend toujours les mêmes nœuds pour une pose donnée quelle que soit la phase ; seuls
// `transform`, `opacity` ou un `d` calculé changent ; pas de clip-path CSS, pas de SMIL ; `dir = -1` est un tracé propre au
// sens (coordonnées miroir), jamais une image retournée. 1 px de scène = 1 px de maquette : le chat fait 5 px de haut.
// Ambiance de nuit : chaque dessin la porte (pas de voile global au-dessus des calques) — le chat par sa variante `night`,
// le pigeon et le couvreur par le voile `dark` de window-life-art (`DARK_VEIL` à `DARK_ALPHA × dark`, composition = amb(c)).
// `phase` est en secondes de scène sauf pour le chat qui sort (`emerge` : avancement 0 → 1).
const CAT_DAY = '#8A6A4A';
const CAT_NIGHT = amb('#4A3E48');
const CAT_EYE = '#C8FF8A';
// Remontée du chat qui sort (px) : tout entier sous le zinc à l'avancement 0.
export const CAT_RISE = 5;
const PIGEON = '#8A8FA0';
const PIGEON_BELLY = '#B8BCC8';
const PIGEON_WING = '#686E84';
const SMOKE_DAY = 'rgb(235,235,242)';
const SMOKE_NIGHT = 'rgb(200,205,225)';
const HAMMER_HEAD = '#5A5A74';
const BUCKET = '#5A5A74';

const n = (v: number): number => Math.round(v * 100) / 100;
const sat = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const veil = (dark: number): number => n(DARK_ALPHA * sat(dark));
const on = (v: boolean): number => (v ? 1 : 0);
// Disque et ellipse tracés dans le même sens que les coques du pantin (aire signée positive en coordonnées brutes) : un voile
// qui les concatène garde un winding non nul là où ils se chevauchent (remplissage nonzero).
const ellipsePath = (cx: number, cy: number, rx: number, ry: number): string => `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 1 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 1 ${n(-2 * rx)} 0z`;
type Pt = readonly [number, number];
const tri = (a: Pt, b: Pt, c: Pt): string => `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(c[0])} ${n(c[1])}z`;
// Triangle tracé dans le même sens que les ellipses quel que soit le sens du dessin (aire signée positive).
const triCW = (a: Pt, b: Pt, c: Pt): string => ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) >= 0 ? tri(a, b, c) : tri(a, c, b));

// ───────────── chat ─────────────
// Origine aux pattes (x au milieu du corps, y au sol du terrasson), regarde vers `dir`. `emerge` : sort de la tabatière
// (phase 0 → 1 : monte de 5 px dans une fenêtre SVG qui le découpe à hauteur du zinc ; le calque le place à cx + 2,5 de la
// tabatière) ; `walk` : pattes en ciseaux, queue levée (phase en secondes, un pas tous les π/4 s) ; `sit` : contre la
// souche, queue enroulée qui bat (sin(phase / 2)). La nuit : pelage amb(#4A3E48) et yeux #C8FF8A (transparents le jour).
export function Cat({ pose, phase, night, dir }: { pose: 'emerge' | 'walk' | 'sit'; phase: number; night: boolean; dir: 1 | -1 }): ReactElement {
  const body = night ? CAT_NIGHT : CAT_DAY;
  const d = dir;
  if (pose === 'sit') {
    const hx = d * 0.4;
    const tail = `M${n(-d * 1.2)} -0.3Q${n(-d * 3.4)} ${n(-0.4 + Math.sin(phase / 2) * 0.4)} ${n(-d * 3.2)} -1.6`;
    return (
      <g data-roof-cat="sit">
        <path d={ellipsePath(0, -1.6, 1.6, 2.0) + ellipsePath(hx, -3.9, 1.25, 1.25)} fill={INK} />
        <path d={ellipsePath(0, -1.6, 1.25, 1.7) + ellipsePath(hx, -3.9, 0.95, 0.95)} fill={body} />
        <path d={tri([hx - 1.0, -4.4], [hx - 0.9, -5.6], [hx - 0.1, -4.7]) + tri([hx + 1.0, -4.4], [hx + 0.9, -5.6], [hx + 0.1, -4.7])} fill={INK} />
        <path data-cat-tail="" d={tail} fill="none" stroke={INK} strokeWidth={0.7} strokeLinecap="round" />
        <path data-cat-eye="" d={`M${n(hx - 0.7)} -4.1h0.4v0.4h-0.4zM${n(hx + 0.3)} -4.1h0.4v0.4h-0.4z`} fill={CAT_EYE} opacity={on(night)} />
      </g>
    );
  }
  // Marche (aussi la pose du chat qui sort : pattes droites, phase 0).
  const ph = pose === 'walk' ? phase * 4 : 0;
  const s = Math.sin(ph) * 0.9;
  const legs = ([[-1.2, s], [-0.6, -s], [0.9, -s], [1.5, s]] as const).map(([ox, sx]) => `M${n(ox * d)} -1.4L${n(ox * d + sx * d * 0.6)} 0`).join('');
  const hx = d * 2.4;
  const tail = `M${n(-d * 2.2)} -1.8Q${n(-d * 3.4)} -2.6 ${n(-d * 3.2 + Math.sin(ph / 3) * 0.4)} -4.2`;
  const cat = (
    <g data-roof-cat={pose}>
      <path data-cat-legs="" d={legs} fill="none" stroke={INK} strokeWidth={0.7} strokeLinecap="round" />
      <path d={ellipsePath(0, -1.6, 2.3, 1.05) + ellipsePath(hx, -2.3, 1.1, 1.1)} fill={INK} />
      <path d={ellipsePath(0, -1.6, 1.95, 0.75) + ellipsePath(hx, -2.3, 0.8, 0.8)} fill={body} />
      <path d={tri([d * 1.9, -2.9], [d * 1.8, -3.9], [d * 2.5, -3.1]) + tri([d * 3.1, -2.8], [d * 3.1, -3.8], [d * 2.5, -3.1])} fill={INK} />
      <path data-cat-tail="" d={tail} fill="none" stroke={INK} strokeWidth={0.7} strokeLinecap="round" />
      <path data-cat-eye="" d={`M${n(hx + d * 0.25 - 0.2)} -2.55h0.4v0.4h-0.4z`} fill={CAT_EYE} opacity={on(night)} />
    </g>
  );
  if (pose !== 'emerge') return cat;
  // Fenêtre SVG (overflow hidden, pas de clip-path) de 10 × 9,3 px au-dessus du zinc : le chat remonte dedans. À l'avancement
  // 0, il est entièrement sous le zinc (oreilles à −3,9, bout de la queue à −4,2 moins un demi-trait : remontée de 5 px, plus
  // basse que la ligne de coupe à +0,3) ; rien ne dépasse de la tabatière avant qu'il sorte.
  const rise = n((1 - smooth(sat(phase))) * CAT_RISE);
  return (
    <svg data-roof-cat-window="" x={-5} y={-9} width={10} height={9.3} viewBox="-5 -9 10 9.3" overflow="hidden">
      <g transform={`translate(0 ${rise})`}>{cat}</g>
    </svg>
  );
}

// ───────────── pigeon ─────────────
// Origine aux pattes, ≈ 4,4 px de long et 3,4 px de haut (la maquette, à 2,6 px, se lisait comme deux ronds reliés). Profil
// lisible à cette taille : corps en goutte gris-bleu #8A8FA0 (ventre #B8BCC8, aile #686E84, queue effilée vers l'arrière),
// tête ronde détachée sur un cou d'encre, bec et œil, deux pattes. `perch` : posé, bec vers `dir`, tête qui pointe par
// instants (sin(phase) > 0,8) ; `peck` : picore, la tête plonge devant (sin(6·phase)) ; `fly` : ailes pleines derrière le corps
// qui battent (sin(phase) × 1,8, phase ≈ 9 × secondes dans la maquette), tête devant, queue derrière. `dark` : voile de nuit sur le
// plumage (les traits d'encre restent) — un voile par pièce mobile, jamais un tracé concaténé dont le sens dépendrait de
// `dir` ou de la phase (remplissage nonzero).
export function Pigeon({ pose, phase, dir, dark = 0 }: { pose: 'perch' | 'peck' | 'fly'; phase: number; dir: 1 | -1; dark?: number }): ReactElement {
  const d = dir;
  const v = veil(dark);
  if (pose === 'fly') {
    const f = Math.sin(phase) * 1.8;
    // Deux ailes pleines derrière le corps, de l'épaule (±0,2, −0,3) au bout (±2,7, −f) : bord d'attaque bombé, bord de fuite
    // large à la base (corde lisible même ailes levées).
    const wing = (sx: number): string => `M${n(sx * 0.2)} -0.3Q${n(sx * 1.4)} ${n(-f * 0.55 - 0.6)} ${n(sx * 2.7)} ${n(-f)}Q${n(sx * 1.8)} ${n(-f * 0.25 + 0.5)} ${n(sx * 0.5)} 0.6z`;
    const wings = wing(1) + wing(-1);
    const hx = d * 1.4, hy = -0.2;
    const body = ellipsePath(0, 0, 1.25, 0.5) + ellipsePath(hx, hy, 0.45, 0.45);
    return (
      <g data-roof-pigeon="fly">
        <path d={triCW([-d * 0.9, -0.35], [-d * 2.3, -0.6], [-d * 2.3, 0.4])} fill={PIGEON_WING} stroke={INK} strokeWidth={0.4} strokeLinejoin="round" />
        <path data-pigeon-wings="" d={wings} fill={PIGEON_WING} stroke={INK} strokeWidth={0.35} strokeLinejoin="round" />
        <path data-dark-veil="" d={wings} fill={DARK_VEIL} opacity={v} />
        <path d={ellipsePath(0, 0, 1.55, 0.8) + ellipsePath(hx, hy, 0.72, 0.72)} fill={INK} />
        <path d={body} fill={PIGEON} />
        <path d={ellipsePath(d * 0.1, 0.12, 1.0, 0.28)} fill={PIGEON_BELLY} />
        <path data-dark-veil="" d={body} fill={DARK_VEIL} opacity={v} />
        <path d={triCW([hx + d * 0.35, hy - 0.2], [hx + d * 1.05, hy + 0.05], [hx + d * 0.35, hy + 0.25])} fill={INK} />
        <path d={ellipsePath(hx + d * 0.1, hy - 0.12, 0.14, 0.14)} fill={INK} />
      </g>
    );
  }
  // Tête : groupe translaté (picore : plonge de 0,6 devant et 1,1 vers le bas ; posé : pointe de 0,35 devant par instants).
  const bob = pose === 'peck' ? Math.max(0, Math.sin(phase * 6)) : 0;
  const peek = pose === 'perch' ? on(Math.sin(phase) > 0.8) : 0;
  const hx = d * 1.3, hy = -2.75;
  const body = ellipsePath(-d * 0.1, -1.65, 1.45, 1.1);
  const tail = triCW([-d * 1.1, -2.1], [-d * 2.3, -2.45], [-d * 1.3, -1.25]);
  const head = ellipsePath(hx, hy, 0.68, 0.68);
  return (
    <g data-roof-pigeon={pose}>
      <path data-pigeon-legs="" d={`M${n(d * 0.35)} -0.7L${n(d * 0.45)} 0l${n(d * 0.45)} 0M${n(-d * 0.35)} -0.7L${n(-d * 0.2)} 0l${n(d * 0.45)} 0`} fill="none" stroke={INK} strokeWidth={0.35} strokeLinecap="round" />
      <path d={ellipsePath(-d * 0.1, -1.65, 1.75, 1.4) + triCW([-d * 1.0, -2.45], [-d * 2.65, -2.75], [-d * 1.2, -1.0])} fill={INK} />
      <path d={tail} fill={PIGEON_WING} />
      <path d={body} fill={PIGEON} />
      <path d={ellipsePath(d * 0.05, -1.15, 1.05, 0.55)} fill={PIGEON_BELLY} />
      <path d={ellipsePath(-d * 0.45, -1.95, 1.0, 0.5)} fill={PIGEON_WING} />
      <path data-dark-veil="" d={body} fill={DARK_VEIL} opacity={v} />
      <g data-pigeon-head="" transform={`translate(${n(d * (0.6 * bob + 0.35 * peek))} ${n(1.1 * bob + 0.15 * peek)})`}>
        <path d={ellipsePath(hx, hy, 0.95, 0.95) + ellipsePath(d * 0.75, -2.3, 0.75, 0.7)} fill={INK} />
        <path d={head} fill={PIGEON} />
        <path data-dark-veil="" d={head} fill={DARK_VEIL} opacity={v} />
        <path d={triCW([hx + d * 0.55, hy - 0.2], [hx + d * 1.25, hy + 0.05], [hx + d * 0.55, hy + 0.25])} fill={INK} />
        <path d={ellipsePath(hx + d * 0.2, hy - 0.15, 0.17, 0.17)} fill={INK} />
      </g>
    </g>
  );
}

// ───────────── fumée ─────────────
// Origine au sommet de la souche (milieu). Six bouffées d'âge décalé (cycle 14 s) : chacune est un disque unitaire placé
// par transform (monte de 0,9 px/s, dérive de 0,5 × `wind` px/s, ondule), grossit (rayon 0,9 + 0,22 × âge) et s'efface
// (opacité 0,5 → 0). Couleur rgb(235,235,242) le jour, rgb(200,205,225) la nuit.
export function Smoke({ phase, night, wind }: { phase: number; night: boolean; wind: number }): ReactElement {
  const fill = night ? SMOKE_NIGHT : SMOKE_DAY;
  return (
    <g data-roof-smoke="">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const age = (((phase + i * 2.3) % 14) + 14) % 14;
        const x = age * 0.5 * wind + Math.sin(age + i) * 0.6;
        const y = -2 - age * 0.9;
        return <circle key={i} data-puff="" r={1} fill={fill} transform={`translate(${n(x)} ${n(y)}) scale(${n(0.9 + age * 0.22)})`} opacity={n(0.5 * (1 - age / 14))} />;
      })}
    </g>
  );
}

// ───────────── couvreur ─────────────
// Pantin du moteur `figure/` (aucune seconde cinématique) cuit en tracés SVG : à genoux (`crouch`, penché 1) qui martèle le
// zinc — marteau levé (`hammer-1`) puis coup porté (`hammer-2`, 40 % du cycle de 2π/5 s comme hit = max(0, sin(5 s)) de la
// maquette) —, ou qui marche sur le terrasson (`walk`, un cycle par 0,9 s, seau à la main gauche). 11 px de haut (maquette),
// origine aux pieds. Tenue : chemise et casque jaunes #F6C62E, pantalon #2E3A4A, peau #D9A070, cheveux #E8E8E8 ; seau
// d'outils posé à 4,5 px derrière lui quand il est à genoux. `dark` : voile de nuit sur le pantin et ses objets.
// Les tracés sont cuits une fois par (pose, phase quantifiée, sens) et mémoïsés : un rendu n'écrit que des `d` connus.
const ROOFER_H = 11;
const ROOFER_UNITS = 40;
const ROOFER_SIG = 'cap.long.pants.none.n.n';
const ROOFER_COL: Record<string, string> = { skin: '#D9A070', top: '#F6C62E', bottom: '#2E3A4A', hair: '#E8E8E8', hat: '#F6C62E', shoe: '#3A2A24' };
const WALK_CYCLE_S = 0.9;
const HAMMER_HZ = 5;
type RooferFrame = { baked: Baked; hand: readonly [number, number]; handL: readonly [number, number] };
const rooferCache = new Map<string, RooferFrame>();
function rooferFrame(gait: Gait, phase: number, arms: ArmPose, dir: 1 | -1): RooferFrame {
  const key: FigureKey = { sig: ROOFER_SIG, yaw: facingYaw(dir), gait, phase, head: 0, arms, lean: gait === 'crouch' ? 1 : 0 };
  const ks = `${gait}|${phase}|${arms}|${dir}`;
  let f = rooferCache.get(ks);
  if (!f) {
    const an = anchorsOf(key);
    f = { baked: bakeFigure(shapeFromSignature(ROOFER_SIG), key), hand: an.handR, handL: an.handL };
    rooferCache.set(ks, f);
  }
  return f;
}
const mixHex = (c: string, dk: string, k: number): string => {
  const a = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(dk.slice(i, i + 2), 16));
  return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * k).toString(16).padStart(2, '0')).join('')}`;
};
// Ombre d'une pièce : vers le violet froid de cel.ts (shade 0,3) puis légèrement assombrie.
const shadeOf = (c: string): string => mixHex(mixHex(c, '#5A4A9C', 0.3), '#000000', 0.05);

export function Roofer({ phase, pose, dir, dark = 0 }: { phase: number; pose: 'kneel' | 'walk'; dir: 1 | -1; dark?: number }): ReactElement {
  const kneel = pose === 'kneel';
  const strike = kneel && Math.sin(phase * HAMMER_HZ) > 0.5;
  const walkPhase = ((Math.floor((phase / WALK_CYCLE_S) * PHASES) % PHASES) + PHASES) % PHASES;
  const fr = kneel ? rooferFrame('crouch', 0, strike ? 'hammer-2' : 'hammer-1', dir) : rooferFrame('walk', walkPhase, 'carry', dir);
  const k = n(ROOFER_H / ROOFER_UNITS);
  const [hx, hy] = fr.hand;
  // Marteau (unités du pantin) : manche depuis la main, tête au bout ; levé vers l'avant-haut, coup vers le zinc.
  const tip: readonly [number, number] = kneel ? (strike ? [hx + dir * 5.5, hy + 2.5] : [hx + dir * 4.5, hy - 4]) : [hx + dir * 1.5, hy + 4];
  const hammer = `M${n(hx)} ${n(hy)}L${n(tip[0])} ${n(tip[1])}`;
  const head = `M${n(tip[0] - 1.6)} ${n(tip[1] - 1)}h3.2v2h-3.2z`;
  // Seau : posé au sol derrière le couvreur à genoux, tenu à la main gauche en marche.
  const [lx, ly] = fr.handL;
  const bucket = kneel ? `M${n(-dir * 4.5 / k - 4.5)} -8h9v8h-9z` : `M${n(lx - 3.5)} ${n(ly)}h7v7h-7z`;
  const veilPath = fr.baked.groups.map((g) => g.ink).join('') + head + bucket;
  return (
    <g data-roof-roofer={pose} transform={`scale(${k})`}>
      <path d={bucket} fill={BUCKET} stroke={INK} strokeWidth={INK_WIDTH * 1.5} strokeLinejoin="round" />
      {fr.baked.groups.map((g, gi) => (
        <g key={gi}>
          <path d={g.ink} fill={INK} stroke={INK} strokeWidth={INK_WIDTH * 2} strokeLinejoin="round" />
          {g.parts.map((p, pi) => {
            const c = ROOFER_COL[p.slot] ?? INK;
            return (
              <g key={pi}>
                <path d={p.shade} fill={shadeOf(c)} />
                {p.lit && <path d={p.lit} fill={c} />}
              </g>
            );
          })}
        </g>
      ))}
      {fr.baked.eyes.map(([x, y], i) => <ellipse key={i} rx={0.5} ry={0.75} fill={INK} transform={`translate(${x} ${y})`} />)}
      <path data-hammer="" d={hammer} fill="none" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      <path d={head} fill={HAMMER_HEAD} stroke={INK} strokeWidth={INK_WIDTH} strokeLinejoin="round" />
      <path data-dark-veil="" d={veilPath} fill={DARK_VEIL} opacity={veil(dark)} />
    </g>
  );
}

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
const PIGEON = '#8A8FA0';
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
const tri = (a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]): string => `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(c[0])} ${n(c[1])}z`;

// ───────────── chat ─────────────
// Origine aux pattes (x au milieu du corps, y au sol du terrasson), regarde vers `dir`. `emerge` : sort de la tabatière
// (phase 0 → 1 : monte de 3,2 px dans une fenêtre SVG qui le découpe à hauteur du zinc ; le calque le place à cx + 2,5 de la
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
  // Fenêtre SVG (overflow hidden, pas de clip-path) de 10 × 9,3 px au-dessus du zinc : le chat remonte dedans.
  const rise = n((1 - smooth(sat(phase))) * 3.2);
  return (
    <svg data-roof-cat-window="" x={-5} y={-9} width={10} height={9.3} viewBox="-5 -9 10 9.3" overflow="hidden">
      <g transform={`translate(0 ${rise})`}>{cat}</g>
    </svg>
  );
}

// ───────────── pigeon ─────────────
// Origine aux pattes. `perch` : posé, bec vers `dir`, tête qui pointe par instants (sin(phase) > 0,8) ; `peck` : picore,
// la tête plonge devant (sin(6·phase)) ; `fly` : ailes qui battent (sin(phase) × 2,2, phase ≈ 9 × secondes dans la
// maquette), sans tête visible. `dark` : voile de nuit sur le plumage #8A8FA0 (les traits d'encre restent).
export function Pigeon({ pose, phase, dir, dark = 0 }: { pose: 'perch' | 'peck' | 'fly'; phase: number; dir: 1 | -1; dark?: number }): ReactElement {
  if (pose === 'fly') {
    const f = Math.sin(phase) * 2.2;
    return (
      <g data-roof-pigeon="fly">
        <path data-pigeon-wings="" d={`M-2.4 ${n(-f)}Q-1.2 ${n(-f * 0.3)} 0 0Q1.2 ${n(-f * 0.3)} 2.4 ${n(-f)}`} fill="none" stroke={INK} strokeWidth={0.8} strokeLinecap="round" />
        <path d={ellipsePath(0, 0, 1.1, 0.6)} fill={INK} />
      </g>
    );
  }
  const d = dir;
  // Tête : groupe translaté (picore : plonge de 0,5 devant et 0,9 vers le bas ; posé : immobile).
  const bob = pose === 'peck' ? Math.max(0, Math.sin(phase * 6)) : 0;
  const peek = pose === 'perch' ? on(Math.sin(phase) > 0.8) : 1;
  return (
    <g data-roof-pigeon={pose}>
      <path d={ellipsePath(0, -1.1, 1.3, 0.95)} fill={INK} />
      <g data-pigeon-head="" transform={`translate(${n(d * 0.5 * bob)} ${n(0.9 * bob)})`}>
        <path d={ellipsePath(d * 1.1, -1.9, 0.6, 0.6)} fill={INK} />
        <path d={`M${n(d * 1.5 - 0.25)} -1.95h0.5v0.3h-0.5z`} fill={INK} opacity={peek} />
      </g>
      <path d={ellipsePath(0, -1.1, 1.0, 0.7)} fill={PIGEON} />
      <path data-dark-veil="" d={ellipsePath(0, -1.1, 1.0, 0.7)} fill={DARK_VEIL} opacity={veil(dark)} />
      <path d={`M${n(-d * 2.0 - 0.5)} -1.2h1v0.45h-1z`} fill={INK} />
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

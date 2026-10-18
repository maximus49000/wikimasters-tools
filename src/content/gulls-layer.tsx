import { useContext, useId, useMemo, useRef, type ReactElement } from 'react';
import { PERCH_K, flocksAt, gullMinutes, gullsOpen, type GullPerch } from '../core/library/city/gulls';
import { hillChimneyTop, visibleHillHouses } from '../core/library/city/santa';
import { cityPaintPlan, type HillHouse } from '../core/library/paint/city-plan';
import { PROPS } from '../core/library/paint/props/index';
import type { Sky } from '../core/library/sky';
import { PropContext, paintProp, propKey, type PropSpec } from './prop/prop-host';
import { useWallClockLoop } from './use-wallclock-loop';

// Calque des mouettes (G5, tâche 14) : les volées du moteur pur `flocksAt` (city/gulls.ts) en images peintes `gull` du
// registre d'accessoires, Ghibli seulement (le décor classique n'a jamais dessiné les mouettes figées du plan peint, qui était
// propre à Ghibli : rien ne change en classique). Un réservoir fixe de nœuds (POOL oiseaux au plus à la fois) : la boucle de
// l'horloge murale pose chaque oiseau (transform `translate(x y) scale(s)`, opacité 1 − far pour la pâleur du lointain) et
// choisit l'image de sa pose (aile, pose du battement, sens, lumière au 1/8 de jour) directement sur l'<image>, sans re-rendu ;
// une pose pas encore cuite est demandée au registre et l'image précédente reste en attendant. Derrière les immeubles (masque
// de leurs silhouettes, comme le père Noël sur la colline), sous les engins du ciel. Les oiseaux se posent sur les cheminées
// des maisons visibles de la colline (rangs 1 et 2, même cheminée que `paintHillHouse`). Mouvement réduit : les oiseaux de
// l'instant `frozenT`, pose 0 du battement, immobiles.
export const GULL_POOL = 16;
const GATE_KEEP_S = 4 * 3600;

// Masque des façades (silhouettes de la rue devant la colline) : débord de 2 px de chaque côté, 9 px au-dessus du toit pour
// ce que le peintre fait dépasser (antennes).
const MASK_PAD_X = 2;
const MASK_PAD_TOP = 9;
type FacadeBox = { x: number; w: number; h: number };
const maskTop = (f: FacadeBox, ground: number): number => ground - f.h - MASK_PAD_TOP;

// Oiseau posé entier hors du masque des façades : son image (cadre `gull` × PERCH_K·s, centrée 1,5·sP au-dessus de la
// brique, comme `lander`) ne touche aucune silhouette de la rue.
function perchVisible(top: { x: number; y: number }, s: number, facades: readonly FacadeBox[], ground: number): boolean {
  const sP = PERCH_K * s;
  const [bx, by, bw, bh] = PROPS.gull!.box({ wing: 'perched' });
  const yP = top.y - 1.5 * sP;
  const x0 = top.x + bx * sP;
  const x1 = top.x + (bx + bw) * sP;
  const y1 = yP + (by + bh) * sP;
  return facades.every((f) => x1 <= f.x - MASK_PAD_X || x0 >= f.x + f.w + MASK_PAD_X || y1 <= maskTop(f, ground));
}

// Cheminées où se poser : maisons des rangs 1 et 2 (le rang 0 est trop loin) dont le toit se voit, entières dans la scène,
// et dont l'oiseau posé ne serait pas caché par le masque des façades (cheminée juste au-dessus d'un immeuble de la rue).
export function gullPerches(houses: readonly HillHouse[], facades: readonly FacadeBox[], ground: number, width: number): GullPerch[] {
  const out: GullPerch[] = [];
  for (const h of visibleHillHouses(houses, facades, ground)) {
    if (h.row === 0 || h.x < 0 || h.x + h.w > width) continue;
    const top = hillChimneyTop(h);
    if (top && perchVisible(top, h.s, facades, ground)) out.push({ x: top.x, y: top.y, s: h.s, haze: h.haze });
  }
  return out;
}

type Props = { width: number; height: number; seed: number; sky: Sky; facades: readonly { x: number; w: number; h: number }[]; ground: number; minutes: number; rain: number; still: boolean; frozenT: number; ghibli?: boolean };

export function GullsLayer({ width, height, seed, sky, facades, ground, minutes, rain, still, frozenT, ghibli = false }: Props): ReactElement | null {
  const props = useContext(PropContext);
  const root = useRef<SVGGElement | null>(null);
  const maskId = `gm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const perches = useMemo(() => (ghibli ? gullPerches(cityPaintPlan(width, height, seed).hill.houses, facades, ground, width) : []), [ghibli, width, height, seed, facades, ground]);
  const day = sky.daylight;
  // Sens de l'image montrée par nœud (gardé d'un rendu à l'autre : au changement de palier de lumière, l'image précédente
  // reste pendant la cuisson) ; une image de l'autre sens n'est jamais gardée en attendant.
  const shownDir = useRef<(1 | -1 | 0)[]>(new Array<1 | -1 | 0>(GULL_POOL).fill(0));
  // Intervalles de mauvais temps (nuit, forte pluie) vus par ce calque, passés à `flocksAt` (`closed`) : les volées en vol
  // finissent leur traversée, rien ne surgit au retour du beau temps, et une fermeture courte n'efface pas à la réouverture
  // une volée partie avant. État au montage : le temps du moment, « depuis toujours ». Les intervalles finis depuis plus de
  // GATE_KEEP_S (bien au-delà de la plus longue traversée) sont oubliés.
  const gate = useRef<{ open: boolean | null; closed: [number, number][] }>({ open: null, closed: [] });
  // Heure de la scène vue par les mouettes (avance avec l'horloge murale même en heure fixe) : voir `gullMinutes`.
  const clock = useRef<{ m: number; base: number } | null>(null);
  // `run` courant : la fin d'une cuisson rappelle toujours le dernier (jamais un ancien contexte qui réécrirait `gate`).
  const current = useRef<(now: number) => void>(() => undefined);
  // Pose cuite : re-pose tout de suite (sans attendre l'image suivante ; seule pose en mouvement réduit). Fonction stable :
  // le registre ne la garde qu'une fois par clé.
  const again = useRef((): void => current.current(Date.now() / 1000)).current;
  const place = useMemo(() => {
    const run = (now: number): void => {
      const el = root.current;
      if (!el || !ghibli) return;
      const t = still ? frozenT : now;
      const open = gullsOpen({ daylight: day, rain });
      const g = gate.current;
      if (g.open === null) g.closed = open ? [] : [[-Infinity, Infinity]];
      else if (g.open && !open) g.closed.push([t, Infinity]);
      else if (!g.open && open && g.closed.length > 0) g.closed[g.closed.length - 1]![1] = t;
      g.open = open;
      g.closed = g.closed.filter(([, b]) => b > t - GATE_KEEP_S);
      const c = gullMinutes(clock.current, minutes, t);
      clock.current = c.clock;
      // Mouvement réduit : rien ne bouge, le temps s'applique tel quel (pas de traversée à finir).
      const poses = flocksAt(t, seed, width, height, { minutes: c.minutes, daylight: day, rain, closed: still ? undefined : g.closed }, perches);
      const dirs = shownDir.current;
      const nodes = el.querySelectorAll<SVGGElement>('[data-gull]');
      nodes.forEach((g, i) => {
        const p = poses[i];
        const img = g.firstElementChild;
        if (!p || !img || !props) {
          g.setAttribute('display', 'none');
          return;
        }
        const spec: PropSpec = { id: 'gull', args: { wing: p.wing }, day, dir: p.dir, frame: still ? 0 : p.flap };
        const key = propKey(spec);
        const url = props.get(key);
        if (url === null) props.want(key, () => paintProp(spec), again);
        if (url !== null) {
          const [bx, by, bw, bh] = PROPS.gull!.box(spec.args!);
          img.setAttribute('href', url);
          img.setAttribute('x', String(p.dir === -1 ? -(bx + bw) : bx));
          img.setAttribute('y', String(by));
          img.setAttribute('width', String(bw));
          img.setAttribute('height', String(bh));
          dirs[i] = p.dir;
        }
        if (dirs[i] !== p.dir) {
          g.setAttribute('display', 'none');
          return;
        }
        g.setAttribute('display', 'inline');
        g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.s.toFixed(3)})`);
        g.setAttribute('opacity', (1 - p.far).toFixed(2));
      });
    };
    current.current = run;
    return run;
  }, [ghibli, still, frozenT, seed, width, height, minutes, day, rain, perches, props, again]);
  useWallClockLoop(place, [place]);

  if (!ghibli) return null;
  return (
    <>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <rect x={0} y={0} width={width} height={height} fill="#fff" />
          {/* Silhouettes avec ce que le peintre fait dépasser (antenne, débords), comme le masque du père Noël. */}
          {facades.map((b, i) => (
            <rect key={i} x={b.x - MASK_PAD_X} y={maskTop(b, ground)} width={b.w + 2 * MASK_PAD_X} height={b.h + MASK_PAD_TOP + 4} fill="#000" />
          ))}
        </mask>
      </defs>
      <g data-gulls="" ref={root} mask={`url(#${maskId})`}>
        {Array.from({ length: GULL_POOL }, (_, i) => (
          <g key={i} data-gull={i} display="none">
            <image preserveAspectRatio="none" />
          </g>
        ))}
      </g>
    </>
  );
}

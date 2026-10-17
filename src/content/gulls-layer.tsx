import { useContext, useId, useMemo, useRef, type ReactElement } from 'react';
import { flocksAt, type GullPerch } from '../core/library/city/gulls';
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
const noop = (): void => undefined;

// Cheminées où se poser : maisons des rangs 1 et 2 (le rang 0 est trop loin) dont le toit se voit, entières dans la scène.
export function gullPerches(houses: readonly HillHouse[], facades: readonly { x: number; w: number; h: number }[], ground: number, width: number): GullPerch[] {
  const out: GullPerch[] = [];
  for (const h of visibleHillHouses(houses, facades, ground)) {
    if (h.row === 0 || h.x < 0 || h.x + h.w > width) continue;
    const top = hillChimneyTop(h);
    if (top) out.push({ x: top.x, y: top.y, s: h.s, haze: h.haze });
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
  const place = useMemo(() => {
    // Sens de l'image montrée par nœud : une image de l'autre sens n'est jamais gardée en attendant.
    const shownDir: (1 | -1 | 0)[] = new Array<1 | -1 | 0>(GULL_POOL).fill(0);
    const run = (now: number): void => {
      const el = root.current;
      if (!el || !ghibli) return;
      const t = still ? frozenT : now;
      const poses = flocksAt(t, seed, width, height, { minutes, daylight: day, rain }, perches);
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
        if (url === null) props.want(key, () => paintProp(spec), still ? () => run(now) : noop);
        if (url !== null) {
          const [bx, by, bw, bh] = PROPS.gull!.box(spec.args!);
          img.setAttribute('href', url);
          img.setAttribute('x', String(p.dir === -1 ? -(bx + bw) : bx));
          img.setAttribute('y', String(by));
          img.setAttribute('width', String(bw));
          img.setAttribute('height', String(bh));
          shownDir[i] = p.dir;
        }
        if (shownDir[i] !== p.dir) {
          g.setAttribute('display', 'none');
          return;
        }
        g.setAttribute('display', 'inline');
        g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.s.toFixed(3)})`);
        g.setAttribute('opacity', (1 - p.far).toFixed(2));
      });
    };
    return run;
  }, [ghibli, still, frozenT, seed, width, height, minutes, day, rain, perches, props]);
  useWallClockLoop(place, [place]);

  if (!ghibli) return null;
  return (
    <>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <rect x={0} y={0} width={width} height={height} fill="#fff" />
          {/* Silhouettes avec ce que le peintre fait dépasser (antenne, débords), comme le masque du père Noël. */}
          {facades.map((b, i) => (
            <rect key={i} x={b.x - 2} y={ground - b.h - 9} width={b.w + 4} height={b.h + 13} fill="#000" />
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

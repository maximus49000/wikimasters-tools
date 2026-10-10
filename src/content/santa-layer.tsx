import { useMemo, useRef, useState, type ReactElement } from 'react';
import type { Facade } from '../core/library/city/facades';
import { SANTA_PERIOD_S, santaOn, santaPassFor, santaPoseAt, santaRoof, type SantaPose } from '../core/library/city/santa';
import type { Sky } from '../core/library/sky';
import { SantaSprite } from './santa-sprite';
import { useWallClockLoop } from './use-wallclock-loop';

// Calque du père Noël (vague 1b-ii-a). Le moteur (`city/santa.ts`) est pur : ici on lit l'horloge murale à chaque image,
// on pose le traîneau avec un `transform` sans re-rendu, et on ne re-rend que lorsque la tranche, le personnage ou la fenêtre
// allumée changent. Mouvement réduit : pas de boucle, seulement le traîneau posé sur son toit pendant la tranche de `frozenT`
// (si elle livre sur un toit), sinon rien.
type Props = { width: number; height: number; seed: number; sky: Sky; facades: Facade[]; ground: number; fests: readonly string[]; daylight: number; still: boolean; frozenT: number };
type View = { tranche: number; santa: SantaPose['santa']; lit: boolean; landed: boolean };

export function SantaLayer({ width, height, seed, sky, facades, ground, fests, daylight, still, frozenT }: Props): ReactElement | null {
  const on = santaOn(fests, daylight);
  const g = useRef<SVGGElement | null>(null);
  const trancheAt = (t: number): number => Math.floor(t / SANTA_PERIOD_S);
  const [view, setView] = useState<View>(() => ({ tranche: trancheAt(still ? frozenT : Date.now() / 1000), santa: 'aboard', lit: false, landed: false }));
  // Passage et toit de la tranche affichée (seule une livraison cherche un toit).
  const pass = useMemo(() => santaPassFor(view.tranche, seed), [view.tranche, seed]);
  const roof = useMemo(() => (pass.deliver ? santaRoof(pass, facades, ground, width) : null), [pass, facades, ground, width]);
  const state = useRef({ pass, roof });
  state.current = { pass, roof };

  const place = useMemo(
    () => (now: number): void => {
      const el = g.current;
      if (!el || !on) return;
      const t = still ? frozenT : now;
      const tranche = trancheAt(t);
      // La tranche change : on se re-rend (nouveau passage, nouveau toit) et la pose suivante sera juste.
      const cur = state.current;
      if (tranche !== cur.pass.tranche) {
        setView((v) => (v.tranche === tranche ? v : { ...v, tranche }));
        el.setAttribute('display', 'none');
        return;
      }
      // Mouvement réduit : le traîneau posé sur son toit, ou rien.
      const pose: SantaPose | null = still
        ? cur.pass.deliver && cur.roof
          ? { x: cur.roof.cx, y: cur.roof.y, dir: cur.pass.dir, landed: true, santa: 'aboard', windowLit: false }
          : null
        : santaPoseAt(cur.pass, cur.roof, t, width, height);
      if (!pose) {
        el.setAttribute('display', 'none');
        return;
      }
      el.setAttribute('transform', `translate(${pose.x.toFixed(1)} ${pose.y.toFixed(1)}) scale(${pose.dir} 1)`);
      el.setAttribute('display', 'inline');
      setView((v) => (v.santa === pose.santa && v.lit === pose.windowLit && v.landed === pose.landed ? v : { ...v, santa: pose.santa, lit: pose.windowLit, landed: pose.landed }));
    },
    [on, still, frozenT, width, height],
  );
  useWallClockLoop(place, [place, pass, roof]);

  if (!on) return null;
  return (
    <g data-santa="">
      {view.lit && roof?.lamp && <rect data-santa-window="" x={roof.lamp.x} y={roof.lamp.y} width={5} height={7} fill="#FFD36B" />}
      <g ref={g} display="none">
        <SantaSprite sky={sky} still={still} santa={view.santa} lit landed={view.landed} />
      </g>
    </g>
  );
}

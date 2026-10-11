import { useMemo, useRef, useState, type ReactElement } from 'react';
import type { Facade } from '../core/library/city/facades';
import type { Outfit } from '../core/library/city/people';
import { SANTA_PERIOD_S, SANTA_WINDOW_S, santaOn, santaPassFor, santaPoseAt, santaRoof, santaStepAt, type SantaPose, type SantaStep } from '../core/library/city/santa';
import { phaseIndexOf } from '../core/library/figure/gait';
import type { Sky } from '../core/library/sky';
import { tone } from './city-sprites';
import { useFigureRegistry } from './figure/figure-host';
import { GhibliFigure, poseFigure, type PoseIn } from './figure/ghibli-figure';
import { ClassicSantaWalker, SantaSack, SantaSprite } from './santa-sprite';
import { useWallClockLoop } from './use-wallclock-loop';

// Ghibli (G3b) : pantin en tenue rouge (haut, bas et bonnet), hotte tenue des deux mains ; pas de barbe (le pantin n'en a
// pas encore). Échelle du pantin dans le repère du traîneau : à peu près la taille du dessin classique à pied.
export const SANTA_OUTFIT: Outfit = {
  skin: '#F0C8A0',
  hair: 'beanie',
  hairColor: '#E8E8E8',
  hatColor: '#C0302B',
  top: 'coat',
  topColor: '#C0302B',
  bottom: 'pants',
  bottomColor: '#C0302B',
  accessory: 'none',
  accessoryColor: '#C0302B',
};
export const SANTA_K = 0.7;
const mod16 = (y: number): number => ((y % 16) + 16) % 16;
// Pose du pantin : orientation du script retournée avec le traîneau (le pantin n'est jamais en miroir), pas réglés sur le
// chemin parcouru ; debout en mouvement réduit.
export const santaFigurePose = (s: SantaStep, dir: 1 | -1, still: boolean): PoseIn => ({
  yaw: dir > 0 ? s.yaw : mod16(8 - s.yaw),
  gait: still || s.gait === 'stand' ? 'stand' : s.gait,
  phase: still || s.gait === 'stand' ? 0 : phaseIndexOf(s.dist / SANTA_K),
  head: 0,
  arms: 'carry',
});
// Nœud du personnage (repère du traîneau) : le pantin annule le retournement du traîneau.
const walkerTransform = (s: SantaStep, dir: 1 | -1, ghibli: boolean): string =>
  `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})${ghibli ? ` scale(${(dir * SANTA_K).toFixed(3)} ${SANTA_K.toFixed(3)})` : ''}`;

// Calque du père Noël (vague 1b-ii-a). Le moteur (`city/santa.ts`) est pur : ici on lit l'horloge murale à chaque image,
// on pose le traîneau avec un `transform` sans re-rendu, et on ne re-rend que lorsque la tranche, le personnage ou la fenêtre
// allumée changent. Mouvement réduit : pas de boucle, seulement le traîneau posé sur son toit pendant la tranche de `frozenT`
// (si elle livre sur un toit), sinon rien. Le personnage suit `santaStepAt` (même chemin dans les deux styles) : la boucle
// réécrit son transform (et sa pose en Ghibli) à chaque image ; un <svg> imbriqué (sans id ; viewBox = cadre, donc repère du
// traîneau à l'échelle 1 et coupe à y = 0) le rogne au niveau du toit quand il descend dans la cheminée, au lieu de le
// faire apparaître ou disparaître sur place.
type Props = { width: number; height: number; seed: number; sky: Sky; facades: Facade[]; ground: number; fests: readonly string[]; daylight: number; still: boolean; frozenT: number; ghibli?: boolean };
type View = { tranche: number; santa: SantaPose['santa']; lit: boolean; landed: boolean };

export function SantaLayer({ width, height, seed, sky, facades, ground, fests, daylight, still, frozenT, ghibli = false }: Props): ReactElement | null {
  const on = santaOn(fests, daylight);
  const g = useRef<SVGGElement | null>(null);
  const walker = useRef<SVGGElement | null>(null);
  const figures = useFigureRegistry();
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
      // Mouvement réduit : assis à sa place (le traîneau n'est montré que posé, à bord).
      const step = santaStepAt(cur.pass, cur.roof, still ? cur.pass.start + 0.27 * SANTA_WINDOW_S : t);
      const w = walker.current;
      if (step && w) {
        w.setAttribute('transform', walkerTransform(step, cur.pass.dir, ghibli));
        if (ghibli) poseFigure(figures, w.querySelector('[data-figure]'), santaFigurePose(step, cur.pass.dir, still));
      }
      setView((v) => (v.santa === pose.santa && v.lit === pose.windowLit && v.landed === pose.landed ? v : { ...v, santa: pose.santa, lit: pose.windowLit, landed: pose.landed }));
    },
    [on, still, frozenT, width, height, ghibli, figures],
  );
  useWallClockLoop(place, [place, pass, roof]);

  if (!on) return null;
  // Personnage au rendu : même calcul que la boucle à l'instant du rendu (re-rendu à chaque changement d'état) ; à sa place
  // hors fenêtre (traîneau caché) et en mouvement réduit.
  const seatT = pass.start + 0.27 * SANTA_WINDOW_S;
  const st = santaStepAt(pass, roof, still ? seatT : Date.now() / 1000) ?? santaStepAt(pass, roof, seatT)!;
  const shown = ghibli ? view.santa !== 'hidden' : view.santa === 'walking';
  const figure =
    shown ? (
      <svg data-santa-clip="" x={-200} y={-200} width={400} height={200} viewBox="-200 -200 400 200" overflow="hidden">
        <g ref={walker} data-santa-figure="" data-santa-where={view.santa} transform={walkerTransform(st, pass.dir, ghibli)}>
          {ghibli ? (
            <GhibliFigure
              outfit={SANTA_OUTFIT}
              sky={sky}
              rainy={false}
              umbrella={false}
              initial={santaFigurePose(st, pass.dir, still)}
              held={[{ anchor: 'hands', node: <g transform="translate(0 9) scale(1.3)"><SantaSack t={(c) => tone(c, sky)} /></g> }]}
            />
          ) : (
            <ClassicSantaWalker sky={sky} />
          )}
        </g>
      </svg>
    ) : null;
  return (
    <g data-santa="">
      {/* Fenêtre allumée : plus claire que les autres et entourée d'un halo, pour se distinguer des fenêtres déjà allumées. */}
      {view.lit && roof?.lamp && (
        <g data-santa-window="" data-x={roof.lamp.x} data-y={roof.lamp.y}>
          <rect x={roof.lamp.x - 2} y={roof.lamp.y - 2} width={9} height={11} rx={2} fill="#FFE08A" opacity={0.4} />
          <rect x={roof.lamp.x} y={roof.lamp.y} width={5} height={7} fill="#FFF6C8" />
        </g>
      )}
      <g ref={g} display="none">
        <SantaSprite sky={sky} still={still} santa={view.santa} lit landed={view.landed} walker={figure} seated={!ghibli} />
      </g>
    </g>
  );
}

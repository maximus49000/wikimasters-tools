import { useContext, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Facade } from '../core/library/city/facades';
import type { Outfit } from '../core/library/city/people';
import {
  SANTA_FAR_HAZE, SANTA_PERIOD_S, SANTA_WINDOW_S, landDx, roofSurface, santaHillPoseAt, santaHillRoof, santaHillScale, santaHillStepAt, santaHillWindow, santaOn, santaPassFor, santaPoseAt, santaRoof, santaStepAt,
  visibleHillHouses, type SantaHillRoof, type SantaHillStep, type SantaPose, type SantaStep,
} from '../core/library/city/santa';
import { anchorsOf, type FigureKey } from '../core/library/figure/bake';
import { shapeOf, signatureOf } from '../core/library/figure/dress';
import { cityPaintPlan } from '../core/library/paint/city-plan';
import type { Sky } from '../core/library/sky';
import { useFigureRegistry } from './figure/figure-host';
import { GhibliFigure, poseFigure, type PoseIn } from './figure/ghibli-figure';
import { collectCycles, placeCycles, PropContext, type CycledNode } from './prop/prop-host';
import { ClassicSantaWalker, GhibliHarness, GhibliReindeer, GhibliSack, GhibliSleighBody, GhibliTrail, HARNESS_FLIGHT, SantaSprite, TEAM_FLIGHT, TEAM_LANDED } from './santa-sprite';
import { useWallClockLoop } from './use-wallclock-loop';

// Ghibli (G5) : vrai pantin du père Noël (tenue `santa` du moteur : barbe, fourrure, ceinture, bottes, gants ; le bonnet rouge
// à pompon remplace le `beanie`), hotte peinte à la nuque. Échelle du pantin dans le repère du traîneau en vol : celle des
// passants (0,55, notes §6) ; posé sur la colline, pantin et traîneau sont à la même échelle 0,55·s (comme la maquette).
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
export const SANTA_K = 0.55;
const SANTA_SIG = signatureOf(shapeOf(SANTA_OUTFIT, false, 'none', true));
const mod16 = (y: number): number => ((y % 16) + 16) % 16;
const DEG = 180 / Math.PI;
// Place assise en vol (repère du traîneau, px) : accroche `seat` du pantin à (−4,5, −6) (maquette `santa()`).
const SEAT_FLIGHT = { x: -4.5, y: -6 } as const;
// Hotte à la nuque : décalée vers l'arrière du corps (2,5), 7 unités plus bas, ×1,25 ; devant le corps quand il est vu de dos.
const SACK_BACK = 2.5;
const SACK_DROP = 7;
const SACK_K = 1.25;
const sackBehindBody = (yaw: number): boolean => !(yaw >= 10 && yaw <= 14);
const sackSide = (yaw: number): number => (yaw >= 6 && yaw <= 10 ? -SACK_BACK : SACK_BACK);

// Pas du pantin Ghibli, dans le repère du nœud du traîneau (px) : point visé par l'accroche (`seat` assis, pieds sinon),
// pose, penché (degrés, vers l'amont sur la pente), échelle, hotte (à la nuque, posée à un point, absente), rognage.
type FigStep = { x: number; y: number; at: 'feet' | 'seat'; pose: PoseIn; leanDeg: number; k: number; sack: 'shoulder' | { x: number; y: number } | null; clip: number | null };
// Orientation du script retournée avec le traîneau (le pantin n'est jamais en miroir) ; debout/assis en mouvement réduit.
const flipYaw = (yaw: number, dir: 1 | -1): number => (dir > 0 ? yaw : mod16(8 - yaw));
const seatedStep = (x: number, y: number, k: number, dir: 1 | -1): FigStep => ({ x, y, at: 'seat', pose: { yaw: flipYaw(0, dir), gait: 'seated', phase: 0, head: 0, arms: 'handlebar' }, leanDeg: 0, k, sack: 'shoulder', clip: null });
const hillFigStep = (s: SantaHillStep, dir: 1 | -1, k: number, still: boolean): FigStep =>
  s.gait === 'seated'
    ? seatedStep(s.x, s.y, k, dir)
    : { x: s.x, y: s.y, at: 'feet', pose: { yaw: flipYaw(s.yaw, dir), gait: still ? 'stand' : s.gait, phase: still ? 0 : s.phase, head: 0, arms: s.arms }, leanDeg: still ? 0 : s.lean * DEG, k, sack: s.sack, clip: s.clip };
const keyOf = (p: PoseIn): FigureKey => ({ sig: SANTA_SIG, yaw: p.yaw, gait: p.gait, phase: p.phase, head: p.head, arms: p.arms ?? 'swing', lean: p.lean ?? 0 });
// Transform du nœud du pantin : accroche au point visé, penché, échelle qui annule le retournement du traîneau.
function walkerTransformOf(f: FigStep, dir: 1 | -1): string {
  const [ax, ay] = f.at === 'seat' ? anchorsOf(keyOf(f.pose)).seat : [0, 0];
  const x = f.x - dir * f.k * ax;
  const y = f.y - f.k * ay;
  return `translate(${x.toFixed(2)} ${y.toFixed(2)})${f.leanDeg ? ` rotate(${f.leanDeg.toFixed(2)})` : ''} scale(${(dir * f.k).toFixed(3)} ${f.k.toFixed(3)})`;
}
const sackTransformOf = (f: FigStep): string => {
  const n = anchorsOf(keyOf(f.pose)).nape;
  return `translate(${(n[0] - sackSide(f.pose.yaw)).toFixed(2)} ${(n[1] + SACK_DROP).toFixed(2)}) scale(${SACK_K})`;
};
// Nœud du personnage classique (repère du traîneau) : inchangé.
const classicWalkerTransform = (s: SantaStep): string => `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// Calque du père Noël (vague 1b-ii-a). Le moteur (`city/santa.ts`) est pur : ici on lit l'horloge murale à chaque image,
// on pose le traîneau avec un `transform` sans re-rendu, et on ne re-rend que lorsque la tranche, le personnage ou la fenêtre
// allumée changent. Mouvement réduit : pas de boucle, seulement le traîneau posé sur son toit pendant la tranche de `frozenT`
// (si elle livre sur un toit), sinon rien. Le personnage suit `santaStepAt` (classique) : la boucle réécrit son transform à
// chaque image ; un <svg> imbriqué (sans id ; viewBox = cadre, donc repère du traîneau à l'échelle 1) le rogne au niveau du
// toit quand il descend dans la cheminée, au lieu de le faire apparaître ou disparaître sur place.
// Ghibli (G5) : la livraison se fait sur une maison de la colline du fond (`santaHillRoof`, notes §7), dans un repère local du
// toit retourné avec le sens du traîneau, à l'échelle 0,55·s, teinté de brume, DERRIÈRE les immeubles (masque de leurs
// silhouettes) et devant la colline peinte ; rennes, traîneau, traînée et hotte sont des images peintes (poses cycliques
// choisies par la boucle), le père Noël un pantin (assis les rênes en main, puis le script de `santaHillStepAt`). Sans maison
// (ou sans livraison), passage simple dans le ciel avec le même attelage peint à l'échelle 1. La fenêtre de la maison
// s'allume pendant la visite. Le dessin classique (`ghibli` faux) ne change pas.
type Props = { width: number; height: number; seed: number; sky: Sky; facades: Facade[]; ground: number; fests: readonly string[]; daylight: number; still: boolean; frozenT: number; ghibli?: boolean };
type View = { tranche: number; santa: SantaPose['santa']; lit: boolean; landed: boolean };

export function SantaLayer({ width, height, seed, sky, facades, ground, fests, daylight, still, frozenT, ghibli = false }: Props): ReactElement | null {
  const on = santaOn(fests, daylight);
  const g = useRef<SVGGElement | null>(null);
  const body = useRef<SVGGElement | null>(null);
  const walker = useRef<SVGGElement | null>(null);
  const clipEl = useRef<SVGSVGElement | null>(null);
  const sackBack = useRef<SVGGElement | null>(null);
  const sackFront = useRef<SVGGElement | null>(null);
  const sackGround = useRef<SVGGElement | null>(null);
  const frost = useRef<SVGGElement | null>(null);
  const cycles = useRef<CycledNode[] | null>(null);
  const clipShown = useRef<number | null>(null);
  const figures = useFigureRegistry();
  const props = useContext(PropContext);
  const maskId = `sm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const trancheAt = (t: number): number => Math.floor(t / SANTA_PERIOD_S);
  const [view, setView] = useState<View>(() => ({ tranche: trancheAt(still ? frozenT : Date.now() / 1000), santa: 'aboard', lit: false, landed: false }));
  // Passage et toit de la tranche affichée (seule une livraison cherche un toit) : immeuble en classique, maison de la colline
  // en Ghibli (plan peint de la ville : mêmes maisons que les tranches du décor).
  const pass = useMemo(() => santaPassFor(view.tranche, seed), [view.tranche, seed]);
  const houses = useMemo(() => (ghibli && on ? visibleHillHouses(cityPaintPlan(width, height, seed).hill.houses, facades, ground) : null), [ghibli, on, width, height, seed, facades, ground]);
  const roof = useMemo(() => (pass.deliver && !ghibli ? santaRoof(pass, facades, ground, width) : null), [pass, facades, ground, width, ghibli]);
  const hill = useMemo(() => (pass.deliver && houses ? santaHillRoof(pass, houses, 0, width) : null), [pass, houses, width]);
  const state = useRef({ pass, roof, hill });
  state.current = { pass, roof, hill };

  // Pantin Ghibli : transform, pose, hotte à la nuque (derrière le corps, devant quand il est vu de dos), hotte posée, rognage.
  const placeWalker = (f: FigStep, dir: 1 | -1): void => {
    const w = walker.current;
    if (!w) return;
    w.setAttribute('transform', walkerTransformOf(f, dir));
    poseFigure(figures, w.querySelector('[data-figure]'), f.pose);
    const onShoulder = f.sack === 'shoulder';
    const tr = onShoulder ? sackTransformOf(f) : '';
    for (const [node, show] of [[sackBack.current, onShoulder && sackBehindBody(f.pose.yaw)], [sackFront.current, onShoulder && !sackBehindBody(f.pose.yaw)]] as const) {
      if (!node) continue;
      node.setAttribute('display', show ? 'inline' : 'none');
      if (show) node.setAttribute('transform', tr);
    }
    const sg = sackGround.current;
    if (sg) {
      const posed = typeof f.sack === 'object' && f.sack !== null ? f.sack : null;
      sg.setAttribute('display', posed ? 'inline' : 'none');
      if (posed) sg.setAttribute('transform', `translate(${posed.x.toFixed(2)} ${posed.y.toFixed(2)}) scale(${(f.k * 1.3).toFixed(3)})`);
    }
    const c = clipEl.current;
    if (c && clipShown.current !== f.clip) {
      clipShown.current = f.clip;
      const h = 200 + (f.clip ?? 200);
      c.setAttribute('height', String(h));
      c.setAttribute('viewBox', `-200 -200 400 ${h}`);
    }
  };

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
      const seatT = cur.pass.start + 0.27 * SANTA_WINDOW_S;
      let next: Omit<View, 'tranche'>;
      if (cur.hill) {
        // Ghibli, livraison sur la colline (repère local du toit). Mouvement réduit : posé, à bord.
        const h = cur.hill;
        const pose = santaHillPoseAt(cur.pass, h, still ? seatT : t, width, height);
        if (!pose) {
          el.setAttribute('display', 'none');
          return;
        }
        el.setAttribute('transform', `translate(${pose.u.toFixed(1)} ${pose.y.toFixed(1)})`);
        el.setAttribute('display', 'inline');
        body.current?.setAttribute('transform', `rotate(${(pose.tilt * DEG).toFixed(2)})`);
        frost.current?.setAttribute('opacity', pose.slide > 0 && pose.slide < 1.6 ? (0.7 * (1 - pose.slide / 1.6)).toFixed(2) : '0');
        const step = santaHillStepAt(cur.pass, h, still ? seatT : t);
        if (step) placeWalker(hillFigStep(step, cur.pass.dir, santaHillScale(h), still), cur.pass.dir);
        next = { santa: pose.santa, lit: pose.windowLit, landed: pose.landed };
      } else {
        // Mouvement réduit : le traîneau posé sur son toit (classique), ou rien.
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
        if (ghibli) placeWalker(seatedStep(SEAT_FLIGHT.x, SEAT_FLIGHT.y, SANTA_K, cur.pass.dir), cur.pass.dir);
        else {
          // Mouvement réduit : assis à sa place (le traîneau n'est montré que posé, à bord).
          const step = santaStepAt(cur.pass, cur.roof, still ? seatT : t);
          if (step) walker.current?.setAttribute('transform', classicWalkerTransform(step));
        }
        next = { santa: pose.santa, lit: pose.windowLit, landed: pose.landed };
      }
      // Poses cycliques des images (rennes, traînée) : relues quand le rendu les a remplacées.
      if (ghibli && !still) {
        let list = cycles.current;
        if (!list || list.some((c) => !c.node.isConnected)) cycles.current = list = collectCycles(el);
        placeCycles(list, t, props);
      }
      setView((v) => (v.santa === next.santa && v.lit === next.lit && v.landed === next.landed ? v : { ...v, ...next }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [on, still, frozenT, width, height, ghibli, figures, props],
  );
  useWallClockLoop(place, [place, pass, roof, hill]);

  if (!on) return null;
  const seatT = pass.start + 0.27 * SANTA_WINDOW_S;
  const nowT = still ? seatT : Date.now() / 1000;
  const dir = pass.dir;

  // ---------- Classique : inchangé ----------
  if (!ghibli) {
    const st = santaStepAt(pass, roof, nowT) ?? santaStepAt(pass, roof, seatT)!;
    const figure =
      view.santa === 'walking' ? (
        <svg data-santa-clip="" x={-200} y={-200} width={400} height={200} viewBox="-200 -200 400 200" overflow="hidden">
          <g ref={walker} data-santa-figure="" data-santa-where={view.santa} transform={classicWalkerTransform(st)}>
            <ClassicSantaWalker sky={sky} />
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
          <SantaSprite sky={sky} still={still} santa={view.santa} lit landed={view.landed} walker={figure} seated />
        </g>
      </g>
    );
  }

  // ---------- Ghibli ----------
  // Pantin au rendu : même calcul que la boucle à l'instant du rendu ; à sa place (assis) hors fenêtre et en mouvement réduit.
  const k = hill ? santaHillScale(hill) : SANTA_K;
  const hillStep = hill ? santaHillStepAt(pass, hill, nowT) ?? santaHillStepAt(pass, hill, seatT)! : null;
  const fs = hillStep ? hillFigStep(hillStep, dir, k, still) : seatedStep(SEAT_FLIGHT.x, SEAT_FLIGHT.y, SANTA_K, dir);
  const gb = { sky, dir, still, far: hill ? SANTA_FAR_HAZE : 0 };
  const clipH = 200 + (fs.clip ?? 200);
  const onShoulder = fs.sack === 'shoulder';
  const sackTr = onShoulder ? sackTransformOf(fs) : undefined;
  const figure =
    view.santa !== 'hidden' ? (
      <svg ref={clipEl} data-santa-clip="" x={-200} y={-200} width={400} height={clipH} viewBox={`-200 -200 400 ${clipH}`} overflow="hidden">
        <g ref={walker} data-santa-figure="" data-santa-where={view.santa} transform={walkerTransformOf(fs, dir)}>
          <g ref={sackBack} data-santa-sack-nape="back" display={onShoulder && sackBehindBody(fs.pose.yaw) ? 'inline' : 'none'} transform={sackTr}>
            <GhibliSack g={gb} mirror={false} />
          </g>
          <GhibliFigure outfit={SANTA_OUTFIT} sky={sky} rainy={false} umbrella={false} santa initial={fs.pose} />
          <g ref={sackFront} data-santa-sack-nape="front" display={onShoulder && !sackBehindBody(fs.pose.yaw) ? 'inline' : 'none'} transform={sackTr}>
            <GhibliSack g={gb} mirror={false} />
          </g>
        </g>
      </svg>
    ) : null;
  // Attelage : en vol, positions du classique à l'échelle k ; posé sur la colline, étagé sur la pente vers le faîte (corps
  // d'aplomb), harnais tendus jusqu'au toit. Compact (TEAM_LANDED) dès que la maison est connue, comme la maquette.
  const landU = hill ? landDx(hill) : 0;
  const landY = hill ? roofSurface(hill, hill.cx + landU) - hill.y : 0;
  const surfRel = (xr: number): number => (hill ? roofSurface(hill, hill.cx + clamp(landU + xr, -hill.w / 2, hill.w / 2)) - hill.y - landY : 0);
  const spots = hill ? TEAM_LANDED : TEAM_FLIGHT;
  const team = spots.map((s, i) => ({ lead: s.lead, x: s.x * k, y: view.landed ? surfRel(s.x * k) - 2.6 * k + (i < 2 ? -1.2 * k : 0) : s.y * k, phase: view.landed ? i * 0.37 : i * 0.2 }));
  const harnessX = hill ? [50, 40] : HARNESS_FLIGHT.map((e) => e[0]);
  const harness = harnessX.map((x1, i) => [x1 * k, view.landed ? surfRel(x1 * k) + (i === 0 ? -7 : -4) * k * 0.3 : (i === 0 ? -7 : -4) * k] as const);
  const posed = typeof fs.sack === 'object' && fs.sack !== null ? fs.sack : null;
  const train = (
    <g ref={g} display="none">
      {!view.landed && <GhibliTrail k={k} g={gb} />}
      <GhibliHarness k={k} ends={harness} />
      {/* Sur la colline (toits étroits), le père Noël passe DERRIÈRE l'attelage pour gagner la cheminée de l'autre versant. */}
      {hill && figure}
      {team.map((r, i) => (
        <GhibliReindeer key={`${i}-${view.landed ? 'l' : 'f'}`} x={r.x} y={r.y} k={k} lead={r.lead} landed={view.landed} phase={r.phase} g={gb} />
      ))}
      {!hill && figure}
      <g ref={body}>
        <GhibliSleighBody k={k} g={gb} />
      </g>
      {hill && (
        <>
          <g ref={sackGround} data-santa-sack-ground="" display={posed ? 'inline' : 'none'} transform={posed ? `translate(${posed.x.toFixed(2)} ${posed.y.toFixed(2)}) scale(${(k * 1.3).toFixed(3)})` : undefined}>
            <GhibliSack g={gb} mirror />
          </g>
          {/* Gerbe de givre derrière les patins pendant la glissade (opacité posée par la boucle). */}
          <g ref={frost} data-santa-frost="" opacity={0}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <circle key={i} cx={-20 * k - i * 1.6} cy={-1 - i * 0.8 - Math.abs(Math.sin(i * 2.1)) * 1.5} r={(0.8 + i * 0.2) * k * 2.4} fill="#FFFFFF" />
            ))}
          </g>
        </>
      )}
    </g>
  );
  if (!hill) return <g data-santa="">{train}</g>;
  // Livraison sur la colline : derrière les immeubles (masque de leurs silhouettes), repère local du toit retourné avec le sens.
  const win = santaHillWindow(hill);
  return (
    <>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <rect x={0} y={0} width={width} height={height} fill="#fff" />
          {facades.map((b, i) => (
            <rect key={i} x={b.x} y={ground - b.h} width={b.w} height={b.h + 4} fill="#000" />
          ))}
        </mask>
      </defs>
      <g data-santa="">
        <g data-santa-hill="" mask={`url(#${maskId})`}>
          {view.lit && (
            <g data-santa-window="" data-x={win.x} data-y={win.y}>
              <rect x={win.x - 1.5} y={win.y - 1.5} width={win.w + 3} height={win.h + 3} rx={1.5} fill="#FFE08A" opacity={0.4} />
              <rect x={win.x} y={win.y} width={win.w} height={win.h} fill="#FFF6C8" />
            </g>
          )}
          <g data-santa-roof="" transform={`translate(${hill.cx.toFixed(1)} ${hill.y.toFixed(1)}) scale(${dir} 1)`}>{train}</g>
        </g>
      </g>
    </>
  );
}

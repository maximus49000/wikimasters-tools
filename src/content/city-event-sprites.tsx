import type { ReactElement } from 'react';
import type { FestivityId } from '../core/library/city/calendar';
import type { CityEvent } from '../core/library/city/events';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import { anchorsOf } from '../core/library/figure/bake';
import { shapeOf, signatureOf } from '../core/library/figure/dress';
import { facingYaw, phaseIndexOf } from '../core/library/figure/gait';
import type { ArmPose } from '../core/library/figure/skeleton';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { citizenSeed } from '../core/citizens/identity';
import { PersonSprite, tone } from './city-sprites';
import type { FigureRegistry } from './figure/figure-host';
import { GhibliFigure, poseFigure, type PoseIn } from './figure/ghibli-figure';

// Dessins des événements de la ville (maquette validée du 2026-10-09). Petites animations en SMIL, jamais en mouvement
// réduit ; aucun id SVG fixe. Les tirages de couleurs viennent de la clé de l'événement (déterministes).
// `fests` : fêtes en cours (forme des ballons de fête). `ghibli` : figurants en pantins ; `walked` : chemin parcouru par les
// marcheurs à l'instant du rendu (unités du pantin, eventWalked).
type Props = { event: CityEvent; sky: Sky; still: boolean; lights: boolean; rainy: boolean; fests: readonly FestivityId[]; ghibli?: boolean; walked?: number };

// Figurants Ghibli (G3b) : pantins posés dans le repère du sprite, que placeEvent retourne selon `dir` ; `scale(dir 1)`
// annule ce retournement (jamais de miroir), le profil suit le sens de marche (sens constant : aucun demi-tour). Les
// marcheurs du trottoir portent `data-walker` (unités ajoutées au chemin parcouru : un groupe ne marche pas au même pas) et
// `data-arms` : la boucle des événements avance leurs pas (poseEventFigures). Le ripeur, debout sur le marchepied du camion,
// garde une pose fixe. Le livreur à vélo reste un dessin simple (cyclistes en G3c).
export const eventWalked = (e: CityEvent, t: number, m: CityMetrics): number => (e.speed * (t - e.start)) / (m.unit * STREET_SCALE.person);
export const eventWalkPose = (e: CityEvent, walked: number, still: boolean, arms: ArmPose = 'swing'): PoseIn =>
  still ? { yaw: facingYaw(e.dir), gait: 'stand', phase: 0, head: 0, arms } : { yaw: facingYaw(e.dir), gait: 'walk', phase: phaseIndexOf(walked), head: 0, arms };
// Marcheurs d'un nœud d'événement, lus une fois (relus si un pantin a quitté le DOM).
type WalkerHandle = { fig: Element | null; offset: number; arms: ArmPose };
const walkersOf = new WeakMap<Element, WalkerHandle[]>();
export function poseEventFigures(reg: FigureRegistry, node: Element, e: CityEvent, t: number, m: CityMetrics, still: boolean): void {
  const walked = eventWalked(e, t, m);
  let list = walkersOf.get(node);
  if (!list || list.some((h) => h.fig && !h.fig.isConnected)) {
    list = [...node.querySelectorAll('[data-walker]')].map((w) => ({
      fig: w.querySelector(':scope > [data-figure]'),
      offset: Number(w.getAttribute('data-walker')),
      arms: (w.getAttribute('data-arms') ?? 'swing') as ArmPose,
    }));
    walkersOf.set(node, list);
  }
  for (const h of list) poseFigure(reg, h.fig, eventWalkPose(e, walked + h.offset, still, h.arms));
}
// Décalage des pas d'un marcheur au suivant dans un groupe (unités).
const WALKER_OFFSET = 7;
// Laisse tenue à la main (accroche du pantin) jusqu'au collier du chien (repère du sprite, comme le dessin classique) : la
// main est lue sur la pose debout, la laisse suit ensuite la main pendant la marche (le bout bouge d'une unité au plus).
// Habitant 3D : la laisse suit la main 3D (objet tenu) ; le bout reste calculé sur la main du pantin (quelques unités d'écart
// au collier au plus, la forme de la laisse étant fixée au rendu).
function leashFrom(o: Outfit, umbrella: boolean, dir: 1 | -1, hand: 'handR' | 'handL'): string {
  const a = anchorsOf({ sig: signatureOf(shapeOf(o, umbrella)), yaw: facingYaw(dir), gait: 'stand', phase: 0, head: 0, arms: 'hold', lean: 0 })[hand];
  // Collier en (22, -9) dans le sprite ; repère du pantin : x multiplié par `dir` (retournement annulé).
  const dx = 22 * dir - a[0];
  const dy = -9 - a[1];
  return `M0 0 Q${(dx / 2).toFixed(1)} ${(dy / 2 + 4).toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)}`;
}

const GLASS = '#CFE4F2';
const pickOf = <T,>(list: readonly T[], u: number): T => list[Math.min(list.length - 1, Math.floor(u * list.length))]!;
const outfitsOf = (key: string, profile: Parameters<typeof outfitFor>[0], n: number): Outfit[] => {
  const rng = mulberry32(hashString(key));
  return Array.from({ length: n }, () => outfitFor(profile, rng));
};

export function CityEventSprite({ event: e, sky, still, lights, rainy, fests, ghibli = false, walked = 0 }: Props): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const anim = !still;
  const body = ((): ReactElement => {
    switch (e.id) {
      case 'plane':
        return (
          <g>
            {sky.daylight > 0.3 && <line x1={-24} y1={0} x2={-160} y2={1} stroke="#FFFFFF" strokeWidth={2} opacity={0.6} />}
            <path d="M-20 0 L18 -2 Q24 0 18 2 Z" fill={t('#F4F4F4')} />
            <path d="M-4 0 L-12 10 L-6 10 L4 0Z M-16 0 L-22 -8 L-18 -8 L-12 0Z" fill={t('#D0D4DC')} />
            {sky.daylight < 0.3 && (
              <>
                <circle cx={-4} cy={9} r={1.5} fill="#FF4040">{anim && <animate attributeName="opacity" values="1;0.1;1" dur="1.2s" repeatCount="indefinite" />}</circle>
                <circle cx={19} cy={0} r={1.2} fill="#FFFFFF" />
              </>
            )}
          </g>
        );
      case 'helicopter': {
        const c = t(pickOf(['#C0463A', '#2E5E8A', '#E0A21E'], e.variant));
        return (
          <g>
            <ellipse cx={0} cy={0} rx={13} ry={7} fill={c} />
            <rect x={-30} y={-2} width={18} height={3} fill={c} />
            <circle cx={7} cy={-1} r={4} fill={t(GLASS)} />
            <line x1={0} y1={-7} x2={0} y2={-10} stroke="#333" />
            <path d="M-6 8 H10 M-4 7 V8 M8 7 V8" stroke="#333" fill="none" />
            <line x1={-22} y1={-10} x2={22} y2={-10} stroke="#333" strokeWidth={1.5}>
              {anim && <animateTransform attributeName="transform" type="scale" values="1 1;0.1 1;1 1" dur="0.25s" repeatCount="indefinite" />}
            </line>
            {sky.daylight < 0.3 && <circle cx={-30} cy={0} r={1.5} fill="#FF4040" />}
          </g>
        );
      }
      case 'drone':
        return (
          <g>
            <rect x={-5} y={-2} width={10} height={4} rx={1} fill="#333" />
            <line x1={-10} y1={-3} x2={10} y2={-3} stroke="#333" />
            {[-10, 10].map((cx) => (
              <ellipse key={cx} cx={cx} cy={-4} rx={5} ry={1} fill="#555">
                {anim && <animate attributeName="rx" values="5;1;5" dur="0.2s" repeatCount="indefinite" />}
              </ellipse>
            ))}
            {sky.daylight < 0.3 && <circle cx={0} cy={2} r={1.2} fill="#40FF80" />}
          </g>
        );
      case 'balloon': {
        const [a, b] = pickOf([['#E0A21E', '#C0463A'], ['#3B6FD6', '#F2C94C'], ['#2E8B6A', '#E07A8C']] as const, e.variant);
        return (
          <g>
            <path d="M-16 -10 Q-16 -36 0 -36 Q16 -36 16 -10 Q12 2 4 8 H-4 Q-12 2 -16 -10Z" fill={t(a)} />
            <path d="M-6 -35 Q-9 -10 -4 8 M6 -35 Q9 -10 4 8" stroke={t(b)} strokeWidth={3} fill="none" />
            <path d="M-4 8 L-4 14 M4 8 L4 14" stroke="#4A3B2A" />
            <rect x={-5} y={14} width={10} height={7} fill={t('#8A5A2B')} />
          </g>
        );
      }
      case 'banner-plane':
        return (
          <g>
            <path d="M-12 0 L12 -2 Q16 0 12 2Z" fill={t('#F4F4F4')} />
            <path d="M-2 0 L-8 7 L-4 7 L4 0Z" fill={t('#D0D4DC')} />
            <line x1={-12} y1={0} x2={-24} y2={0} stroke="#555" strokeWidth={0.6} />
            <rect x={-104} y={-7} width={80} height={14} fill={t(pickOf(['#F2C94C', '#E07A8C', '#9FE1CB'], e.variant))} />
            {/* Banderole lue dans le bon sens quel que soit le sens de vol : texte retourné avec le sprite. */}
            <g transform={e.dir < 0 ? 'translate(-128 0) scale(-1 1)' : undefined}>
              <text x={-64} y={4} textAnchor="middle" fontSize={9} fill="#5A3A0A" fontFamily="sans-serif">Wikimasters</text>
            </g>
          </g>
        );
      case 'kite': {
        const c = t(pickOf(['#E07A8C', '#3B6FD6', '#E0A21E', '#2E8B6A'], e.variant));
        return (
          <g>
            <path d="M0 14 Q-20 80 -40 150" stroke="#555" strokeWidth={0.5} fill="none" opacity={0.6} />
            <g>
              {anim && <animateTransform attributeName="transform" type="rotate" values="-8;8;-8" dur="3s" repeatCount="indefinite" />}
              <path d="M0 -12 L9 0 L0 14 L-9 0Z" fill={c} />
              <path d="M0 -12 V14 M-9 0 H9" stroke="#FFFFFF" strokeWidth={0.8} />
              <path d="M0 14 q4 6 0 12 q-4 6 0 12" stroke={t('#3B6FD6')} fill="none" />
            </g>
          </g>
        );
      }
      case 'bus': {
        // Bus articulé : deux caisses reliées par un soufflet.
        const c = t(pickOf(['#2E8B6A', '#C0463A', '#3B6FD6'], e.variant));
        const glass = t(GLASS);
        return (
          <g>
            <rect x={-42} y={-26} width={40} height={22} rx={3} fill={c} />
            <rect x={-2} y={-24} width={4} height={18} fill={t('#333333')} />
            <rect x={2} y={-26} width={40} height={22} rx={3} fill={c} />
            {[-38, -28, -18, 6, 16, 26].map((x) => <rect key={x} x={x} y={-23} width={7} height={8} fill={glass} opacity={0.85} />)}
            {[-32, -12, 12, 32].map((x) => <circle key={x} cx={x} cy={-3} r={4} fill="#222" />)}
            {lights && <path d="M42 -10 L64 -5 L64 -15Z" fill="#FFE9A0" opacity={0.25} />}
          </g>
        );
      }
      case 'tram': {
        const c = t('#E8E8F0');
        return (
          <g>
            <line x1={-20} y1={-30} x2={-6} y2={-44} stroke="#333" />
            <line x1={-40} y1={-44} x2={20} y2={-44} stroke="#333" />
            <rect x={-80} y={-30} width={160} height={26} rx={4} fill={c} />
            <rect x={-80} y={-12} width={160} height={4} fill={t(pickOf(['#C0463A', '#3B6FD6', '#2E8B6A'], e.variant))} />
            {Array.from({ length: 14 }, (_, i) => <rect key={i} x={-74 + i * 11} y={-26} width={8} height={10} fill={t(GLASS)} />)}
            {[-60, -30, 30, 60].map((x) => <circle key={x} cx={x} cy={-3} r={3.5} fill="#222" />)}
            {lights && <path d="M80 -12 L100 -7 L100 -17Z" fill="#FFE9A0" opacity={0.25} />}
          </g>
        );
      }
      case 'ambulance':
        return (
          <g>
            <rect x={-24} y={-24} width={48} height={20} rx={3} fill={t('#F4F4F4')} />
            <rect x={10} y={-21} width={10} height={7} fill={t(GLASS)} />
            <rect x={-14} y={-19} width={10} height={3} fill="#C0463A" />
            <rect x={-10.5} y={-22.5} width={3} height={10} fill="#C0463A" />
            <rect x={-24} y={-12} width={48} height={2} fill="#E0A21E" />
            <rect x={2} y={-28} width={6} height={4} fill="#3B6FD6">
              {anim && <animate attributeName="fill" values="#3B6FD6;#7FB0FF;#3B6FD6" dur="0.5s" repeatCount="indefinite" />}
            </rect>
            <circle cx={5} cy={-27} r={6} fill="#7FB0FF" opacity={0.3}>
              {anim && <animate attributeName="r" values="3;8;3" dur="0.5s" repeatCount="indefinite" />}
            </circle>
            <circle cx={-12} cy={-3} r={4} fill="#222" />
            <circle cx={13} cy={-3} r={4} fill="#222" />
            {lights && <path d="M24 -9 L46 -4 L46 -14Z" fill="#FFE9A0" opacity={0.25} />}
          </g>
        );
      case 'garbage-truck': {
        const [worker] = outfitsOf(e.key, 'ordinary', 1);
        return (
          <g>
            <rect x={-30} y={-30} width={40} height={26} rx={2} fill={t('#2E8B6A')} />
            <rect x={10} y={-24} width={16} height={20} rx={2} fill={t('#E8E8E8')} />
            <rect x={16} y={-21} width={8} height={7} fill={t(GLASS)} />
            <rect x={-34} y={-20} width={4} height={12} fill="#E0A21E" />
            <circle cx={-18} cy={-3} r={4.5} fill="#222" />
            <circle cx={16} cy={-3} r={4.5} fill="#222" />
            {/* Ripeur derrière le camion, gilet orange. Ghibli : debout sur le marchepied, la main sur la barre. */}
            {ghibli ? (
              <>
                <rect x={-43} y={-4.4} width={9} height={1.4} fill={t('#555555')} />
                <g transform="translate(-40 -3) scale(0.65)">
                  <g transform={`scale(${e.dir} 1)`}>
                    <GhibliFigure
                      outfit={{ ...worker!, top: 'jacket', topColor: '#2E8B6A', bottomColor: '#2E8B6A', accessory: 'none' }}
                      sky={sky}
                      rainy={rainy}
                      umbrella={false}
                      work="vest"
                      initial={{ yaw: facingYaw(e.dir), gait: 'stand', phase: 0, head: 0, arms: 'reach' }}
                      citizen={citizenSeed(`${e.key}:0`)}
                      kind="adult"
                    />
                  </g>
                </g>
              </>
            ) : (
              <g transform="translate(-42 0) scale(0.65)">
                <PersonSprite outfit={{ ...worker!, top: 'jacket', topColor: '#E0A21E', bottomColor: '#2E8B6A', accessory: 'none' }} sky={sky} rainy={rainy} umbrella={false} />
              </g>
            )}
            {lights && <path d="M26 -9 L48 -4 L48 -14Z" fill="#FFE9A0" opacity={0.25} />}
          </g>
        );
      }
      case 'delivery-bike': {
        const [rider] = outfitsOf(e.key, 'ordinary', 1);
        const box = t(pickOf(['#2A9DAA', '#E0A21E', '#C0463A'], e.variant));
        return (
          <g>
            <g fill="none" stroke={t('#3B3F4A')} strokeWidth={1.2}>
              <circle cx={-7} cy={-5} r={5} />
              <circle cx={7} cy={-5} r={5} />
              <path d="M-7 -5 L0 -12 L7 -5 M0 -12 L2 -15" />
            </g>
            <rect x={-1} y={-28} width={6} height={12} rx={2} fill={box} />
            <circle cx={2} cy={-32} r={4} fill={t(rider!.skin)} />
            <rect x={-13} y={-34} width={12} height={11} rx={1} fill={box} />
          </g>
        );
      }
      case 'dog-walker': {
        const [walker] = outfitsOf(e.key, 'stroller', 1);
        const coat = t(pickOf(['#8A5A2B', '#222222', '#E8D9B8', '#B97A52'], e.variant));
        // Ghibli : laisse dans la main libre (la droite tient le parapluie sous la pluie).
        const hand = rainy ? 'handL' : 'handR';
        return (
          <g>
            {ghibli ? (
              <g data-walker="0" data-arms="hold" transform={`scale(${e.dir} 1)`}>
                <GhibliFigure
                  outfit={walker!}
                  sky={sky}
                  rainy={rainy}
                  umbrella={rainy}
                  initial={eventWalkPose(e, walked, still, 'hold')}
                  citizen={citizenSeed(`${e.key}:0`)}
                  held={[{ anchor: hand, node: <path data-leash="" d={leashFrom(walker!, rainy, e.dir, hand)} stroke="#C0463A" fill="none" strokeWidth={0.8} /> }]}
                />
              </g>
            ) : (
              <>
                <PersonSprite outfit={walker!} sky={sky} rainy={rainy} umbrella={rainy} />
                <path d="M4 -20 Q14 -12 22 -9" stroke="#C0463A" fill="none" strokeWidth={0.8} />
              </>
            )}
            <g data-dog="" transform="translate(26 0)">
              <rect x={-8} y={-11} width={14} height={6} rx={3} fill={coat} />
              <circle cx={7} cy={-11} r={3.5} fill={coat} />
              <path d="M-8 -10 L-12 -14" stroke={coat} strokeWidth={1.5} />
              <rect x={-6} y={-5} width={2} height={5} fill={coat}>
                {anim && <animateTransform attributeName="transform" type="rotate" values="-15 -5 -5;15 -5 -5;-15 -5 -5" dur="0.5s" repeatCount="indefinite" />}
              </rect>
              <rect x={3} y={-5} width={2} height={5} fill={coat}>
                {anim && <animateTransform attributeName="transform" type="rotate" values="15 4 -5;-15 4 -5;15 4 -5" dur="0.5s" repeatCount="indefinite" />}
              </rect>
            </g>
          </g>
        );
      }
      case 'umbrella-group':
        return (
          <g>
            {outfitsOf(e.key, 'ordinary', 3).map((o, i) =>
              ghibli ? (
                <g key={i} data-walker={i * WALKER_OFFSET} data-arms="swing" transform={`translate(${-16 * i} 0) scale(${e.dir} 1)`}>
                  <GhibliFigure outfit={o} sky={sky} rainy umbrella initial={eventWalkPose(e, walked + i * WALKER_OFFSET, still)} citizen={citizenSeed(`${e.key}:${i}`)} />
                </g>
              ) : (
                <g key={i} transform={`translate(${-16 * i} 0)`}>
                  <PersonSprite outfit={o} sky={sky} rainy umbrella />
                </g>
              ),
            )}
          </g>
        );
      case 'crane': {
        const yellow = t('#E0A21E');
        return (
          <g>
            <path d="M-4 0 V-200 M4 0 V-200" stroke={yellow} strokeWidth={2} />
            {Array.from({ length: 20 }, (_, i) => <path key={i} d={`M-4 ${-i * 10} L4 ${-i * 10 - 10}`} stroke={yellow} />)}
            <path d="M0 -212 L-4 -200 M0 -212 L4 -200" stroke={yellow} />
            <g transform="translate(0 -200)">
              <g>
                {anim && <animateTransform attributeName="transform" type="scale" values="1 1;-1 1;1 1" dur="80s" repeatCount="indefinite" />}
                <path d="M-30 0 H70 M-30 -1 H70" stroke={yellow} strokeWidth={2.5} />
                <rect x={-34} y={-2} width={8} height={8} fill={t('#555555')} />
                <line x1={45} y1={0} x2={45} y2={30} stroke="#333" strokeWidth={0.6} />
                <rect x={41} y={30} width={8} height={5} fill={t('#8A5A2B')} />
              </g>
            </g>
          </g>
        );
      }
      case 'apartment':
        return (
          <g>
            <rect x={-3} y={-3} width={11} height={13} fill="#FFD27A" opacity={0.25} />
            <rect x={0} y={0} width={5} height={7} fill="#FFD27A" />
          </g>
        );
      case 'fest-balloons': {
        // Grappe de trois ballons noués ensemble : lapins à Pâques, cœurs à la Saint-Valentin (tirage `variant` si les deux).
        const bunny = fests.includes('easter') && !(fests.includes('valentine') && e.variant < 0.5);
        const cols = bunny ? ['#F7C6D9', '#CFE8FF', '#FFF2A8'] : ['#E0305A', '#F2708C', '#B01E48'];
        return (
          <g data-balloon-kind={bunny ? 'bunny' : 'heart'}>
            {cols.map((c, k) => {
              const dx = (k - 1) * 14;
              const knot = 34 + (k % 2) * 6;
              return (
                <g key={k} transform={`translate(${dx} ${-(k % 2) * 6})`}>
                  {anim && <animateTransform attributeName="transform" additive="sum" type="rotate" values={`-4 ${-dx} ${knot};4 ${-dx} ${knot};-4 ${-dx} ${knot}`} dur={`${3 + k * 0.4}s`} repeatCount="indefinite" />}
                  <path d={`M0 8 Q${-dx * 0.3} 22 ${-dx} ${knot}`} stroke="#6B5B4A" strokeWidth={0.6} fill="none" />
                  {bunny ? (
                    <>
                      <ellipse cx={-3.5} cy={-14} rx={2.4} ry={6.5} fill={t(c)} />
                      <ellipse cx={3.5} cy={-14} rx={2.4} ry={6.5} fill={t(c)} />
                      <ellipse cx={0} cy={-1} rx={8} ry={9} fill={t(c)} />
                      <circle cx={-2.8} cy={-3} r={0.9} fill="#5A4A4A" />
                      <circle cx={2.8} cy={-3} r={0.9} fill="#5A4A4A" />
                      <circle cx={0} cy={0} r={0.9} fill="#E07A8C" />
                    </>
                  ) : (
                    <path d="M0 8 C-14 -2 -8 -14 0 -6 C8 -14 14 -2 0 8Z" fill={t(c)} />
                  )}
                  <ellipse cx={-3} cy={-4} rx={1.6} ry={2.4} fill="#FFFFFF" opacity={0.45} />
                </g>
              );
            })}
            <circle cx={0} cy={34} r={1} fill="#6B5B4A" />
          </g>
        );
      }
      case 'bells':
        // Cloches de Pâques : deux cloches dorées qui se balancent sous un ruban noué.
        return (
          <g>
            <path d="M-11 -10 Q0 -16 11 -10" stroke={t('#C0463A')} strokeWidth={1.6} fill="none" />
            <path d="M0 -14 L-5 -18 L-5 -10Z M0 -14 L5 -18 L5 -10Z M0 -14 L-3 -6 M0 -14 L3 -6" fill={t('#C0463A')} stroke={t('#C0463A')} strokeWidth={0.8} />
            {[-11, 11].map((x, k) => {
              const a = k ? 14 : -14;
              return (
                <g key={k} transform={`translate(${x} 0)`}>
                  <g>
                    {anim && <animateTransform attributeName="transform" type="rotate" values={`${a} 0 -10;${-a} 0 -10;${a} 0 -10`} dur="1.6s" repeatCount="indefinite" />}
                    <line x1={0} y1={-10} x2={0} y2={-7} stroke={t('#C0463A')} strokeWidth={1.2} />
                    <path d="M-7 7 Q-7 -6 0 -8 Q7 -6 7 7Z" fill={t('#E8B923')} />
                    <path d="M-7 7 H7" stroke={t('#B08A16')} strokeWidth={1.4} />
                    <path d="M-3.5 -4 Q-5 0 -4.5 5" stroke="#FFF4C8" strokeWidth={1} fill="none" opacity={0.7} />
                    <circle cx={0} cy={9} r={1.8} fill={t('#8A6A12')} />
                  </g>
                </g>
              );
            })}
          </g>
        );
      case 'fireworks': {
        const colors = ['#FF4F4F', '#F2C94C', '#4FD8FF', '#B04FFF', '#4FFF8A'];
        return (
          <g>
            {colors.map((col, k) => {
              const cx = -120 + k * 60;
              const cy = 40 + (k % 3) * 20;
              const timing = { dur: '6s', begin: `${k * 1.2}s`, repeatCount: 'indefinite' } as const;
              return (
                <g key={k}>
                  <circle cx={cx} cy={250} r={1.5} fill="#FFFFFF" opacity={still ? 0 : 1}>
                    {anim && <animate attributeName="cy" values={`250;${cy};${cy}`} keyTimes="0;0.13;1" {...timing} />}
                    {anim && <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.12;0.14;1" {...timing} />}
                  </circle>
                  <g transform={`translate(${cx} ${cy})`}>
                    <g opacity={anim ? 0 : 1}>
                      {anim && <animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.13;0.15;0.6;1" {...timing} />}
                      {anim && <animateTransform attributeName="transform" type="scale" values="0.2;0.2;1;1.15;1.15" keyTimes="0;0.13;0.25;0.6;1" {...timing} />}
                      {Array.from({ length: 12 }, (_, j) => {
                        const a = (j * Math.PI) / 6;
                        return <line key={j} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * 22} y2={Math.sin(a) * 22} stroke={col} strokeWidth={1.4} />;
                      })}
                    </g>
                  </g>
                </g>
              );
            })}
          </g>
        );
      }
      default: {
        // Exhaustivité : un nouvel événement doit être dessiné ici.
        const never: never = e.id;
        return never;
      }
    }
  })();
  return <g data-event-sprite={e.id}>{body}</g>;
}

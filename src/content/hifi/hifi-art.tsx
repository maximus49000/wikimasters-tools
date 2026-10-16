// Fable n'est pas passé : à reprendre lors d'un rattrapage Fable.
// Chaîne hi-fi de la pièce : décalques du modèle 3D `small-hifi` (façade, dessus, grilles des enceintes), disque posé qui tourne,
// pochette couchée devant le poste. Style cellulo : aplats, trait encré, ombre nette décalée ; les volumes arrondis sont suggérés
// par des bandes claires et sombres sur les bords des faces.
import { useId, type CSSProperties, type ReactElement } from 'react';
import { BOX_FORMATS, type BoxFormat } from '../../core/game/platform-boxes';
import type { SleeveKind } from '../../core/library/hifi';
import { reducedMotion } from '../ghibli-sky';
import type { ItemContent } from '../model3d-art';

const f = (n: number): number => Math.round(n * 100) / 100;
const INK_C = '#22191A';
const INK = { stroke: INK_C, strokeWidth: 1, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const THIN = { ...INK, strokeWidth: 0.6 } as const;
const SHADOW = 'rgba(16,10,14,.32)';
const MONO = '"DejaVu Sans Mono", Consolas, "Courier New", monospace';
const SANS = 'system-ui, "Segoe UI", sans-serif';

// Secteur d'anneau (angles en degrés, 0 = vers la droite, sens horaire à l'écran).
function sector(r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${f(Math.cos((a * Math.PI) / 180) * r)},${f(Math.sin((a * Math.PI) / 180) * r)}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(r1, a0)}A${r1},${r1} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
}
const uid = (raw: string): string => `wm-hifi-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;

// 'game' : disque de jeu (étiquette sur presque toute la face) ; 'cart' : cartouche de jeu, couchée, qui ne tourne pas.
export type DiscKind = 'vinyl' | 'cd' | 'game' | 'cart';
// Support d'un jeu selon le gabarit de sa console : cartouche, sinon disque de jeu.
export const gameDiscKind = (format: BoxFormat | undefined): DiscKind => (BOX_FORMATS[format ?? 'generic'].support.kind === 'cart' ? 'cart' : 'game');

// Cartouche dans le carré -60…60 : proportions d'une cartouche Switch (21 × 31), la même taille quel que soit le jeu.
export const HIFI_CART = { w: 50, h: 74 };

// Cartouche couchée sur le poste : coque sombre, stries en haut, étiquette = devant de la version. Jamais tournée ni animée.
function HifiCart({ cover, color, clip }: { cover: string | null; color: string; clip: string }): ReactElement {
  const w = HIFI_CART.w;
  const h = HIFI_CART.h;
  const x = -w / 2;
  const y = -h / 2;
  const label = { x: x + 4, y: y + 13, w: w - 8, h: h - 17 };
  return (
    <g data-hifi-disc="still" data-hifi-cart="">
      <rect x={x + 3} y={y + 4} width={w} height={h} rx={4} fill={SHADOW} />
      <path d={`M${x + 4} ${y} L${x + w - 7} ${y} L${x + w} ${y + 7} L${x + w} ${y + h - 4} Q${x + w} ${y + h} ${x + w - 4} ${y + h} L${x + 4} ${y + h} Q${x} ${y + h} ${x} ${y + h - 4} L${x} ${y + 4} Q${x} ${y} ${x + 4} ${y}Z`} fill="#26262C" {...INK} />
      {[3.5, 6.5, 9.5].map((dy) => <line key={dy} x1={x + 10} y1={y + dy} x2={x + w - 10} y2={y + dy} {...THIN} stroke="#55555F" />)}
      <clipPath id={clip}><rect x={label.x} y={label.y} width={label.w} height={label.h} rx={2} /></clipPath>
      {cover
        ? <image href={cover} x={label.x} y={label.y} width={label.w} height={label.h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        : <rect x={label.x} y={label.y} width={label.w} height={label.h} rx={2} fill={color} />}
      <rect x={label.x} y={label.y} width={label.w} height={label.h} rx={2} fill="none" {...THIN} />
      <path d={`M${f(label.x + label.w * 0.6)} ${label.y} L${f(label.x + label.w * 0.82)} ${label.y} L${f(label.x + label.w * 0.4)} ${label.y + label.h} L${f(label.x + label.w * 0.18)} ${label.y + label.h}Z`} fill="#FFFFFF" opacity={0.18} />
    </g>
  );
}

// ---------- Disque posé ----------
// Dessiné dans un carré -60…60 (le poste le met à l'échelle de son plateau, dans la perspective du dessus). Seul le calque intérieur
// tourne (`transform: rotate`) : le disque reste centré ; l'ombre, le reflet asymétrique et l'axe restent fixes, d'où la rotation lisible.
export function HifiDisc({ cover, color, spinning, kind = 'cd' }: { cover: string | null; color: string; spinning: boolean; kind?: DiscKind }): ReactElement {
  const clip = uid(useId());
  if (kind === 'cart') return <HifiCart cover={cover} color={color} clip={clip} />;
  const vinyl = kind === 'vinyl';
  const lr = vinyl ? 22 : kind === 'game' ? 52 : 40;
  const spin = spinning && !reducedMotion();
  const style: CSSProperties = {
    transformBox: 'fill-box', transformOrigin: 'center',
    ...(spin ? { animation: `wmt-hifi-disc-spin ${vinyl ? 1.8 : 1.2}s linear infinite` } : {}),
  };
  const grooves = vinyl
    ? Array.from({ length: 12 }, (_, i) => 25 + i * 2.8)
    : Array.from({ length: 6 }, (_, i) => 43 + i * 2.6);
  return (
    <g data-hifi-disc={spin ? 'spinning' : 'still'}>
      <style>{'@keyframes wmt-hifi-disc-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
      <circle cx={3} cy={4} r={59} fill={SHADOW} />
      <g data-hifi-disc-spin="" style={style}>
        <circle cx={0} cy={0} r={59} fill={vinyl ? '#141416' : '#D7DCE2'} {...INK} />
        {!vinyl && (
          <>
            {/* Irisations nettes de la face argentée (elles tournent avec le disque). */}
            <path d={sector(lr, 58, 200, 248)} fill="#B8E3F0" opacity={0.65} />
            <path d={sector(lr, 58, 248, 276)} fill="#F2C6E0" opacity={0.6} />
            <path d={sector(lr, 58, 22, 58)} fill="#F7E9A8" opacity={0.55} />
          </>
        )}
        {grooves.map((r) => <circle key={r} cx={0} cy={0} r={f(r)} fill="none" stroke={vinyl ? '#2C2C33' : '#000000'} strokeWidth={0.5} opacity={vinyl ? 1 : 0.1} vectorEffect="non-scaling-stroke" />)}
        <clipPath id={clip}><circle cx={0} cy={0} r={lr} /></clipPath>
        {cover
          ? <image href={cover} x={-lr} y={-lr} width={lr * 2} height={lr * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
          : (
            <>
              <circle cx={0} cy={0} r={lr} fill={color} />
              {/* Repère imprimé sur l'étiquette : sans image, c'est lui qui montre la rotation. */}
              <path d={sector(lr * 0.45, lr * 0.85, -100, -80)} fill="#FFFFFF" opacity={0.7} />
            </>
          )}
        <circle cx={0} cy={0} r={lr} fill="none" {...THIN} />
      </g>
      {/* Reflet asymétrique, fixe : un large éclat d'un côté, un mince de l'autre. */}
      <g data-hifi-disc-glint="" pointerEvents="none">
        <path d={sector(lr + 1, 58, -60, -22)} fill="#FFFFFF" opacity={vinyl ? 0.2 : 0.7} />
        <path d={sector(lr + 1, 58, 132, 142)} fill="#FFFFFF" opacity={vinyl ? 0.12 : 0.4} />
      </g>
      <circle cx={0} cy={0} r={vinyl ? 2.2 : 8} fill={vinyl ? '#D9D3C6' : '#1E1F24'} {...THIN} />
    </g>
  );
}

// ---------- Façade (300 × 120 mm) ----------
// Afficheur bleu-vert qui fait défiler le titre de la piste, voyant vert pendant la lecture, touches, deux petits boutons et la molette du volume.
const FACE_W = 300;
const FACE_H = 120;
export function HifiFace({ w, h, title, playing }: { w: number; h: number; title: string | null; playing: boolean }): ReactElement {
  const clip = uid(useId());
  const marquee = title !== null && !reducedMotion();
  const lit = title !== null;
  const textFill = lit ? '#86F2CF' : '#2D5A4F';
  const fs = 17;
  // Deux copies du titre à la suite : en glissant de la moitié de leur largeur, la boucle ne saute pas.
  const loop = title !== null ? `${title}   •   ` : '';
  const seconds = Math.max(6, Math.round(loop.length * 0.32));
  const keys = [0, 1, 2, 3, 4];
  return (
    <g data-hifi-face="" transform={`scale(${f(w / FACE_W)} ${f(h / FACE_H)})`}>
      <style>{'@keyframes wmt-hifi-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}</style>
      <rect width={FACE_W} height={FACE_H} fill="#2C2C33" />
      {/* Volumes arrondis : arête haute éclairée, arête basse dans l'ombre. */}
      <rect width={FACE_W} height={7} fill="#4B4B56" />
      <rect y={FACE_H - 8} width={FACE_W} height={8} fill="#1B1B21" />
      <rect x={7} y={12} width={286} height={94} rx={9} fill="#393942" {...INK} />
      {/* Afficheur. */}
      <rect x={19} y={23} width={150} height={42} rx={6} fill={SHADOW} />
      <g data-hifi-display="">
      <rect x={16} y={20} width={150} height={42} rx={6} fill="#0D1D1B" {...INK} />
      <clipPath id={clip}><rect x={20} y={22} width={142} height={38} rx={4} /></clipPath>
      <g clipPath={`url(#${clip})`}>
        <g>
          {title === null
            ? <text x={91} y={47} fontSize={fs} fontFamily={MONO} textAnchor="middle" fill={textFill} letterSpacing={2}>-- : --</text>
            : marquee
              ? (
                <g data-hifi-marquee="" style={{ transformBox: 'fill-box', animation: `wmt-hifi-marquee ${seconds}s linear infinite` }}>
                  <text x={34} y={47} fontSize={fs} fontFamily={MONO} fill={textFill} xmlSpace="preserve">{loop + loop}</text>
                </g>
              )
              : <text x={34} y={47} fontSize={fs} fontFamily={MONO} fill={textFill}>{title}</text>}
        </g>
        {/* Lecture ou pause, à gauche de l'afficheur, sur fond pour ne pas être recouvert par le défilement. */}
        <rect x={20} y={22} width={14} height={38} fill="#0D1D1B" />
        {lit && (playing
          ? <path d="M23,35 L31,41 L23,47 Z" fill={textFill} />
          : <path d="M23,35 h3 v12 h-3 Z M28,35 h3 v12 h-3 Z" fill={textFill} />)}
        <rect x={20} y={22} width={142} height={8} fill="#FFFFFF" opacity={0.06} />
      </g>
      </g>
      {/* Voyant. */}
      {playing && <circle cx={180} cy={27} r={8} fill="#5CF08A" opacity={0.3} />}
      <circle data-hifi-led={playing ? 'on' : 'off'} cx={180} cy={27} r={3.6} fill={playing ? '#6CF59A' : '#4A2A2C'} {...THIN} />
      {/* Touches : précédent, lecture, arrêt, suivant, éjecter. */}
      {keys.map((i) => (
        <g key={i} transform={`translate(${16 + i * 30.5} 74)`}>
          <rect x={1} y={1.5} width={26} height={14} rx={5} fill={SHADOW} />
          <rect width={26} height={14} rx={5} fill="#5A5A66" {...THIN} />
          <rect x={3} y={1.5} width={20} height={3} rx={1.5} fill="#FFFFFF" opacity={0.18} />
          <path d={['M8,7 L13,4 L13,10 Z M13,7 L18,4 L18,10 Z', 'M10,4 L17,7 L10,10 Z', 'M10,4.5 h6 v5 h-6 Z', 'M8,4 L13,7 L8,10 Z M13,4 L18,7 L13,10 Z', 'M9,8 L13,4 L17,8 Z M9,9.3 h8 v1.3 h-8 Z'][i]} fill="#D9DAE2" />
        </g>
      ))}
      {/* Petits boutons (graves, aigus). */}
      {[194, 218].map((x) => (
        <g key={x}>
          <circle cx={x + 1.2} cy={86} r={8} fill={SHADOW} />
          <circle cx={x} cy={84.5} r={8} fill="#7D808A" {...THIN} />
          <circle cx={x} cy={84.5} r={5} fill="#9A9DA7" />
          <line x1={x} y1={78.5} x2={x} y2={82} stroke={INK_C} strokeWidth={1.4} strokeLinecap="round" />
        </g>
      ))}
      {/* Prise casque. */}
      <circle cx={196} cy={50} r={4.2} fill="#16161B" {...THIN} />
      <circle cx={196} cy={50} r={1.6} fill="#9A9DA7" />
      {/* Molette du volume : couronne moletée, chapeau d'aluminium, repère. */}
      <circle cx={258} cy={63} r={35} fill={SHADOW} />
      <circle cx={255} cy={59} r={35} fill="#1E1E24" {...INK} />
      {Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2;
        return <line key={i} x1={f(255 + Math.cos(a) * 30)} y1={f(59 + Math.sin(a) * 30)} x2={f(255 + Math.cos(a) * 34)} y2={f(59 + Math.sin(a) * 34)} stroke="#4C4C57" strokeWidth={1.4} />;
      })}
      <circle cx={255} cy={59} r={27} fill="#A5A8B2" {...THIN} />
      <circle cx={255} cy={59} r={20} fill="none" stroke="#BEC1CA" strokeWidth={1.5} />
      <path d="M236,48 A22,22 0 0 1 262,38 L259,44 A16,16 0 0 0 241,51 Z" fill="#FFFFFF" opacity={0.35} />
      <circle cx={f(255 + Math.cos(-2.2) * 19)} cy={f(59 + Math.sin(-2.2) * 19)} r={2.6} fill={INK_C} />
      <text x={91} y={100} fontSize={7} fontFamily={SANS} fontWeight={700} textAnchor="middle" fill="#8F909B" letterSpacing={3}>WIKIMASTERS</text>
    </g>
  );
}

// ---------- Dessus (300 × 260 mm ; haut = fond du poste, bas = avant) ----------
// Platine (plinthe de noyer, plateau d'aluminium, couvre-plateau, bras de lecture) à gauche ; puits CD à chargement par le haut
// sous un couvercle fumé à droite. Un vinyle se pose sur la platine, tout autre disque dans le puits (couvercle levé).
const TOP_W = 300;
const TOP_H = 260;
const PLATTER = { cx: 104, cy: 132, r: 90 };
const WELL = { cx: 252, cy: 178, r: 34 };
export type HifiDiscShow = { kind: DiscKind; cover: string | null; color: string };
export function HifiTop({ w, h, disc, spinning }: { w: number; h: number; disc: HifiDiscShow | null; spinning: boolean }): ReactElement {
  const onPlatter = disc?.kind === 'vinyl';
  const inWell = disc !== null && !onPlatter;
  // Bras : posé sur le disque quand un vinyle est sur la platine, sinon sur son repose-bras.
  const pivot = { x: 182, y: 36 };
  const tip = onPlatter ? { x: 136, y: 178 } : { x: 188, y: 198 };
  const ang = Math.atan2(tip.y - pivot.y, tip.x - pivot.x);
  const deg = f((ang * 180) / Math.PI);
  return (
    <g data-hifi-top="" transform={`scale(${f(w / TOP_W)} ${f(h / TOP_H)})`}>
      <rect width={TOP_W} height={TOP_H} fill="#34343C" />
      {/* Arêtes arrondies : avant éclairé, côtés dans l'ombre. */}
      <rect y={TOP_H - 9} width={TOP_W} height={9} fill="#4A4A55" />
      <rect width={6} height={TOP_H} fill="#26262D" />
      <rect x={TOP_W - 6} width={6} height={TOP_H} fill="#26262D" />
      {/* Plinthe de la platine. */}
      <rect x={12} y={14} width={198} height={234} rx={12} fill="#1D1A18" opacity={0.45} transform="translate(2.5 3)" />
      <rect x={12} y={14} width={198} height={234} rx={12} fill="#6A5240" {...INK} />
      <rect x={18} y={20} width={186} height={10} rx={5} fill="#7E6450" />
      {/* Plateau. */}
      <g data-hifi-platter="" data-cx={PLATTER.cx} data-cy={PLATTER.cy}>
        <circle cx={PLATTER.cx + 3} cy={PLATTER.cy + 4} r={PLATTER.r} fill={SHADOW} />
        <circle cx={PLATTER.cx} cy={PLATTER.cy} r={PLATTER.r} fill="#A9ADB5" {...INK} />
        {/* Points stroboscopiques du bord. */}
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          return <circle key={i} cx={f(PLATTER.cx + Math.cos(a) * (PLATTER.r - 3.5))} cy={f(PLATTER.cy + Math.sin(a) * (PLATTER.r - 3.5))} r={1.3} fill="#5D6068" />;
        })}
        <circle cx={PLATTER.cx} cy={PLATTER.cy} r={PLATTER.r - 8} fill="#232327" {...THIN} />
        {[0.45, 0.65, 0.85].map((k) => <circle key={k} cx={PLATTER.cx} cy={PLATTER.cy} r={f((PLATTER.r - 8) * k)} fill="none" stroke="#303036" strokeWidth={1.2} />)}
        <circle cx={PLATTER.cx} cy={PLATTER.cy} r={3.2} fill="#C9CCD3" {...THIN} />
      </g>
      {onPlatter && (
        <g data-hifi-disc-at="platter" transform={`translate(${PLATTER.cx} ${PLATTER.cy}) scale(${f((PLATTER.r - 6) / 60)})`}>
          <HifiDisc kind="vinyl" cover={disc.cover} color={disc.color} spinning={spinning} />
        </g>
      )}
      {/* Vitesses 33 / 45. */}
      {[26, 50].map((x, i) => (
        <g key={x}>
          <rect x={x} y={232} width={18} height={9} rx={3} fill={i === 0 && onPlatter ? '#E9C46A' : '#3A322C'} {...THIN} />
        </g>
      ))}
      {/* Repose-bras, contrepoids, pivot et bras. */}
      <circle cx={190} cy={200} r={5.5} fill="#2A2A30" {...THIN} />
      <g data-hifi-tonearm={onPlatter ? 'play' : 'rest'}>
        <g transform={`translate(${pivot.x} ${pivot.y}) rotate(${deg})`}>
          <rect x={-26} y={-6} width={14} height={12} rx={3} fill="#3B3B44" {...THIN} />
        </g>
        <line x1={pivot.x} y1={pivot.y} x2={tip.x} y2={tip.y} stroke={INK_C} strokeWidth={6} strokeLinecap="round" />
        <line x1={pivot.x} y1={pivot.y} x2={tip.x} y2={tip.y} stroke="#D3D6DD" strokeWidth={3.2} strokeLinecap="round" />
        <g transform={`translate(${tip.x} ${tip.y}) rotate(${deg})`}>
          <rect x={-4} y={-6} width={16} height={12} rx={2} fill="#2F2F36" {...THIN} />
          <rect x={10} y={-2} width={7} height={4} rx={1} fill="#D3D6DD" {...THIN} />
        </g>
        <circle cx={pivot.x + 1.5} cy={pivot.y + 2} r={13} fill={SHADOW} />
        <circle cx={pivot.x} cy={pivot.y} r={13} fill="#9DA1AA" {...INK} />
        <circle cx={pivot.x} cy={pivot.y} r={6} fill="#C9CCD3" {...THIN} />
      </g>
      {/* Ouïes d'aération. */}
      {[22, 32, 42, 52].map((y) => <rect key={y} x={222} y={y} width={60} height={4} rx={2} fill="#1E1E24" />)}
      {/* Puits CD. */}
      <g data-hifi-well="" data-cx={WELL.cx} data-cy={WELL.cy}>
        <rect x={216} y={142} width={72} height={74} rx={8} fill="#26262D" {...THIN} />
        <circle cx={WELL.cx} cy={WELL.cy} r={WELL.r} fill="#121215" {...INK} />
        <circle cx={WELL.cx} cy={WELL.cy} r={WELL.r - 5} fill="none" stroke="#25252B" strokeWidth={1.2} />
        <circle cx={WELL.cx} cy={WELL.cy} r={7} fill="#7A7D86" {...THIN} />
      </g>
      {inWell && (
        <g data-hifi-disc-at="well" transform={`translate(${WELL.cx} ${WELL.cy}) scale(${f((WELL.r - 2) / 60)})`}>
          <HifiDisc kind={disc.kind} cover={disc.cover} color={disc.color} spinning={spinning} />
        </g>
      )}
      {/* Couvercle fumé : levé vers le fond quand un disque est dans le puits, sinon fermé dessus. */}
      <g data-hifi-lid={inWell ? 'open' : 'closed'}>
        {inWell
          ? (
            <>
              <rect x={216} y={70} width={72} height={70} rx={6} fill="#15151C" opacity={0.6} {...INK} />
              <path d="M226,128 L246,78 L256,78 L236,128 Z" fill="#FFFFFF" opacity={0.18} />
            </>
          )
          : (
            <>
              <rect x={216} y={142} width={72} height={74} rx={8} fill="#15151C" opacity={0.55} {...INK} />
              <path d="M226,206 L250,150 L260,150 L236,206 Z" fill="#FFFFFF" opacity={0.18} />
            </>
          )}
        <rect x={222} y={138} width={60} height={5} rx={2} fill="#4A4A55" {...THIN} />
      </g>
      <rect x={240} y={226} width={24} height={9} rx={4} fill="#5A5A66" {...THIN} />
    </g>
  );
}

// ---------- Grille d'une enceinte (130 × 180 mm, façade) ----------
// Tissu tendu sur le cadre de noyer ; haut-parleurs devinés au travers.
export function HifiGrille({ w, h }: { w: number; h: number }): ReactElement {
  const GW = 130;
  const GH = 180;
  return (
    <g data-hifi-grille="" transform={`scale(${f(w / GW)} ${f(h / GH)})`}>
      <rect width={GW} height={GH} fill="#4A3B2F" />
      <rect width={GW} height={6} fill="#61503F" />
      <rect y={GH - 6} width={GW} height={6} fill="#33281F" />
      <rect x={12} y={14} width={GW - 24} height={GH - 30} rx={10} fill="#2F2D33" {...INK} />
      {/* Trame du tissu. */}
      {Array.from({ length: 24 }, (_, i) => <line key={`h${i}`} x1={14} x2={GW - 14} y1={f(20 + i * 6)} y2={f(20 + i * 6)} stroke="#3B3940" strokeWidth={1.4} />)}
      {Array.from({ length: 16 }, (_, i) => <line key={`v${i}`} y1={16} y2={GH - 18} x1={f(19 + i * 6)} x2={f(19 + i * 6)} stroke="#26242A" strokeWidth={0.8} />)}
      <circle cx={GW / 2} cy={50} r={15} fill="#FFFFFF" opacity={0.06} />
      <circle cx={GW / 2} cy={112} r={36} fill="#FFFFFF" opacity={0.06} />
      <circle cx={GW / 2} cy={112} r={20} fill="#000000" opacity={0.12} />
      <rect x={GW / 2 - 12} y={GH - 26} width={24} height={6} rx={2} fill="#B9A27E" {...THIN} />
    </g>
  );
}

// ---------- Contenu du modèle 3D ----------
// `title` : piste en cours (afficheur) ; `disc` : disque posé sur ce poste. La clé ne change qu'avec ce qui change le dessin.
export type HifiShow = { disc: HifiDiscShow | null; spinning: boolean; title: string | null; playing: boolean };
export function hifiContent(show: HifiShow): ItemContent {
  const d = show.disc;
  return {
    face: { key: `hifi|${show.title ?? ''}|${show.playing}`, draw: (w, h) => <HifiFace w={w} h={h} title={show.title} playing={show.playing} /> },
    top: { key: `hifi|${d ? `${d.kind}|${d.cover ?? ''}|${d.color}` : ''}|${show.spinning}`, draw: (w, h) => <HifiTop w={w} h={h} disc={d} spinning={show.spinning} /> },
  };
}

// ---------- Pochette couchée devant le poste ----------
type Pt = [number, number];
// Enveloppe convexe (chaîne monotone) : la pochette vue en ¾ avec son épaisseur.
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]): Pt[] => {
    const out: Pt[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}
const ptsOf = (list: Pt[]): string => list.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
const EDGE: Record<SleeveKind, string> = { cd: '#C9D2D8', dvd: '#1F2B57', game: '#1E1E24', book: '#EFE6D2', vinyl: '#D8CDB8' };

// `top` et `bottom` : coins projetés (px de la pièce), fond gauche, fond droit, avant droit, avant gauche ; `w` × `d` : taille posée (cm).
export function SleeveArt({ top, bottom, w, d, kind, cover, color, title }: { top: Pt[]; bottom: Pt[]; w: number; d: number; kind: SleeveKind; cover: string | null; color: string; title: string }): ReactElement {
  const clip = uid(useId());
  const [tl, tr, , bl] = top as [Pt, Pt, Pt, Pt];
  const W = 100;
  const H = f((100 * d) / w);
  const m = `matrix(${f((tr[0] - tl[0]) / W)} ${f((tr[1] - tl[1]) / W)} ${f((bl[0] - tl[0]) / H)} ${f((bl[1] - tl[1]) / H)} ${f(tl[0])} ${f(tl[1])})`;
  const body = hull([...top, ...bottom]);
  // Marge de la couverture : charnière d'un boîtier cristal à gauche, bord d'un boîtier DVD ou de jeu ; pleine page pour un vinyle ou un livre.
  const inset = kind === 'cd' ? { l: 9, r: 3, t: 3 } : kind === 'dvd' || kind === 'game' ? { l: 3, r: 3, t: 3 } : { l: 0, r: 0, t: 0 };
  const band = kind === 'game' ? H * 0.09 : 0;
  const [ix, iy, iw, ih] = [inset.l, inset.t + band, W - inset.l - inset.r, H - 2 * inset.t - band];
  return (
    <>
      <polygon points={ptsOf(hull([...bottom].map(([x, y]) => [x + 2, y + 1.6] as Pt)))} fill={SHADOW} pointerEvents="none" />
      <polygon points={ptsOf(body)} fill={EDGE[kind]} {...INK} />
      <polygon data-hifi-sleeve-top="" points={ptsOf(top)} fill={kind === 'cd' ? '#E9EEF2' : kind === 'dvd' ? '#1F2B57' : kind === 'game' ? '#E24B4A' : color} />
      <g transform={m}>
        <clipPath id={clip}><rect x={f(ix)} y={f(iy)} width={f(iw)} height={f(ih)} /></clipPath>
        {cover
          ? <image href={cover} x={f(ix)} y={f(iy)} width={f(iw)} height={f(ih)} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
          : (
            <>
              <rect x={f(ix)} y={f(iy)} width={f(iw)} height={f(ih)} fill={color} />
              <text x={f(ix + iw / 2)} y={f(iy + ih / 2)} fontSize={f(Math.min(iw, ih) * 0.13)} fontFamily={SANS} fontWeight={700} textAnchor="middle" fill="#FFFFFF">{title.length > 14 ? `${title.slice(0, 13)}…` : title}</text>
            </>
          )}
        {kind === 'cd' && (
          <>
            <rect width={6} height={H} fill="#FFFFFF" opacity={0.5} />
            <polygon points={`${f(W * 0.5)},0 ${f(W * 0.72)},0 ${f(W * 0.38)},${H} ${f(W * 0.16)},${H}`} fill="#FFFFFF" opacity={0.22} />
          </>
        )}
        {kind === 'vinyl' && <circle cx={W * 0.82} cy={H * 0.5} r={H * 0.42} fill="none" stroke="#000000" strokeWidth={1.2} opacity={0.12} />}
        {kind === 'book' && <rect width={5} height={H} fill="#000000" opacity={0.18} />}
      </g>
      <polygon points={ptsOf(top)} fill="none" {...INK} />
    </>
  );
}

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { CELL_W, SECTION } from '../core/library/room-grid';

const CUIVRE = '#B87333';
const REFLET = '#E3A272';
const LAITON = '#C9A24B';
const LAITON_SOMBRE = '#8A6A22';

// Vrai quand la personne a demandé moins de mouvement : aucune animation n'est alors rendue.
function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Rond denté : disque, huit dents en rotation et moyeu ; il tourne en `dur` secondes, dans un sens ou dans l'autre.
function Gear({ cx, cy, r, dur, reverse, motion }: { cx: number; cy: number; r: number; dur: number; reverse: boolean; motion: boolean }): ReactElement {
  const tooth = r * 0.45;
  return (
    <g data-gear>
      <circle cx={cx} cy={cy} r={r} fill={LAITON} stroke={LAITON_SOMBRE} strokeWidth={1.5} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={cx - tooth / 2} y={cy - r - tooth * 0.6} width={tooth} height={tooth} fill={LAITON} stroke={LAITON_SOMBRE} strokeWidth={1} transform={`rotate(${i * 45} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.35} fill={LAITON_SOMBRE} />
      {motion && (
        <animateTransform attributeName="transform" type="rotate" from={`${reverse ? 360 : 0} ${cx} ${cy}`} to={`${reverse ? 0 : 360} ${cx} ${cy}`} dur={`${dur}s`} repeatCount="indefinite" />
      )}
    </g>
  );
}

// Volute de vapeur : trois cercles qui montent de 28 px en 3 s en s'effaçant, décalés d'une seconde.
function Steam({ x, y, motion }: { x: number; y: number; motion: boolean }): ReactElement {
  return (
    <g data-steam>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x} cy={y} r={4 + i * 1.5} fill="#FFFFFF" opacity={motion ? 0.5 : 0.35}>
          {motion && (
            <>
              <animate attributeName="cy" values={`${y};${y - 28}`} dur="3s" begin={`${i}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.55;0" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
            </>
          )}
        </circle>
      ))}
    </g>
  );
}

function Valve({ cx, cy }: { cx: number; cy: number }): ReactElement {
  return (
    <g data-valve>
      <circle cx={cx} cy={cy} r={7} fill="none" stroke={LAITON} strokeWidth={2} />
      {[0, 45, 90, 135].map((a) => (
        <line key={a} x1={cx - 7} y1={cy} x2={cx + 7} y2={cy} stroke={LAITON} strokeWidth={1.5} transform={`rotate(${a} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r={2} fill={LAITON_SOMBRE} />
    </g>
  );
}

// Manomètre : l'aiguille oscille de ±35° autour de -20°.
function Gauge({ cx, cy, motion }: { cx: number; cy: number; motion: boolean }): ReactElement {
  return (
    <g data-gauge>
      <circle cx={cx} cy={cy} r={20} fill="#F1E6C8" stroke={LAITON} strokeWidth={4} />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1={cx} y1={cy - 16} x2={cx} y2={cy - 12} stroke="#3A2A12" strokeWidth={1} transform={`rotate(${-120 + i * 30} ${cx} ${cy})`} />
      ))}
      <line x1={cx} y1={cy} x2={cx} y2={cy - 14} stroke="#A32D2D" strokeWidth={2} strokeLinecap="round" transform={`rotate(-20 ${cx} ${cy})`}>
        {motion && <animateTransform attributeName="transform" type="rotate" values={`-55 ${cx} ${cy};15 ${cx} ${cy};-55 ${cx} ${cy}`} dur="6s" repeatCount="indefinite" />}
      </line>
      <circle cx={cx} cy={cy} r={2.5} fill="#3A2A12" />
    </g>
  );
}

// Horloge à l'heure : minutes = 6 × m, heures = 30 × (h % 12) + m / 2.
function Clock({ cx, cy, now }: { cx: number; cy: number; now: Date }): ReactElement {
  const m = now.getMinutes();
  const minute = 6 * m;
  const hour = 30 * (now.getHours() % 12) + m / 2;
  return (
    <g data-clock>
      <circle cx={cx} cy={cy} r={26} fill="#F1E6C8" stroke={LAITON} strokeWidth={4} />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1={cx} y1={cy - 22} x2={cx} y2={cy - (i % 3 === 0 ? 17 : 19)} stroke="#3A2A12" strokeWidth={i % 3 === 0 ? 2 : 1} transform={`rotate(${i * 30} ${cx} ${cy})`} />
      ))}
      <line data-hand="hour" x1={cx} y1={cy} x2={cx} y2={cy - 12} stroke="#3A2A12" strokeWidth={3} strokeLinecap="round" transform={`rotate(${hour} ${cx} ${cy})`} />
      <line data-hand="minute" x1={cx} y1={cy} x2={cx} y2={cy - 18} stroke="#3A2A12" strokeWidth={2} strokeLinecap="round" transform={`rotate(${minute} ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={2.5} fill="#A32D2D" />
    </g>
  );
}

// Décor animé du mur Steampunk : tuyaux de cuivre, vapeur, engrenages, manomètre et horloge, répétés par section.
export function SteampunkDecor({ cols, wallH, now = () => new Date() }: { cols: number; wallH: number; now?: () => Date }): ReactElement {
  const motion = !reducedMotion();
  const groupRef = useRef<SVGGElement>(null);
  const [, setTick] = useState(0);
  const sectionW = SECTION * CELL_W;
  const sections = Math.max(1, Math.floor(cols / SECTION));
  const width = cols * CELL_W;

  // L'heure de l'horloge se rafraîchit toutes les 30 s, sauf quand l'onglet est caché.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setTick((n) => n + 1);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Onglet caché : les animations SMIL sont mises en pause (jsdom n'implémente pas ces méthodes).
  useEffect(() => {
    const svg = groupRef.current?.ownerSVGElement;
    if (!svg) return;
    const sync = () => {
      if (document.hidden) {
        if (typeof svg.pauseAnimations === 'function') svg.pauseAnimations();
      } else {
        if (typeof svg.unpauseAnimations === 'function') svg.unpauseAnimations();
        setTick((n) => n + 1); // l'horloge n'est plus périmée au retour sur l'onglet
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const date = now();
  const clockSection = sections > 1 ? 1 : 0;
  const parts: ReactElement[] = [];
  // Tuyau de plafond et ses brides.
  parts.push(
    <g key="ceiling" data-pipe="ceiling">
      <rect x={0} y={12} width={width} height={10} fill={CUIVRE} />
      <rect x={0} y={13} width={width} height={3} fill={REFLET} />
      {Array.from({ length: Math.floor(width / 90) }, (_, i) => (
        <rect key={i} x={i * 90 + 40} y={10} width={6} height={14} fill={LAITON_SOMBRE} />
      ))}
    </g>,
  );
  for (let i = 0; i < sections; i++) {
    const x0 = i * sectionW;
    const pipeX = x0 + 24;
    const valveY = wallH * 0.45;
    parts.push(
      <g key={`section-${i}`} data-section={i}>
        <g data-pipe="vertical">
          <rect x={pipeX} y={22} width={9} height={wallH - 8 - 22} fill={CUIVRE} />
          <rect x={pipeX + 1.5} y={22} width={2.5} height={wallH - 8 - 22} fill={REFLET} />
        </g>
        <Valve cx={pipeX + 4.5} cy={valveY} />
        <Steam x={pipeX + 4.5} y={valveY - 12} motion={motion} />
        <Gear cx={x0 + 96} cy={70} r={18} dur={20} reverse={false} motion={motion} />
        <Gear cx={x0 + 96 + 27} cy={96} r={11} dur={13} reverse motion={motion} />
        {(sections === 1 ? i === 0 : i % 2 === 1) && <Gauge cx={x0 + 250} cy={80} motion={motion} />}
        {i === clockSection && <Clock cx={x0 + 170} cy={62} now={date} />}
      </g>,
    );
  }
  return (
    <g ref={groupRef} data-steampunk-decor style={{ pointerEvents: 'none' }}>
      {parts}
    </g>
  );
}

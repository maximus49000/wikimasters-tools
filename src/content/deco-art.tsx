// Dessin provisoire Opus : Fable n'est pas passé (gel jusqu'au 2026-10-17), reprise Fable prévue.
import { useEffect, useMemo, useReducer, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { NEON_COLORS, isPanel } from '../core/library/deco';
import { BAROMETER_ANGLE, iconOf, type DecoWeather } from '../core/library/deco-weather';
import type { DecoPlaced, StyleId, WeatherState } from '../core/library/library-types';
import { decoSizeOf, type PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';
import { fitText } from '../core/library/text-fit';
import { PANEL_FONTS, ensureDecoFonts, measureWith } from './deco-fonts';

// Horloges, météomètres et panneaux du mur, portés de la maquette validée (docs/superpowers/maquettes/horloges-meteo-panneau) :
// dessin en cm comme la maquette, mis à l'échelle de la case de l'objet (aplats, trait encré, ombre nette décalée).

// Ce que montrent les objets : heure (de la scène ou de la ville choisie), ville, météo du visuel, lumière du jour (0 nuit … 1 jour), mode Aménager.
// `time.live` : heure réelle (l'aiguille des minutes glisse avec les secondes) ; absent ou faux : heure figée, aiguille immobile.
export type DecoView = { time: { h: number; m: number; s: number; live?: boolean }; city?: string; weather: DecoWeather; daylight: number; editing: boolean };

// ---------- Outils (ceux de la maquette) ----------
const f = (n: number): number => Math.round(n * 100) / 100;
const R = (x: number, y: number, w: number, h: number, r = 0): string => {
  r = Math.min(r, w / 2, h / 2);
  return r
    ? `M${f(x + r)},${f(y)}H${f(x + w - r)}Q${f(x + w)},${f(y)} ${f(x + w)},${f(y + r)}V${f(y + h - r)}Q${f(x + w)},${f(y + h)} ${f(x + w - r)},${f(y + h)}H${f(x + r)}Q${f(x)},${f(y + h)} ${f(x)},${f(y + h - r)}V${f(y + r)}Q${f(x)},${f(y)} ${f(x + r)},${f(y)}Z`
    : `M${f(x)},${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
};
const E = (cx: number, cy: number, rx: number, ry = rx): string =>
  `M${f(cx - rx)},${f(cy)}A${f(rx)},${f(ry)} 0 1 0 ${f(cx + rx)},${f(cy)}A${f(rx)},${f(ry)} 0 1 0 ${f(cx - rx)},${f(cy)}Z`;
const rgb = (c: string): number[] => {
  const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1, 7);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
// Mélange de deux couleurs (k de la première), à la place de color-mix (pas sûr sur le WebView Android 113).
export const mix = (a: string, b: string, k: number): string => {
  const [p, q] = [rgb(a), rgb(b)];
  return `#${p.map((v, i) => Math.round(v * k + (q[i] ?? 0) * (1 - k)).toString(16).padStart(2, '0')).join('')}`;
};
const shade = (c: string, k = 0.72): string => mix(c, '#2E2A66', k);
const light = (c: string, k = 0.7): string => mix(c, '#FFFFFF', k);
const pad = (n: number): string => String(n).padStart(2, '0');
const hhmm = (t: { h: number; m: number }): string => `${pad(t.h)}:${pad(t.m)}`;
const rad = (deg: number): number => (deg * Math.PI) / 180;

const INK = { stroke: '#3A2620', strokeWidth: 1.3, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const THIN = { ...INK, strokeWidth: 0.7 } as const;
const OSWALD = `"${PANEL_FONTS['panel-letter'].family}", ${PANEL_FONTS['panel-letter'].fallback}`;
const SANS = 'system-ui, "Segoe UI", sans-serif';
const SERIF = 'Georgia, serif';

// Aplat + trait encré + ombre nette décalée (style cellulo).
function Flat({ d, fill, thin = false, shadow = true }: { d: string; fill: string; thin?: boolean; shadow?: boolean }): ReactElement {
  return (
    <>
      {shadow && <path d={d} fill="rgba(30,20,40,.22)" transform="translate(1.1 1.4)" />}
      <path d={d} fill={fill} {...(thin ? THIN : INK)} />
    </>
  );
}

type TxtOpts = { family?: string; weight?: number; anchor?: 'start' | 'middle' | 'end'; spacing?: number; opacity?: number; transform?: string; glow?: string; city?: true };
function Txt({ x, y, s, fill, children, o = {} }: { x: number; y: number; s: number; fill: string; children: ReactNode; o?: TxtOpts }): ReactElement {
  const common = { x: f(x), y: f(y), fontSize: f(s), fontFamily: o.family ?? SANS, fontWeight: o.weight ?? 600, textAnchor: o.anchor ?? 'middle', dominantBaseline: 'middle', letterSpacing: o.spacing, transform: o.transform } as const;
  return (
    <>
      {/* Lueur : même texte, trait épais translucide dessous (pas de filtre, coûteux sur Android). */}
      {o.glow && <text {...common} fill={o.glow} stroke={o.glow} strokeWidth={f(s * 0.18)} opacity={0.35}>{children}</text>}
      <text {...common} fill={fill} opacity={o.opacity} {...(o.city ? { 'data-city': '' } : {})}>
        {children}
      </text>
    </>
  );
}

// Dessin en cm (W × H) mis à l'échelle de `rect` sans déformation, centré.
function Frame({ rect, W, H, children, attrs }: { rect: PxRect; W: number; H: number; children: ReactNode; attrs: Record<string, string | number> }): ReactElement {
  const k = Math.min(rect.w / W, rect.h / H);
  const x = rect.x + (rect.w - W * k) / 2;
  const y = rect.y + (rect.h - H * k) / 2;
  return (
    <g {...attrs} transform={`translate(${f(x)} ${f(y)}) scale(${k})`}>
      {children}
    </g>
  );
}
const timeAttrs = (t: DecoView['time']): Record<string, string | number> => ({ 'data-time': hhmm(t), 'data-seconds': t.s });

// ---------- Aiguilles ----------
function Hands({ cx, cy, r, t, ink = '#2A211C', sec = '#D8432F' }: { cx: number; cy: number; r: number; t: DecoView['time']; ink?: string; sec?: string }): ReactElement {
  const hand = (a: number, len: number, w: number, col: string, tail = 0.12): ReactElement => {
    const ra = rad(a - 90);
    return <line x1={f(cx - Math.cos(ra) * r * tail)} y1={f(cy - Math.sin(ra) * r * tail)} x2={f(cx + Math.cos(ra) * r * len)} y2={f(cy + Math.sin(ra) * r * len)} stroke={col} strokeWidth={f(w)} strokeLinecap="round" />;
  };
  return (
    <>
      {hand(((t.h % 12) + t.m / 60) * 30, 0.5, r * 0.085, ink)}
      {hand((t.m + (t.live ? t.s / 60 : 0)) * 6, 0.76, r * 0.055, ink)}
      {hand(Math.floor(t.s) * 6, 0.84, r * 0.022, sec, 0.2)}
      <circle cx={f(cx)} cy={f(cy)} r={f(r * 0.06)} fill={sec} {...THIN} />
    </>
  );
}

// ---------- Horloge murale à aiguilles (Ø 32 cm) ----------
const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
type ObjProps = { rect: PxRect; style: StyleId; palette: Palette; view: DecoView };

export function WallClock({ rect, style: k, palette: p, view }: ObjProps): ReactElement {
  const r = 16, cx = r, cy = r, t = view.time;
  let ring = p.woodDark, face = '#FBF7EE', numC = '#2A211C', sec = '#D8432F', handC = '#2A211C';
  if (k === 'moderne') { ring = '#2A2E33'; face = '#FFFFFF'; }
  if (k === 'industriel') { ring = '#3A3A38'; face = '#EFE8D8'; sec = '#C0392B'; }
  if (k === 'japandi') { ring = p.wood; face = '#F6F1E6'; }
  if (k === 'neon') { ring = '#0F0F22'; face = '#0B0B1E'; numC = '#00E5FF'; handC = '#E6E6FF'; sec = '#FF4FD8'; }
  if (k === 'steampunk') { ring = '#B87333'; face = '#F1E3C2'; sec = '#8C2A1B'; }
  if (k === 'retro70') face = '#FFF4D6';
  const ticks: ReactElement[] = [];
  for (let i = 0; i < 60; i++) {
    if (k === 'japandi' && i % 15) continue;
    const a = rad(i * 6), big = i % 5 === 0;
    ticks.push(<line key={i} x1={f(cx + Math.sin(a) * r * 0.78)} y1={f(cy - Math.cos(a) * r * 0.78)} x2={f(cx + Math.sin(a) * r * (big ? 0.68 : 0.74))} y2={f(cy - Math.cos(a) * r * (big ? 0.68 : 0.74))} stroke={numC} strokeWidth={big ? 0.55 : 0.22} />);
  }
  const at = (deg: number, k2: number): [number, number] => [cx + Math.sin(rad(deg)) * r * k2, cy - Math.cos(rad(deg)) * r * k2];
  return (
    <Frame rect={rect} W={32} H={32} attrs={{ 'data-deco': 'wall-clock', ...timeAttrs(t) }}>
      {k === 'retro70' ? (
        <>
          {/* Horloge soleil : rayons dorés. */}
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i * Math.PI) / 12, l = i % 2 ? r * 1.25 : r * 1.45;
            return <line key={i} x1={f(cx + Math.cos(a) * r * 0.9)} y1={f(cy + Math.sin(a) * r * 0.9)} x2={f(cx + Math.cos(a) * l)} y2={f(cy + Math.sin(a) * l)} stroke="#C9962E" strokeWidth={1.1} strokeLinecap="round" />;
          })}
          <Flat d={E(cx, cy, r * 0.92)} fill="#C9962E" />
        </>
      ) : (
        <Flat d={E(cx, cy, r)} fill={ring} />
      )}
      <path d={E(cx, cy, r * 0.84)} fill={face} {...THIN} />
      {k === 'neon' && (
        <>
          <path d={E(cx, cy, r * 0.9)} fill="none" stroke="#00E5FF" strokeWidth={2.4} opacity={0.35} />
          <path d={E(cx, cy, r * 0.9)} fill="none" stroke="#00E5FF" strokeWidth={0.9} />
        </>
      )}
      {k === 'industriel' && [45, 135, 225, 315].map((a) => <circle key={a} cx={f(cx + Math.cos(rad(a)) * r * 0.92)} cy={f(cy + Math.sin(rad(a)) * r * 0.92)} r={0.7} fill="#8A8A88" />)}
      {ticks}
      {(k === 'steampunk' || k === 'boheme') &&
        ROMAN.map((n, i) => {
          const [x, y] = at(i * 30, 0.55);
          return <Txt key={n} x={x} y={y} s={r * 0.13} fill={numC} o={{ family: SERIF, weight: 500 }}>{n}</Txt>;
        })}
      {k !== 'steampunk' && k !== 'boheme' && k !== 'japandi' && k !== 'moderne' &&
        [12, 3, 6, 9].map((n, i) => {
          const [x, y] = at(i * 90, 0.55);
          return <Txt key={n} x={x} y={y} s={r * 0.17} fill={numC} o={{ family: k === 'neon' ? OSWALD : SANS }}>{n}</Txt>;
        })}
      {view.city && <Txt x={cx} y={cy + r * 0.3} s={r * 0.11} fill={numC} o={{ weight: 700, spacing: 0.3, city: true }}>{view.city.toUpperCase()}</Txt>}
      {k === 'steampunk' && <circle cx={cx} cy={cy} r={f(r * 0.2)} fill="none" stroke="#B87333" strokeWidth={0.5} strokeDasharray=".9 .5" />}
      <Hands cx={cx} cy={cy} r={r} t={t} ink={handC} sec={sec} />
    </Frame>
  );
}

// ---------- Afficheur 7 segments ----------
const SEGS: Record<string, string> = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };
function digitPaths(x: number, y: number, s: number, ch: string): [string, string] {
  const w = 6 * s, h = 10 * s, t = 1.15 * s, g = 0.25 * s;
  const seg: Record<string, [number, number, number, number]> = {
    a: [x + t * 0.7, y, w - 1.4 * t, t], d: [x + t * 0.7, y + h - t, w - 1.4 * t, t], g: [x + t * 0.7, y + h / 2 - t / 2, w - 1.4 * t, t],
    f: [x, y + t * 0.5 + g, t, h / 2 - t - g], b: [x + w - t, y + t * 0.5 + g, t, h / 2 - t - g],
    e: [x, y + h / 2 + t * 0.5, t, h / 2 - t - g], c: [x + w - t, y + h / 2 + t * 0.5, t, h / 2 - t - g],
  };
  const lit = SEGS[ch] ?? '';
  let on = '', off = '';
  for (const [k, [sx, sy, sw, sh]] of Object.entries(seg)) {
    if (lit.includes(k)) on += R(sx, sy, sw, sh, t / 2);
    else off += R(sx, sy, sw, sh, t / 2);
  }
  return [on, off];
}
const sevenWidth = (s: number): number => 4 * 6 * s + 1.6 * s * 2.6 + 3 * s;
// Heure HH:MM en 7 segments ; les deux points sont allumés quand la seconde est paire. Lueur : segments allumés repassés en trait épais translucide.
function Seven({ x, y, s, t, on, off, glow = true }: { x: number; y: number; s: number; t: DecoView['time']; on: string; off: string; glow?: boolean }): ReactElement {
  const hh = pad(t.h), mm = pad(t.m);
  const w = 6 * s, gap = 1.6 * s, col = 3 * s;
  const x2 = x + 2 * w + gap + col + gap * 0.6;
  const digits = [digitPaths(x, y, s, hh.charAt(0)), digitPaths(x + w + gap, y, s, hh.charAt(1)), digitPaths(x2, y, s, mm.charAt(0)), digitPaths(x2 + w + gap, y, s, mm.charAt(1))];
  const cx = x + 2 * w + gap + col / 2 + gap * 0.3;
  const vis = Math.floor(t.s) % 2 === 0;
  const dots = E(cx, y + 3.2 * s, 0.65 * s) + E(cx, y + 6.8 * s, 0.65 * s);
  const lit = digits.map(([d]) => d).join('') + (vis ? dots : '');
  return (
    <g data-seven="">
      <path d={digits.map(([, d]) => d).join('') + (vis ? '' : dots)} fill={off} />
      {glow && <path d={lit} fill={on} stroke={on} strokeWidth={f(s * 0.9)} strokeLinejoin="round" opacity={0.35} />}
      <path d={lit} fill={on} />
    </g>
  );
}

// Couleur des afficheurs selon le style.
export function ledColorsOf(k: StyleId): { on: string; off: string; bg: string } {
  if (k === 'neon') return { on: '#00E5FF', off: 'rgba(0,229,255,.08)', bg: '#07071A' };
  if (k === 'steampunk') return { on: '#FF9A3C', off: 'rgba(255,154,60,.08)', bg: '#1A0E06' };
  if (k === 'moderne' || k === 'japandi') return { on: '#F4F1EA', off: 'rgba(255,255,255,.06)', bg: '#1D1F22' };
  if (k === 'retro70') return { on: '#FFB020', off: 'rgba(255,176,32,.08)', bg: '#1E1408' };
  return { on: '#FF4A3D', off: 'rgba(255,74,61,.08)', bg: '#141414' };
}

// ---------- Horloge murale numérique (40 × 16 cm) ----------
export function DigitalClock({ rect, style: k, palette: p, view }: ObjProps): ReactElement {
  const W = 40, H = 16, t = view.time, c = ledColorsOf(k), city = view.city?.toUpperCase();
  let body: ReactElement;
  if (k === 'steampunk') {
    // Tubes Nixie dans un boîtier de laiton.
    const digits = pad(t.h) + pad(t.m);
    const dot = Math.floor(t.s) % 2 ? c.off : c.on;
    body = (
      <>
        <Flat d={R(0, 0, W, H, 2)} fill="#7A4E2D" />
        <path d={R(1.2, H - 3, W - 2.4, 2, 0.6)} fill="#B87333" {...THIN} />
        <g data-nixie="">
          {[0, 1, 2, 3].map((i) => {
            const tx = 3 + i * 8.8 + (i > 1 ? 1.6 : 0);
            return (
              <g key={i}>
                <path d={R(tx, 2, 6.6, 10.4, 3.2)} fill="rgba(255,240,220,.18)" stroke="#2A160A" strokeWidth={0.4} />
                <Txt x={tx + 3.3} y={7.4} s={8} fill={c.on} o={{ family: SERIF, weight: 400, glow: c.on }}>{digits.charAt(i)}</Txt>
              </g>
            );
          })}
        </g>
        <circle cx={W / 2} cy={5.6} r={0.6} fill={dot} />
        <circle cx={W / 2} cy={9} r={0.6} fill={dot} />
        {city && <Txt x={W / 2} y={H - 2} s={1.5} fill="#F1E3C2" o={{ weight: 700, city: true }}>{city}</Txt>}
      </>
    );
  } else {
    const caseC = k === 'scandinave' || k === 'japandi' || k === 'boheme' ? p.wood : k === 'retro70' ? '#E8863E' : k === 'neon' ? '#0F0F22' : '#2B2D31';
    const s = 0.95, w = sevenWidth(s);
    body = (
      <>
        <Flat d={R(0, 0, W, H, 3)} fill={caseC} />
        <path d={R(2, 2, W - 4, H - 4, 1.6)} fill={c.bg} {...THIN} />
        <Seven x={(W - w) / 2} y={(H - 10 * s) / 2 + (city ? 0.8 : 0)} s={s} t={t} on={c.on} off={c.off} />
        {city && <Txt x={W / 2} y={3.1} s={1.6} fill={c.on} o={{ weight: 700, spacing: 0.25, opacity: 0.85, city: true }}>{city}</Txt>}
      </>
    );
  }
  return (
    <Frame rect={rect} W={W} H={H} attrs={{ 'data-deco': 'digital-clock', ...timeAttrs(t) }}>
      {body}
    </Frame>
  );
}

// ---------- Pictogrammes météo ----------
type IconColors = { sun?: string; cloud?: string; grey?: string; dark?: string; rain?: string; ink?: string; moon?: string; flake?: string; fog?: string };
export function WeatherIcon({ cx, cy, r, state, night, c }: { cx: number; cy: number; r: number; state: WeatherState; night: boolean; c: IconColors }): ReactElement {
  const sunC = c.sun ?? '#F6B73C', cloudC = c.cloud ?? '#FFFFFF', rainC = c.rain ?? '#4AA3FF', inkC = c.ink ?? '#3A2620';
  const st = { stroke: inkC, strokeWidth: f(r * 0.07), strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
  const sun = (x: number, y: number, rr: number): ReactElement =>
    night ? (
      <path d={`M${f(x + rr * 0.35)},${f(y - rr)}A${f(rr)},${f(rr)} 0 1 0 ${f(x + rr)},${f(y + rr * 0.4)}A${f(rr * 0.8)},${f(rr * 0.8)} 0 1 1 ${f(x + rr * 0.35)},${f(y - rr)}Z`} fill={c.moon ?? '#F3E3A0'} {...st} />
    ) : (
      <>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={f(x + Math.cos(a) * rr * 1.3)} y1={f(y + Math.sin(a) * rr * 1.3)} x2={f(x + Math.cos(a) * rr * 1.7)} y2={f(y + Math.sin(a) * rr * 1.7)} stroke={sunC} strokeWidth={f(rr * 0.22)} strokeLinecap="round" />;
        })}
        <circle cx={f(x)} cy={f(y)} r={f(rr)} fill={sunC} {...st} />
      </>
    );
  const cloud = (x: number, y: number, s: number, fill = cloudC): ReactElement => (
    <path d={`M${f(x - s * 1.1)},${f(y + s * 0.45)}a${f(s * 0.45)},${f(s * 0.45)} 0 0 1 ${f(s * 0.15)},${f(-s * 0.88)}a${f(s * 0.62)},${f(s * 0.62)} 0 0 1 ${f(s * 1.15)},${f(-s * 0.3)}a${f(s * 0.5)},${f(s * 0.5)} 0 0 1 ${f(s * 0.9)},${f(s * 0.55)}a${f(s * 0.33)},${f(s * 0.33)} 0 0 1 ${f(-s * 0.05)},${f(s * 0.63)}Z`} fill={fill} {...st} />
  );
  const drops = (n: number, len: number, col: string): ReactElement[] =>
    Array.from({ length: n }, (_, i) => {
      const x = cx - r * 0.55 + i * ((r * 1.1) / (n - 1));
      return <line key={`d${i}`} x1={f(x)} y1={f(cy + r * 0.45)} x2={f(x - r * 0.12)} y2={f(cy + r * 0.45 + len)} stroke={col} strokeWidth={f(r * 0.11)} strokeLinecap="round" />;
    });
  let art: ReactNode = null;
  switch (state) {
    case 'sun': art = sun(cx, cy, r * 0.5); break;
    case 'cloudy': art = <>{sun(cx + r * 0.3, cy - r * 0.3, r * 0.36)}{cloud(cx - r * 0.05, cy + r * 0.15, r * 0.62)}</>; break;
    case 'drizzle': art = <>{cloud(cx, cy - r * 0.1, r * 0.62, c.grey ?? '#DDE3EA')}{drops(3, r * 0.28, rainC)}</>; break;
    case 'rain': art = <>{cloud(cx, cy - r * 0.15, r * 0.62, c.grey ?? '#C9D2DC')}{drops(4, r * 0.48, rainC)}</>; break;
    case 'storm':
      art = (
        <>
          {cloud(cx, cy - r * 0.2, r * 0.62, c.dark ?? '#8E98A6')}
          <path d={`M${f(cx + r * 0.05)},${f(cy + r * 0.25)}l${f(-r * 0.25)},${f(r * 0.38)}h${f(r * 0.2)}l${f(-r * 0.12)},${f(r * 0.36)}l${f(r * 0.36)},${f(-r * 0.48)}h${f(-r * 0.2)}l${f(r * 0.12)},${f(-r * 0.26)}Z`} fill="#FFD23C" {...st} />
        </>
      );
      break;
    case 'snow':
      art = (
        <>
          {cloud(cx, cy - r * 0.15, r * 0.62, c.grey ?? '#E4E9EF')}
          {[-0.45, 0, 0.45].map((k, i) => (
            <text key={k} x={f(cx + k * r)} y={f(cy + r * 0.72 + (i % 2) * r * 0.12)} fontSize={f(r * 0.42)} textAnchor="middle" dominantBaseline="middle" fill={c.flake ?? '#7FB8FF'}>✻</text>
          ))}
        </>
      );
      break;
    case 'fog':
      art = [0, 1, 2, 3].map((i) => <line key={i} x1={f(cx - r * 0.7 + (i % 2) * r * 0.15)} y1={f(cy - r * 0.45 + i * r * 0.3)} x2={f(cx + r * 0.7 - (i % 2) * r * 0.2)} y2={f(cy - r * 0.45 + i * r * 0.3)} stroke={c.fog ?? '#9AA4AE'} strokeWidth={f(r * 0.14)} strokeLinecap="round" />);
      break;
  }
  return <g data-icon={iconOf(state, night)}>{art}</g>;
}

// ---------- Station météo murale (34 × 22 cm) ----------
type ScreenTheme = { bg: string; fg: string; sub: string; icon: IconColors };
export function screenThemeOf(k: StyleId): ScreenTheme {
  if (k === 'neon') return { bg: '#07071A', fg: '#00E5FF', sub: '#FF4FD8', icon: { sun: '#FFE14F', cloud: '#1C1C3A', grey: '#2A2A50', dark: '#3A3A66', rain: '#00E5FF', ink: '#00E5FF', moon: '#FFE14F', flake: '#E6E6FF', fog: '#8A8AB8' } };
  if (k === 'steampunk') return { bg: '#2A1A0C', fg: '#FFB45C', sub: '#E8C07A', icon: { sun: '#FFB45C', cloud: '#3A2414', grey: '#4A2E18', dark: '#5A3A20', rain: '#FFB45C', ink: '#FFB45C', moon: '#FFD27A', flake: '#FFD27A', fog: '#C08A50' } };
  if (k === 'industriel' || k === 'moderne') return { bg: '#1D1F22', fg: '#F4F1EA', sub: '#9AA4AE', icon: { ink: '#1D1F22' } };
  return { bg: '#DCE3D3', fg: '#25302A', sub: '#5B6A5F', icon: { ink: '#25302A' } }; // écran « e-ink » doux
}

// Contenu de l'écran (pictogramme, température ; libellé, ville et heure en grand format) dans une boîte W × H dont l'écran commence à `inset`.
function StationScreen({ W, H, inset, small, k, view }: { W: number; H: number; inset: number; small: boolean; k: StyleId; view: DecoView }): ReactElement {
  const th = screenThemeOf(k), wx = view.weather;
  const ir = (H - 2 * inset) * 0.42;
  const tx = inset + 2 * ir + 3;
  const glow = k === 'neon' || k === 'steampunk' ? th.fg : undefined;
  const label = wx.night && wx.state === 'sun' ? 'Nuit claire' : wx.label;
  const icon = <WeatherIcon cx={inset + ir + 1.2} cy={H / 2 - (small ? 0 : 1.2)} r={ir} state={wx.state} night={wx.night} c={th.icon} />;
  return (
    <>
      {k === 'neon' ? (
        <>
          <g opacity={0.35} stroke="#00E5FF" strokeWidth={f(ir * 0.12)}>{icon}</g>
          {icon}
        </>
      ) : (
        icon
      )}
      <Txt x={tx} y={H / 2 - (small ? 0.4 : 2.2)} s={small ? H * 0.36 : H * 0.3} fill={th.fg} o={{ anchor: 'start', weight: 700, family: OSWALD, glow }}>{`${wx.tempC}°`}</Txt>
      {!small && (
        <>
          <Txt x={tx + 0.2} y={H / 2 + 3.6} s={2.1} fill={th.sub} o={{ anchor: 'start', weight: 600 }}>{label}</Txt>
          <Txt x={W / 2} y={H - 3.6} s={1.7} fill={th.sub} o={{ weight: 600, city: view.city ? true : undefined }}>{view.city ? `${view.city} · ${hhmm(view.time)}` : hhmm(view.time)}</Txt>
        </>
      )}
    </>
  );
}

export function WeatherStation({ rect, style: k, palette: p, view }: ObjProps): ReactElement {
  const W = 34, H = 22, th = screenThemeOf(k);
  const caseC = k === 'neon' ? '#0F0F22' : k === 'steampunk' ? '#7A4E2D' : k === 'industriel' || k === 'moderne' ? '#2B2D31' : k === 'retro70' ? '#E8863E' : p.wood;
  return (
    <Frame rect={rect} W={W} H={H} attrs={{ 'data-deco': 'weather-station' }}>
      <Flat d={R(0, 0, W, H, 2.6)} fill={caseC} />
      <path d={R(1.8, 1.8, W - 3.6, H - 3.6, 1.4)} fill={th.bg} {...THIN} />
      {k === 'steampunk' && [[1, 1], [W - 1, 1], [1, H - 1], [W - 1, H - 1]].map(([a, b]) => <circle key={`${a},${b}`} cx={a} cy={b} r={0.55} fill="#D9A441" />)}
      <StationScreen W={W} H={H} inset={1.8} small={false} k={k} view={view} />
    </Frame>
  );
}

// ---------- Baromètre-thermomètre à l'ancienne (26 × 50 cm) ----------
const BARO_LABELS: [string, number][] = [['Tempête', -120], ['Pluie', -65], ['Variable', 0], ['Beau', 65], ['Très sec', 120]];
export function Barometer({ rect, style: k, palette: p, view }: ObjProps): ReactElement {
  const W = 26, H = 50, cx = W / 2, r = 11, cy = 13, temp = view.weather.tempC;
  const wood = k === 'steampunk' ? '#58361D' : k === 'neon' ? '#2A2A4D' : k === 'moderne' ? '#2F3A46' : shade(p.woodDark, 0.95);
  const brass = k === 'neon' ? '#8A8AB8' : k === 'moderne' ? '#C0C6CC' : '#C9962E';
  const banjo = `M${cx - r - 2},${cy}A${r + 2},${r + 2} 0 0 1 ${cx + r + 2},${cy}L${cx + 6},${H - 6}A6,6 0 0 1 ${cx - 6},${H - 6}Z`;
  const pt = (a: number, k2: number): [number, number] => [f(cx + Math.cos(rad(a - 90)) * r * k2), f(cy + Math.sin(rad(a - 90)) * r * k2)];
  let ticks = '';
  for (let a = -130; a <= 130; a += 10) {
    const [x1, y1] = pt(a, 0.86), [x2, y2] = pt(a, a % 30 ? 0.82 : 0.78);
    ticks += `M${x1},${y1}L${x2},${y2}`;
  }
  // Aiguille dessinée vers le haut (« Variable ») puis tournée : la transition CSS la fait glisser d'un temps à l'autre.
  const needle: CSSProperties = { transform: `rotate(${BAROMETER_ANGLE[view.weather.state]}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform .6s' };
  const ty = 27, th = 17, tw = 3.2;
  const lvl = Math.max(0, Math.min(1, (temp + 10) / 50));
  return (
    <Frame rect={rect} W={W} H={H} attrs={{ 'data-deco': 'barometer' }}>
      <Flat d={banjo} fill={wood} />
      <path d={E(cx, cy, r + 0.4)} fill={brass} {...THIN} />
      <path d={E(cx, cy, r - 0.9)} fill="#F4EDDC" {...THIN} />
      {BARO_LABELS.map(([lab, a]) => {
        const [x, y] = pt(a, 0.66);
        return <Txt key={lab} x={x} y={y} s={1.45} fill="#3A2620" o={{ family: SERIF, weight: 500, transform: `rotate(${f(a * 0.55)} ${x} ${y})` }}>{lab}</Txt>;
      })}
      <path d={ticks} stroke="#3A2620" strokeWidth={0.25} />
      <line data-needle="" x1={cx} y1={cy + 2} x2={cx} y2={f(cy - r * 0.8)} stroke="#1E1612" strokeWidth={0.55} strokeLinecap="round" style={needle} />
      <circle cx={cx} cy={cy} r={1} fill={brass} {...THIN} />
      {/* Thermomètre */}
      <path d={R(cx - 4.6, ty - 1.2, 9.2, th + 4.6, 1.5)} fill="#F4EDDC" {...THIN} />
      <path d={R(cx - tw / 2 + 0.6, ty, tw - 1.2, th, 0.9)} fill="#fff" {...THIN} />
      <circle cx={cx} cy={ty + th + 0.8} r={1.5} fill="#D8432F" {...THIN} />
      <path d={R(cx - 0.45, ty + th * (1 - lvl), 0.9, th * lvl + 1, 0.4)} fill="#D8432F" />
      {[-10, 0, 10, 20, 30, 40].map((d) => {
        const yy = ty + th * (1 - (d + 10) / 50);
        return (
          <g key={d}>
            <line x1={f(cx + 1.2)} y1={f(yy)} x2={f(cx + 2.2)} y2={f(yy)} stroke="#3A2620" strokeWidth={0.2} />
            <Txt x={cx + 3.3} y={yy} s={0.95} fill="#3A2620" o={{ weight: 500 }}>{d}</Txt>
          </g>
        );
      })}
      <Txt x={cx - 2.8} y={ty + th * (1 - lvl)} s={1.25} fill="#D8432F" o={{ weight: 700 }}>{`${temp}°`}</Txt>
    </Frame>
  );
}

// ---------- Panneaux ----------
const CELL = 21;
type PanelKind = keyof typeof PANEL_FONTS;
const NEON_WOOD_DARK = '#1C1C38'; // bois sombre du style Néon : cadres plus clairs pour rester visibles (comme la maquette)

const HINT = '✏️ Touchez pour écrire';
// Texte d'un panneau : passé à la ligne et à la plus grande taille qui tient dans la boîte ; panneau vide en Aménager → invitation grise.
function PanelText({ kind, text, x, y, w, h, fill, opacity, glow, editing }: { kind: PanelKind; text: string; x: number; y: number; w: number; h: number; fill: string; opacity?: number; glow?: string; editing: boolean }): ReactElement | null {
  const font = PANEL_FONTS[kind];
  const family = `"${font.family}", ${font.fallback}`;
  // Charge la police intégrée de CE panneau puis re-mesure (la première mesure a pu se faire avec la police de repli).
  const [fontsLoaded, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let cancelled = false;
    ensureDecoFonts();
    void document.fonts?.load(`${font.weight} 16px "${font.family}"`).then(() => { if (!cancelled) bump(); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [font.family, font.weight]);
  const empty = !text.trim();
  const shown = 'upper' in font && font.upper ? text.toUpperCase() : text;
  // Mesure en cache (texte, boîte, police, chargement de la police) : des milliers d'appels au canevas par ajustement (spec §4.3),
  // refaits seulement quand l'un d'eux change, jamais à un simple re-rendu.
  const fit = useMemo(() => {
    const measure = measureWith(font.family, font.weight, font.fallback);
    // Invitation sur une seule ligne, discrète (au plus un quart de la hauteur).
    if (empty) return { hint: Math.min(h * 0.25, (w * 0.9) / Math.max(measure(HINT, 1), 0.01)) };
    return fitText(shown, { w, h }, measure, font.lineHeight);
  }, [empty, shown, w, h, font.family, font.weight, font.fallback, font.lineHeight, fontsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  if ('hint' in fit) {
    if (!editing) return null;
    return <Txt x={x + w / 2} y={y + h / 2} s={fit.hint} fill="#8E8A84" o={{ family, weight: font.weight, opacity: 0.9 }}>{HINT}</Txt>;
  }
  const { size, lines } = fit;
  const top = y + h / 2 - ((lines.length - 1) * size * font.lineHeight) / 2;
  return (
    <g data-panel-text="">
      {lines.map((l, i) => (
        <Txt key={i} x={x + w / 2} y={top + i * size * font.lineHeight} s={size} fill={fill} o={{ family, weight: font.weight, opacity, glow }}>{l}</Txt>
      ))}
    </g>
  );
}

// Points du liège (même tirage que la maquette), groupés en deux tracés par couleur (des milliers de cercles seraient lourds sur Android).
function corkDots(W: number, H: number): [string, string] {
  let seed = 7;
  const rnd = (): number => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let dark = '', pale = '';
  for (let i = 0; i < (W * H) / 12; i++) {
    const cx = 3 + rnd() * (W - 6), cy = 3 + rnd() * (H - 6), r = 0.25 + rnd() * 0.35;
    if (rnd() > 0.5) dark += E(cx, cy, r);
    else pale += E(cx, cy, r);
  }
  return [dark, pale];
}

export function Panel({ placed, rect, palette: p, view }: { placed: DecoPlaced; rect: PxRect; palette: Palette; view: DecoView }): ReactElement {
  const kind = (isPanel(placed.deco) ? placed.deco : 'panel-chalk') as PanelKind;
  const size = decoSizeOf(placed);
  const W = size.w * CELL, H = size.h * CELL, text = placed.text ?? '', editing = view.editing;
  const neonWall = p.woodDark === NEON_WOOD_DARK;
  let body: ReactElement;
  if (kind === 'panel-chalk') {
    body = (
      <>
        <Flat d={R(0, 0, W, H, 1.5)} fill={neonWall ? '#5A4636' : p.wood} />
        <path d={R(3, 3, W - 6, H - 6, 0.6)} fill="#2F3B35" {...THIN} />
        <path d={`M6,${H - 6}q${f(W * 0.2)},-3 ${f(W * 0.4)},-1`} stroke="rgba(255,255,255,.08)" strokeWidth={3} fill="none" />
        <PanelText kind={kind} text={text} x={6} y={5} w={W - 12} h={H - 10} fill="#F4F1E8" opacity={0.92} editing={editing} />
        <path d={R(W - 14, H - 4.2, 6, 1.6, 0.8)} fill="#FBFBF5" {...THIN} />
      </>
    );
  } else if (kind === 'panel-letter') {
    let grooves = '';
    for (let yy = 3.2; yy < H - 2.5; yy += 1.6) grooves += `M2.3,${f(yy)}H${f(W - 2.3)}`;
    body = (
      <>
        <Flat d={R(0, 0, W, H, 1)} fill="#C9A774" />
        <path d={R(2, 2, W - 4, H - 4, 0.4)} fill="#1F1F1F" {...THIN} />
        <path d={grooves} stroke="#2D2D2D" strokeWidth={0.5} />
        <PanelText kind={kind} text={text} x={4.5} y={4} w={W - 9} h={H - 8} fill="#F5F5F2" editing={editing} />
      </>
    );
  } else if (kind === 'panel-neon') {
    const color = NEON_COLORS[placed.neon ?? 'pink'];
    const dark = 1 - view.daylight;
    body = (
      <>
        {/* Halo : le néon éclaire un peu le mur quand il fait sombre ; trois ellipses emboîtées adoucissent le bord (pas de flou, coûteux sur Android). */}
        {view.daylight < 0.95 && (
          <g data-neon-halo="" fill={color} opacity={f(0.35 * dark)} pointerEvents="none">
            {[1, 0.8, 0.6].map((k) => <ellipse key={k} cx={W / 2} cy={H / 2} rx={f(W * 0.62 * k)} ry={f(H * 0.95 * k)} opacity={0.4} />)}
          </g>
        )}
        <path d={R(0, 0, W, H, 2)} fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.45)" strokeWidth={0.4} />
        {[[2.5, 2.5], [W - 2.5, 2.5], [2.5, H - 2.5], [W - 2.5, H - 2.5]].map(([a, b]) => <circle key={`${a},${b}`} cx={a} cy={b} r={1} fill="#D8D8D8" {...THIN} />)}
        <line x1={W / 2} y1={H} x2={W / 2} y2={H + 18} stroke="#222" strokeWidth={0.5} />
        <PanelText kind={kind} text={text} x={4} y={2.5} w={W - 8} h={H - 5} fill={light(color, 0.55)} glow={color} editing={editing} />
      </>
    );
  } else {
    const [dark, pale] = corkDots(W, H);
    const pw = Math.min(W - 10, W * 0.78), ph = H - 10, px = (W - pw) / 2, py = 5.5;
    let rules = '';
    for (let yy = py + 3; yy < py + ph - 1; yy += 2.4) rules += `M${f(px + 1)},${f(yy)}H${f(px + pw - 1)}`;
    body = (
      <>
        <Flat d={R(0, 0, W, H, 1)} fill={neonWall ? '#6A5240' : p.woodDark} />
        <path d={R(2.5, 2.5, W - 5, H - 5, 0.4)} fill="#C69A64" {...THIN} />
        <path d={dark} fill="#A97E4A" />
        <path d={pale} fill="#D8B07C" />
        <g transform={`rotate(-2 ${f(px + pw / 2)} ${f(py + ph / 2)})`}>
          <Flat d={R(px, py, pw, ph, 0.3)} fill="#FFFDF2" thin />
          <path d={rules} stroke="#BFD4EA" strokeWidth={0.2} />
          <PanelText kind={kind} text={text} x={px + 2} y={py + 2.5} w={pw - 4} h={ph - 4} fill="#24407A" editing={editing} />
          <circle cx={f(px + pw / 2)} cy={f(py + 1.4)} r={1.4} fill="#D8432F" {...THIN} />
        </g>
        <path d={R(W - 13, 4, 7, 5, 0.2)} fill="#F6E27A" {...THIN} transform={`rotate(6 ${W - 9.5} 6.5)`} />
      </>
    );
  }
  return (
    <Frame rect={rect} W={W} H={H} attrs={{ 'data-deco': placed.deco }}>
      {body}
    </Frame>
  );
}

// ---------- Objet du mur ----------
export function DecoArt({ placed, rect, style, palette, view }: { placed: DecoPlaced; rect: PxRect; style: StyleId; palette: Palette; view: DecoView }): ReactElement {
  switch (placed.deco) {
    case 'wall-clock': return <WallClock rect={rect} style={style} palette={palette} view={view} />;
    case 'digital-clock': return <DigitalClock rect={rect} style={style} palette={palette} view={view} />;
    case 'weather-station': return <WeatherStation rect={rect} style={style} palette={palette} view={view} />;
    case 'barometer': return <Barometer rect={rect} style={style} palette={palette} view={view} />;
    default: return <Panel placed={placed} rect={rect} palette={palette} view={view} />;
  }
}

// ---------- Faces des objets de table (le corps est le modèle 3D) ----------
// Réveil : écran 12 × 5,6 cm ; pendulette : cadran Ø 10,4 cm ; station : écran 11,4 × 6,4 cm. Fond sur tout le cadre `0 0 w h`, contenu centré sans déformation.
export function TableFace({ item, w, h, style: k, view }: { item: 'alarm' | 'clock' | 'station'; w: number; h: number; style: StyleId; view: DecoView }): ReactElement {
  const t = view.time;
  const frame = { x: 0, y: 0, w, h };
  if (item === 'alarm') {
    const c = ledColorsOf(k), s = 0.36, sw = sevenWidth(s), W = 12, H = 5.6;
    return (
      <g data-table-face="alarm" {...timeAttrs(t)}>
        <path d={R(0, 0, w, h, Math.min(w, h) * 0.18)} fill={c.bg} {...THIN} />
        <Frame rect={frame} W={W} H={H} attrs={{}}>
          <Seven x={(W - sw) / 2} y={0.8} s={s} t={t} on={c.on} off={c.off} />
          {view.city && <Txt x={W / 2} y={H - 0.7} s={0.95} fill={c.on} o={{ weight: 700, city: true }}>{view.city.toUpperCase()}</Txt>}
        </Frame>
      </g>
    );
  }
  if (item === 'clock') {
    const r = 6.5, neon = k === 'neon', ink = neon ? '#00E5FF' : '#2A211C';
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const a = rad(i * 30);
      return `M${f(r + Math.sin(a) * r * 0.72)},${f(r - Math.cos(a) * r * 0.72)}L${f(r + Math.sin(a) * r * 0.62)},${f(r - Math.cos(a) * r * 0.62)}`;
    }).join('');
    return (
      <g data-table-face="clock" {...timeAttrs(t)}>
        <Frame rect={frame} W={2 * r * 0.8} H={2 * r * 0.8} attrs={{}}>
          <g transform={`translate(${f(-r * 0.2)} ${f(-r * 0.2)})`}>
            <path d={E(r, r, r * 0.8)} fill={neon ? '#0B0B1E' : '#FBF7EE'} {...THIN} />
            <path d={ticks} stroke={ink} strokeWidth={0.35} />
            {view.city && <Txt x={r} y={r + r * 0.38} s={1} fill={ink} o={{ weight: 700, city: true }}>{view.city.toUpperCase()}</Txt>}
            <Hands cx={r} cy={r} r={r * 0.85} t={t} ink={neon ? '#E6E6FF' : '#2A211C'} sec={neon ? '#FF4FD8' : '#D8432F'} />
          </g>
        </Frame>
      </g>
    );
  }
  const th = screenThemeOf(k), W = 11.4, H = 6.4;
  return (
    <g data-table-face="station" {...timeAttrs(t)}>
      <path d={R(0, 0, w, h, Math.min(w, h) * 0.15)} fill={th.bg} {...THIN} />
      <Frame rect={frame} W={W} H={H} attrs={{}}>
        {/* Mêmes cotes que la station de table de la maquette (boîtier 15 × 10, écran en retrait de 1,8). */}
        <g transform="translate(-1.8 -1.8)">
          <StationScreen W={15} H={10} inset={1.8} small k={k} view={view} />
        </g>
      </Frame>
    </g>
  );
}

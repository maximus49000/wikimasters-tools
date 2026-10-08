export type Position = { lat: number; lon: number };
export type Ymd = { y: number; m: number; d: number };
export type SunTimes = { kind: 'normal'; sunrise: number; sunset: number } | { kind: 'polar'; polar: 'day' | 'night' };
export type Phase = 'night' | 'dawn' | 'day' | 'dusk';
export type Sky = {
  phase: Phase;
  // 0 = nuit, 1 = plein jour, continu (la lumière monte et descend sur une heure autour du lever et du coucher).
  daylight: number;
  // 1 au lever et au coucher, 0 en plein jour et en pleine nuit : force de la teinte orangée.
  twilight: number;
  // Avancement du soleil (0 au lever, 1 au coucher) ou null s'il est couché ; idem pour la lune pendant la nuit.
  sunFrac: number | null;
  moonFrac: number | null;
  stars: number;
  top: string;
  bottom: string;
};

const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function dayOfYear({ y, m, d }: Ymd): number {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

// Formule astronomique simplifiée (déclinaison + équation du temps), calculée sur l'appareil. Minutes locales depuis minuit.
export function sunTimes(ymd: Ymd, pos: Position, tzOffsetMin: number): SunTimes {
  const n = dayOfYear(ymd);
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (284 + n));
  const b = ((2 * Math.PI) / 364) * (n - 81);
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const cosH0 = (Math.sin(-0.833 * RAD) - Math.sin(pos.lat * RAD) * Math.sin(decl * RAD)) / (Math.cos(pos.lat * RAD) * Math.cos(decl * RAD));
  if (cosH0 <= -1) return { kind: 'polar', polar: 'day' };
  if (cosH0 >= 1) return { kind: 'polar', polar: 'night' };
  const h0 = Math.acos(cosH0) / RAD;
  const noonUtc = 720 - 4 * pos.lon - eot;
  return { kind: 'normal', sunrise: noonUtc - 4 * h0 + tzOffsetMin, sunset: noonUtc + 4 * h0 + tzOffsetMin };
}

// Sans position connue : longitude déduite du fuseau (15° par heure), latitude moyenne.
export const positionFromTimezone = (tzOffsetMin: number): Position => ({ lat: 45, lon: tzOffsetMin / 4 });

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const k = clamp(t, 0, 1);
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const to = (x: number, y: number): string => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
}

const DAY = { top: '#6FB1E8', bottom: '#BFE0F5' };
const NIGHT = { top: '#0B1030', bottom: '#1B2250' };
const TWILIGHT = { top: '#4A4A8A', bottom: '#F29A5E' };

export function skyAt(minutes: number, times: SunTimes): Sky {
  const m = ((minutes % 1440) + 1440) % 1440;
  let daylight: number;
  let sunFrac: number | null = null;
  let moonFrac: number | null = null;
  let noon = 720;
  if (times.kind === 'polar') {
    daylight = times.polar === 'day' ? 1 : 0;
    if (daylight === 1) sunFrac = m / 1440;
    else moonFrac = m / 1440;
  } else {
    const { sunrise, sunset } = times;
    noon = (sunrise + sunset) / 2;
    daylight = clamp(Math.min((m - (sunrise - 30)) / 60, (sunset + 30 - m) / 60), 0, 1);
    if (m >= sunrise - 15 && m <= sunset + 15) sunFrac = clamp((m - sunrise) / (sunset - sunrise), 0, 1);
    else {
      const nightLen = 1440 - (sunset - sunrise);
      moonFrac = clamp((((m - sunset) % 1440) + 1440) % 1440 / nightLen, 0, 1);
    }
  }
  const twilight = times.kind === 'polar' ? 0 : clamp(1 - Math.abs(daylight - 0.5) * 2, 0, 1) * (daylight > 0 && daylight < 1 ? 1 : 0);
  const phase: Phase = daylight >= 0.95 ? 'day' : daylight <= 0.05 ? 'night' : m < noon ? 'dawn' : 'dusk';
  const base = { top: mixHex(NIGHT.top, DAY.top, daylight), bottom: mixHex(NIGHT.bottom, DAY.bottom, daylight) };
  return {
    phase,
    daylight,
    twilight,
    sunFrac,
    moonFrac,
    stars: clamp(1 - daylight * 1.6, 0, 1),
    top: mixHex(base.top, TWILIGHT.top, twilight * 0.8),
    bottom: mixHex(base.bottom, TWILIGHT.bottom, twilight * 0.8),
  };
}

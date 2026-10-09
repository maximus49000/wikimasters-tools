import { hashString, mulberry32 } from '../scene-world';
import type { CityIntensity } from './intensity';

export type Profile = 'stroller' | 'suit' | 'jogger' | 'ordinary' | 'child';
export type Hair = 'short' | 'long' | 'bun' | 'cap' | 'beanie' | 'bald';
export type Top = 'tee' | 'sweater' | 'jacket' | 'coat' | 'shirt' | 'suit' | 'jersey';
export type Bottom = 'pants' | 'jeans' | 'skirt' | 'shorts' | 'dress' | 'jogging';
export type Accessory = 'none' | 'backpack' | 'bag' | 'case' | 'ball' | 'scarf';
export type Outfit = { skin: string; hair: Hair; hairColor: string; hatColor: string; top: Top; topColor: string; bottom: Bottom; bottomColor: string; accessory: Accessory; accessoryColor: string };
export type Pedestrian = {
  id: string;
  role: 'general' | 'schoolTo' | 'schoolFrom' | 'play';
  profile: Profile;
  outfit: Outfit;
  companions: Outfit[];
  dir: 1 | -1;
  speed: number;
  phase: number;
  u: number;
  scale: number;
  depth: number;
};

const SKINS = ['#F2C9A5', '#E0A97F', '#B97A52', '#8A5A3B', '#6B4228'];
const HAIRS = ['#3B2A1E', '#111111', '#6B3A1E', '#8A5A2B', '#C9A24A', '#7A3B2A', '#9A9A9A'];
const BRIGHT = ['#C0463A', '#3B6FD6', '#2E8B6A', '#E0A21E', '#7A3B8C', '#E07A8C', '#4A9CC4', '#D95F2B', '#8A8A3A', '#B3262B', '#2A9DAA', '#F2C94C'];
const MUTED = ['#5A6B7A', '#8A7F76', '#43506A', '#7A8C80', '#6B6B7A', '#A89F91', '#3F5A4A', '#7A5A4A'];
const SUITS = ['#2A2F3A', '#243044', '#3A3A44', '#3B2F2A', '#4A4F5A'];
const DENIM = ['#243044', '#2F4A7A', '#3A3A44', '#5A6B7A', '#1E2A3A'];

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;

export function outfitFor(profile: Profile, rng: () => number): Outfit {
  const base = { skin: pick(SKINS, rng), hairColor: pick(HAIRS, rng), hatColor: pick(BRIGHT, rng), accessoryColor: pick([...BRIGHT, ...MUTED], rng) };
  switch (profile) {
    case 'suit': {
      const c = pick(SUITS, rng);
      return { ...base, hair: pick(['short', 'short', 'bun', 'bald', 'long'] as const, rng), top: 'suit', topColor: c, bottom: rng() < 0.25 ? 'skirt' : 'pants', bottomColor: c, accessory: pick(['case', 'bag', 'none'] as const, rng) };
    }
    case 'jogger':
      return { ...base, hair: pick(['cap', 'bun', 'short', 'beanie'] as const, rng), top: 'jersey', topColor: pick(BRIGHT, rng), bottom: pick(['shorts', 'jogging'] as const, rng), bottomColor: pick(SUITS, rng), accessory: 'none' };
    case 'child':
      return { ...base, hair: pick(['short', 'long', 'bun', 'cap', 'beanie'] as const, rng), top: pick(['tee', 'sweater', 'jacket'] as const, rng), topColor: pick(BRIGHT, rng), bottom: pick(['pants', 'jeans', 'shorts', 'skirt'] as const, rng), bottomColor: pick([...DENIM, ...BRIGHT], rng), accessory: pick(['backpack', 'ball'] as const, rng) };
    default: {
      const top = pick(['tee', 'sweater', 'jacket', 'coat', 'shirt'] as const, rng);
      return {
        ...base,
        hair: pick(['short', 'long', 'bun', 'cap', 'beanie', 'bald'] as const, rng),
        top,
        topColor: pick([...BRIGHT, ...MUTED], rng),
        bottom: pick(['pants', 'jeans', 'skirt', 'dress', 'shorts'] as const, rng),
        bottomColor: pick([...DENIM, ...MUTED], rng),
        accessory: pick(['bag', 'scarf', 'none', 'none', 'backpack'] as const, rng),
      };
    }
  }
}

// Intensité qui décide de la présence d'un passant selon son rôle.
export function pedestrianGate(p: Pedestrian, i: CityIntensity): number {
  if (p.role === 'schoolTo') return i.schoolTo;
  if (p.role === 'schoolFrom') return i.schoolFrom;
  if (p.role === 'play') return i.kids;
  if (p.profile === 'suit') return i.suits;
  if (p.profile === 'jogger') return i.sport;
  return i.walkers;
}

export function pedestriansFor(width: number, seed: number): Pedestrian[] {
  const rng = mulberry32(seed ^ hashString('pedestrians'));
  const out: Pedestrian[] = [];
  const make = (id: string, role: Pedestrian['role'], profile: Profile, dir: 1 | -1, speedMin: number, speedMax: number, companions = 0): Pedestrian => ({
    id,
    role,
    profile,
    outfit: outfitFor(profile, rng),
    companions: Array.from({ length: companions }, () => outfitFor('child', rng)),
    dir,
    speed: speedMin + rng() * (speedMax - speedMin),
    phase: rng() * (width + 160),
    u: rng(),
    scale: role === 'play' ? 0.66 + rng() * 0.1 : 0.95 + rng() * 0.15,
    depth: rng(),
  });
  const dirOf = (): 1 | -1 => (rng() < 0.5 ? 1 : -1);

  const general = Math.max(4, Math.min(16, Math.round(width / 70)));
  for (let i = 0; i < general; i++) {
    const roll = rng();
    const profile: Profile = roll < 0.3 ? 'suit' : roll < 0.4 ? 'jogger' : roll < 0.7 ? 'stroller' : 'ordinary';
    out.push(make(`ped-${i}`, 'general', profile, dirOf(), profile === 'jogger' ? 38 : profile === 'suit' ? 26 : 14, profile === 'jogger' ? 50 : profile === 'suit' ? 34 : 24));
  }
  const groups = Math.max(1, Math.round(width / 260));
  for (let i = 0; i < groups; i++) {
    out.push(make(`to-${i}`, 'schoolTo', 'ordinary', 1, 14, 18, 1 + (rng() < 0.4 ? 1 : 0)));
    out.push(make(`from-${i}`, 'schoolFrom', 'ordinary', -1, 14, 18, 1 + (rng() < 0.4 ? 1 : 0)));
  }
  const players = Math.max(2, Math.round(width / 200));
  for (let i = 0; i < players; i++) out.push(make(`play-${i}`, 'play', 'child', dirOf(), 8, 22));
  return out;
}

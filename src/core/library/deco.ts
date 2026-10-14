// Objets décoratifs du mur : horloges, météomètres et panneaux à texte (spec 2026-10-14-horloges-meteo-panneaux).
import type { Placed } from './library-types';
export const PANEL_KINDS = ['panel-chalk', 'panel-letter', 'panel-neon', 'panel-cork'] as const;
export const CLOCK_KINDS = ['wall-clock', 'digital-clock'] as const;
export const DECO_KINDS = [...CLOCK_KINDS, 'weather-station', 'barometer', ...PANEL_KINDS] as const;
export type DecoKind = (typeof DECO_KINDS)[number];
export type NeonColor = 'pink' | 'cyan' | 'yellow' | 'green' | 'white';
export const NEON_COLORS: Record<NeonColor, string> = { pink: '#FF4FD8', cyan: '#00E5FF', yellow: '#FFE14F', green: '#3DFF8B', white: '#FFFFFF' };
// Ville d'une horloge : nom affiché et fuseau IANA (absent = heure de la scène).
export type CityTime = { name: string; tz: string };

export const PANEL_MIN = { w: 2, h: 2 } as const;
export const PANEL_MAX = { w: 12, h: 8 } as const;
export const MAX_PANEL_TEXT = 140;

const FIXED: Record<Exclude<DecoKind, (typeof PANEL_KINDS)[number]>, { w: number; h: number }> = {
  'wall-clock': { w: 2, h: 2 },
  'digital-clock': { w: 2, h: 1 },
  'weather-station': { w: 2, h: 1 },
  barometer: { w: 2, h: 3 },
};

export const isPanel = (deco: DecoKind): deco is (typeof PANEL_KINDS)[number] => (PANEL_KINDS as readonly string[]).includes(deco);
export const isWallClock = (deco: DecoKind): boolean => (CLOCK_KINDS as readonly string[]).includes(deco);
// Objets dont on règle la ville : les horloges murales, le réveil et la pendulette (la station météo n'a pas de ville).
export const hasCitySetting = (p: Placed): boolean => (p.kind === 'deco' && isWallClock(p.deco)) || (p.kind === 'small' && (p.item === 'alarm' || p.item === 'clock'));
// Taille à la pose : fixe, ou défaut du panneau (néon plus large que haut).
export const decoDefaultSize = (deco: DecoKind): { w: number; h: number } => (isPanel(deco) ? (deco === 'panel-neon' ? { w: 5, h: 2 } : { w: 4, h: 3 }) : FIXED[deco]);

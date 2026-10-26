import { COOL, SUN } from '../paint/cel';
import { hexRgb, mixRgb, type Rgb } from '../paint/color';

// Teinte cellulo d'une pièce de meuble : aplat (base), UN ton d'ombre net teinté violet (shade), un rehaut chaud (hi).
export type Tone = { base: string; shade: string; hi: string };

export const rgbHex = (c: Rgb): string => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

export function tone(c: string, o?: { s?: number; h?: number }): Tone {
  const rgb = hexRgb(c);
  return { base: c, shade: rgbHex(mixRgb(rgb, COOL, o?.s ?? 0.32)), hi: rgbHex(mixRgb(rgb, SUN, o?.h ?? 0.4)) };
}

// Abat-jour allumé : lumineux partout, jamais ombré.
export const WARM_LIT: Tone = { base: '#FFE9B0', shade: '#FFE9B0', hi: '#FFF6D0' };

// src/content/figure/ghibli-figure.tsx
import type { CSSProperties, ReactElement } from 'react';
import { keyString, type FigureKey } from '../../core/library/figure/bake';
import { shapeOf, signatureOf } from '../../core/library/figure/dress';
import type { Outfit } from '../../core/library/city/people';
import { mixHex, type Sky } from '../../core/library/sky';
import { tone } from '../city-sprites';
import { useFigureRegistry, type FigureRegistry } from './figure-host';

// Humain au trait Ghibli (G3) : un <g data-figure> qui porte les couleurs de la tenue en variables CSS (teinte de nuit comme
// le dessin classique, ombre violette, encre assombrie la nuit) et un <use> vers la pose courante. Les boucles changent la
// pose par poseFigure, sans re-rendu. Repère : pieds à l'origine, comme PersonSprite ; jamais retourné en miroir.
const shadeOf = (c: string): string => mixHex(mixHex(c, '#4a3a6a', 0.3), '#000000', 0.05);

export function figureVars(o: Outfit, sky: Sky, rainy: boolean, umbrella: boolean): CSSProperties {
  const t = (c: string): string => tone(c, sky);
  // Sous la pluie, les hauts légers deviennent un imperméable (comme PersonSprite).
  const raincoat = rainy && (o.top === 'jacket' || o.top === 'sweater' || o.top === 'tee' || o.top === 'shirt');
  const slots: Record<string, string> = {
    skin: o.skin,
    top: raincoat ? '#2E5E8A' : o.topColor,
    bottom: o.bottomColor,
    hair: o.hairColor,
    hat: o.hatColor,
    acc: o.accessoryColor,
    shoe: '#3a2a24',
    umb: '#C0392B',
  };
  const vars: Record<string, string> = { '--f-ink': t('#33241f'), '--f-ground': '#3a2f5a' };
  for (const [k, c] of Object.entries(slots)) {
    vars[`--f-${k}`] = t(c);
    vars[`--fs-${k}`] = t(shadeOf(c));
  }
  return vars as CSSProperties;
}

type Pose = Omit<FigureKey, 'sig'>;

export function GhibliFigure({ outfit, sky, rainy, umbrella, initial }: { outfit: Outfit; sky: Sky; rainy: boolean; umbrella: boolean; initial: Pose }): ReactElement {
  const reg = useFigureRegistry();
  const sig = signatureOf(shapeOf(outfit, umbrella));
  const key = { sig, ...initial };
  return (
    <g data-figure="" data-sig={sig} data-key={keyString(key)} style={figureVars(outfit, sky, rainy, umbrella)}>
      <use href={reg.ensure(key)} />
    </g>
  );
}

// Pose d'une figure par la boucle : n'écrit que si la pose change ; symbole manquant → demandé, image courante gardée.
export function poseFigure(reg: FigureRegistry, node: Element | null, pose: Pose): void {
  if (!node) return;
  const sig = node.getAttribute('data-sig');
  if (!sig) return;
  const key = { sig, ...pose };
  const k = keyString(key);
  if (node.getAttribute('data-key') === k) return;
  const href = reg.request(key);
  if (!href) return;
  node.setAttribute('data-key', k);
  node.firstElementChild?.setAttribute('href', href);
}

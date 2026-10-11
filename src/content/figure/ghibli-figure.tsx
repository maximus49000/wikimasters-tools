// src/content/figure/ghibli-figure.tsx
import { useLayoutEffect, useRef, type CSSProperties, type ReactElement } from 'react';
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

// `hidden` : nœud inactif (habitant chez lui, client absent, passant hors présence) : <use> sans href, rien n'est recopié ni
// créé ; la boucle le remet en place par poseFigure. La pose initiale est détenue (registre) dès la mise en page, libérée au
// démontage (comme toute pose posée depuis par la boucle).
export function GhibliFigure({ outfit, sky, rainy, umbrella, initial, hidden = false }: { outfit: Outfit; sky: Sky; rainy: boolean; umbrella: boolean; initial: Pose; hidden?: boolean }): ReactElement {
  const reg = useFigureRegistry();
  const ref = useRef<SVGGElement | null>(null);
  const sig = signatureOf(shapeOf(outfit, umbrella));
  const key = { sig, ...initial };
  const k = keyString(key);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!hidden) reg.hold(node, key);
    return () => void reg.hold(node, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, k, hidden]);
  return (
    <g data-figure="" data-sig={sig} data-key={hidden ? undefined : k} style={figureVars(outfit, sky, rainy, umbrella)} ref={ref}>
      <use href={hidden ? undefined : reg.ensure(key)} />
    </g>
  );
}

// Pose d'une figure par la boucle : n'écrit que si la pose change ; symbole manquant → demandé, image courante gardée. Une
// figure cachée (sans data-key) est remise en place tout de suite (symbole créé au besoin) : pas d'image vide à l'apparition.
export function poseFigure(reg: FigureRegistry, node: Element | null, pose: Pose): void {
  if (!node) return;
  const sig = node.getAttribute('data-sig');
  if (!sig) return;
  const key = { sig, ...pose };
  const k = keyString(key);
  const shown = node.getAttribute('data-key');
  if (shown === k) return;
  if (shown === null) reg.ensure(key);
  const href = reg.hold(node, key);
  if (!href) return;
  node.setAttribute('data-key', k);
  node.firstElementChild?.setAttribute('href', href);
}

// Cache une figure (nœud devenu inactif) : <use> sans href (rien n'est recopié), data-key effacé, clé libérée. Idempotent.
export function hideFigure(reg: FigureRegistry, node: Element | null): void {
  if (!node) return;
  const use = node.firstElementChild;
  if (!node.hasAttribute('data-key') && !use?.hasAttribute('href')) return;
  use?.removeAttribute('href');
  node.removeAttribute('data-key');
  reg.hold(node, null);
}

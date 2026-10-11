// src/content/figure/ghibli-figure.tsx
import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { FigureKey } from '../../core/library/figure/bake';
import { shapeOf, signatureOf } from '../../core/library/figure/dress';
import type { Outfit } from '../../core/library/city/people';
import { mixHex, type Sky } from '../../core/library/sky';
import { tone } from '../city-sprites';
import { SPRITE_BOX, spriteKey, useFigureRegistry, type FigureRegistry, type Palette } from './figure-host';

// Humain au trait Ghibli (G3) : un <g data-figure> qui porte sa palette (couleurs de la tenue avec la teinte de nuit comme
// le dessin classique, ombre violette, encre assombrie la nuit) et une <image> du sprite de la pose courante. Les boucles
// changent la pose par poseFigure, sans re-rendu. Repère : pieds à l'origine, comme PersonSprite ; jamais retourné en miroir.
const shadeOf = (c: string): string => mixHex(mixHex(c, '#4a3a6a', 0.3), '#000000', 0.05);

// Teinte de nuit au huitième de jour près : `daylight` change chaque minute pendant ≈ 2 h autour du lever et du coucher ;
// sans palier, toutes les figures changeaient de palette (sprites refaits) à chaque minute.
const PALETTE_STEPS = 8;
export function figurePalette(o: Outfit, sky: Sky, rainy: boolean): Palette {
  const lit: Sky = { ...sky, daylight: Math.round(sky.daylight * PALETTE_STEPS) / PALETTE_STEPS };
  const t = (c: string): string => tone(c, lit);
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
  const p: Palette = { 'f-ink': t('#33241f'), 'f-ground': '#3a2f5a' };
  for (const [k, c] of Object.entries(slots)) {
    p[`f-${k}`] = t(c);
    p[`fs-${k}`] = t(shadeOf(c));
  }
  return p;
}

type Pose = Omit<FigureKey, 'sig'>;

// `hidden` : nœud inactif (habitant chez lui, client absent, passant hors présence) : <image> sans href, aucun sprite peint ;
// la boucle le remet en place par poseFigure. La palette suit le rendu (à la minute, avec le ciel, par paliers) ; au rendu,
// rien n'est peint si la figure a déjà une image : sprite de la nouvelle clé s'il existe, sinon l'image affichée (et sa clé
// détenue) reste et la nouvelle clé est mise en file ; la boucle (poseFigure, data-palette déjà à jour) la pose dès qu'elle
// est peinte. Seule une première apparition peint tout de suite (ensure). La clé affichée est détenue dès la mise en page,
// libérée au démontage ; les sprites de l'ancienne palette, libérés, partent avec le plafond.
export function GhibliFigure({ outfit, sky, rainy, umbrella, initial, hidden = false }: { outfit: Outfit; sky: Sky; rainy: boolean; umbrella: boolean; initial: Pose; hidden?: boolean }): ReactElement {
  const reg = useFigureRegistry();
  const ref = useRef<SVGGElement | null>(null);
  const sig = signatureOf(shapeOf(outfit, umbrella));
  const pk = reg.addPalette(figurePalette(outfit, sky, rainy));
  const key = { sig, ...initial };
  const sk = spriteKey(pk, key);
  let shownKey: string | undefined;
  let href: string | undefined;
  if (!hidden) {
    // Image déjà affichée par ce nœud (rendu précédent ou boucle) : lue sur le nœud lui-même.
    const node = ref.current;
    const prevKey = node?.getAttribute('data-key') ?? null;
    const prevHref = node?.firstElementChild?.getAttribute('href') ?? null;
    if (reg.has(sk) || prevKey === null || prevHref === null) {
      shownKey = sk;
      href = reg.ensure(pk, key) ?? undefined;
    } else {
      shownKey = prevKey;
      href = prevHref;
      reg.request(pk, key);
    }
  }
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const shown = node.getAttribute('data-key');
    if (!hidden && shown !== null) reg.hold(node, shown);
    return () => void reg.hold(node, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, sk, hidden]);
  return (
    <g data-figure="" data-sig={sig} data-palette={pk} data-key={shownKey} ref={ref}>
      <image href={href} x={SPRITE_BOX.x0} y={SPRITE_BOX.y0} width={SPRITE_BOX.w} height={SPRITE_BOX.h} />
    </g>
  );
}

// Pose d'une figure par la boucle : n'écrit que si la pose change ; sprite manquant → demandé, image courante gardée. Une
// figure cachée (sans data-key) est remise en place tout de suite (sprite peint au besoin) : pas d'image vide à l'apparition.
export function poseFigure(reg: FigureRegistry, node: Element | null, pose: Pose): void {
  if (!node) return;
  const sig = node.getAttribute('data-sig');
  const pk = node.getAttribute('data-palette');
  if (!sig || pk === null) return;
  const key = { sig, ...pose };
  const sk = spriteKey(pk, key);
  const shown = node.getAttribute('data-key');
  if (shown === sk) return;
  if ((shown === null ? reg.ensure(pk, key) : reg.request(pk, key)) === null) return;
  const href = reg.hold(node, sk);
  if (!href) return;
  node.setAttribute('data-key', sk);
  node.firstElementChild?.setAttribute('href', href);
}

// Cache une figure (nœud devenu inactif) : <image> sans href, data-key effacé, clé libérée. Idempotent.
export function hideFigure(reg: FigureRegistry, node: Element | null): void {
  if (!node) return;
  const img = node.firstElementChild;
  if (!node.hasAttribute('data-key') && !img?.hasAttribute('href')) return;
  img?.removeAttribute('href');
  node.removeAttribute('data-key');
  reg.hold(node, null);
}

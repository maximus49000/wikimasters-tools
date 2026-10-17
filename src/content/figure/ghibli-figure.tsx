// src/content/figure/ghibli-figure.tsx
import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { anchorsOf, keyString, type Anchor, type FigureKey } from '../../core/library/figure/bake';
import { shapeOf, signatureOf, type Work } from '../../core/library/figure/dress';
import type { ArmPose } from '../../core/library/figure/skeleton';
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
// `santa` : tenue du père Noël (bottes noires ; les cases de la tenue sont toujours présentes, la clé de palette est complète).
export function figurePalette(o: Outfit, sky: Sky, rainy: boolean, santa = false): Palette {
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
    shoe: santa ? '#1E1A18' : '#3a2a24',
    umb: '#C0392B',
    // Tenues de travail : gilet orange, bande claire (rétroréfléchissante), tablier écru.
    vest: '#F28C28',
    band: '#E8E8E0',
    apron: '#F4F1EA',
    // Père Noël (G5) : barbe, fourrure et gants écrus, ceinture noire, boucle dorée, nez et joues rosés.
    beard: '#F6F3EC',
    fur: '#F6F3EC',
    glove: '#F6F3EC',
    belt: '#231A16',
    buckle: '#E8B93A',
    nose: '#E8A090',
    cheek: '#F0A8A0',
  };
  const p: Palette = { 'f-ink': t('#33241f'), 'f-ground': '#3a2f5a' };
  for (const [k, c] of Object.entries(slots)) {
    p[`f-${k}`] = t(c);
    p[`fs-${k}`] = t(shadeOf(c));
  }
  return p;
}

// Pose demandée par les sites : geste des bras et penché facultatifs (défauts : balancement de marche, droit).
export type PoseIn = Omit<FigureKey, 'sig' | 'arms' | 'lean'> & { arms?: ArmPose; lean?: number };
const keyOf = (sig: string, p: PoseIn): FigureKey => ({ sig, yaw: p.yaw, gait: p.gait, phase: p.phase, head: p.head, arms: p.arms ?? 'swing', lean: p.lean ?? 0 });
// Objet tenu (outil, plateau, panneau…) : dessiné après l'<image>, translaté sur une accroche du pantin (repère du sprite) ;
// `hands` : milieu des deux mains (carton porté à deux mains).
export type HeldAnchor = Anchor | 'hands';
export type Held = { anchor: HeldAnchor; node: ReactNode };

// Transforms des accroches par clé de pose (chaînes prêtes, relues à chaque changement de pose) ; vidées au-delà de 4096.
const heldCache = new Map<string, Record<HeldAnchor, string>>();
function heldTransforms(key: FigureKey): Record<HeldAnchor, string> {
  const ks = keyString(key);
  let t = heldCache.get(ks);
  if (!t) {
    const a = anchorsOf(key);
    const tr = (p: readonly [number, number]): string => `translate(${p[0]} ${p[1]})`;
    const hands = [(a.handR[0] + a.handL[0]) / 2, (a.handR[1] + a.handL[1]) / 2] as const;
    t = { handR: tr(a.handR), handL: tr(a.handL), head: tr(a.head), headTop: tr(a.headTop), nape: tr(a.nape), seat: tr(a.seat), hands: tr(hands) };
    if (heldCache.size >= 4096) heldCache.clear();
    heldCache.set(ks, t);
  }
  return t;
}
// Pose affichée par chaque nœud (posée par la boucle ou au rendu) : les objets tenus suivent l'image réellement montrée.
const shownPoses = new WeakMap<Element, FigureKey>();

// Sommet de la tête (repère local de la figure) de la pose actuellement montrée ; null si le nœud n'a aucune pose affichée.
// L'image du sprite a une grande marge transparente au-dessus du crâne : la boîte écran du nœud ne donne pas le haut de la tête.
export function figureHeadTop(node: Element): readonly [number, number] | null {
  const key = shownPoses.get(node);
  return key ? anchorsOf(key).headTop : null;
}

// `hidden` : nœud inactif (habitant chez lui, client absent, passant hors présence) : <image> sans href, aucun sprite peint ;
// la boucle le remet en place par poseFigure. La palette suit le rendu (à la minute, avec le ciel, par paliers) ; au rendu,
// rien n'est peint si la figure a déjà une image : sprite de la nouvelle clé s'il existe, sinon l'image affichée (et sa clé
// détenue) reste et la nouvelle clé est mise en file ; la boucle (poseFigure, data-palette déjà à jour) la pose dès qu'elle
// est peinte. Seule une première apparition peint tout de suite (ensure). La clé affichée est détenue dès la mise en page,
// libérée au démontage ; les sprites de l'ancienne palette, libérés, partent avec le plafond.
// `work` : tenue de travail (dans la signature) ; `santa` : tenue du père Noël (dans la signature et la palette) ; `held` :
// objets tenus, posés aux accroches de la pose affichée dès le rendu (les foules immobiles n'appellent jamais poseFigure),
// déplacés ensuite par poseFigure, cachés avec la figure.
export function GhibliFigure({
  outfit,
  sky,
  rainy,
  umbrella,
  initial,
  hidden = false,
  work = 'none',
  santa = false,
  held,
}: {
  outfit: Outfit;
  sky: Sky;
  rainy: boolean;
  umbrella: boolean;
  initial: PoseIn;
  hidden?: boolean;
  work?: Work;
  santa?: boolean;
  held?: readonly Held[];
}): ReactElement {
  const reg = useFigureRegistry();
  const ref = useRef<SVGGElement | null>(null);
  const sig = signatureOf(shapeOf(outfit, umbrella, work, santa));
  const pk = reg.addPalette(figurePalette(outfit, sky, rainy, santa));
  const key = keyOf(sig, initial);
  const sk = spriteKey(pk, key);
  let shownKey: string | undefined;
  let href: string | undefined;
  // Pose des objets tenus : celle de l'image gardée tant que la nouvelle clé n'est pas peinte.
  let heldPose = key;
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
      heldPose = (node && shownPoses.get(node)) ?? key;
      reg.request(pk, key);
    }
  }
  const heldAt = held && held.length > 0 ? heldTransforms(heldPose) : null;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const shown = node.getAttribute('data-key');
    if (!hidden && shown === sk) shownPoses.set(node, key);
    if (!hidden && shown !== null) reg.hold(node, shown);
    return () => void reg.hold(node, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, sk, hidden]);
  return (
    <g data-figure="" data-sig={sig} data-palette={pk} data-key={shownKey} ref={ref}>
      <image href={href} x={SPRITE_BOX.x0} y={SPRITE_BOX.y0} width={SPRITE_BOX.w} height={SPRITE_BOX.h} />
      {heldAt &&
        held!.map((h, i) => (
          <g key={i} data-held={h.anchor} transform={heldAt[h.anchor]} visibility={hidden ? 'hidden' : undefined}>
            {h.node}
          </g>
        ))}
    </g>
  );
}

// Pose d'une figure par la boucle : n'écrit que si la pose change ; sprite manquant → demandé, image courante gardée. Une
// figure cachée (sans data-key) est remise en place tout de suite (sprite peint au besoin) : pas d'image vide à l'apparition.
// Les objets tenus (enfants [data-held] après l'<image>) suivent la nouvelle image et redeviennent visibles.
export function poseFigure(reg: FigureRegistry, node: Element | null, pose: PoseIn): void {
  if (!node) return;
  const sig = node.getAttribute('data-sig');
  const pk = node.getAttribute('data-palette');
  if (!sig || pk === null) return;
  const key = keyOf(sig, pose);
  const sk = spriteKey(pk, key);
  const shown = node.getAttribute('data-key');
  if (shown === sk) return;
  if ((shown === null ? reg.ensure(pk, key) : reg.request(pk, key)) === null) return;
  const href = reg.hold(node, sk);
  if (!href) return;
  node.setAttribute('data-key', sk);
  node.firstElementChild?.setAttribute('href', href);
  shownPoses.set(node, key);
  const kids = node.children;
  if (kids.length < 2) return;
  const t = heldTransforms(key);
  for (let i = 1; i < kids.length; i++) {
    const h = kids[i]!;
    const a = h.getAttribute('data-held') as HeldAnchor | null;
    if (a === null) continue;
    h.setAttribute('transform', t[a]);
    h.removeAttribute('visibility');
  }
}

// Cache une figure (nœud devenu inactif) : <image> sans href, data-key effacé, clé libérée, objets tenus cachés. Idempotent.
export function hideFigure(reg: FigureRegistry, node: Element | null): void {
  if (!node) return;
  const img = node.firstElementChild;
  if (!node.hasAttribute('data-key') && !img?.hasAttribute('href')) return;
  img?.removeAttribute('href');
  node.removeAttribute('data-key');
  shownPoses.delete(node);
  reg.hold(node, null);
  const kids = node.children;
  for (let i = 1; i < kids.length; i++) if (kids[i]!.hasAttribute('data-held')) kids[i]!.setAttribute('visibility', 'hidden');
}

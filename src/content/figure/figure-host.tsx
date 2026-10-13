// src/content/figure/figure-host.tsx
import { createContext, useContext } from 'react';
import { INK_WIDTH, bakeFigure, keyString, type FigureKey } from '../../core/library/figure/bake';
import { shapeFromSignature } from '../../core/library/figure/dress';
import { riding } from '../../core/library/figure/skeleton';

// Cache des sprites du pantin (G3) : chaque pose cuite (bake.ts) d'une palette est peinte UNE fois sur un canvas hors écran
// puis gardée en PNG (data URL : la CSP de la page hôte refuse blob:) ; chaque humain n'est qu'une <image> dont la boucle
// change le href. Changer le href d'une <image> ne reconstruit rien, alors que changer celui d'un <use> recopiait les
// ≈ 45 éléments du symbole (mesuré : 30 changements par image coûtaient 40 ms avec <use>, ≈ rien avec <image>).
// Palette = couleurs déjà calculées de la tenue (cases éclairées `f-…`, ombres `fs-…`, encre, sol) ; clé de sprite =
// clé de palette + '#' + pose. Plafond de sprites (les moins récemment utilisés partent) et budget de rendus par image :
// tant qu'un sprite manque, la figure garde son image courante (poseFigure).
// Détenteurs : chaque nœud de figure déclare la clé qu'il affiche (hold) ; l'éviction ne retire jamais une clé détenue et
// n'interroge pas le DOM (compteur par clé).
export type Palette = Record<string, string>;
// Cadre du sprite en unités du pantin (pieds à l'origine) et résolution (px par unité). Mesuré sur toutes les signatures et
// allures (trait compris) : sans parapluie |x| ≤ 13,1, avec parapluie |x| ≤ 19,6 ; y de −51,3 à 3,1. D'où ±20 en largeur.
// Vélo arrêté (`perch`) : le pied posé descend jusqu'au sol, 6 unités sous l'origine (bas du cadre à +10).
export const SPRITE_BOX = { x0: -20, y0: -64, w: 40, h: 74 } as const;
export const SPRITE_PX = 3;
// PNG 1×1 transparent : repli sans canvas (jsdom), les tests vérifient les clés, pas les pixels.
export const BLANK_SPRITE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
// Cases de couleur du pantin ; `vest`, `band`, `apron` : tenues de travail (gilet, sa bande claire, tablier).
export const FIGURE_SLOTS = ['skin', 'top', 'bottom', 'hair', 'hat', 'acc', 'shoe', 'umb', 'vest', 'band', 'apron'] as const;
// Ordre fixe des cases : la clé ne dépend pas de l'ordre d'insertion de l'objet.
const PALETTE_ORDER = ['f-ink', 'f-ground', ...FIGURE_SLOTS.flatMap((s) => [`f-${s}`, `fs-${s}`])];
// Palettes retenues (une par tenue et par teinte du ciel, renouvelée à chaque rendu React) : les plus anciennes partent.
const MAX_PALETTES = 2048;

export const paletteKey = (p: Palette): string => PALETTE_ORDER.map((k) => p[k] ?? '').join(',');
export const spriteKey = (pk: string, key: FigureKey): string => `${pk}#${keyString(key)}`;

// Canvas de rendu partagé (un seul, effacé à chaque sprite) ; null sans canvas 2D. Sous jsdom, pas même d'appel :
// getContext y signale « Not implemented » à chaque fois. `willReadFrequently` : canvas en mémoire (pas sur le GPU) — sur
// téléphone, toDataURL d'un canvas GPU attend la relecture des pixels (la moitié du temps d'image au 21 juin, mesuré).
let surface: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null | undefined;
function getSurface(): typeof surface {
  if (surface !== undefined) return surface;
  surface = null;
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return surface;
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_BOX.w * SPRITE_PX;
  canvas.height = SPRITE_BOX.h * SPRITE_PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) surface = { canvas, ctx };
  return surface;
}

// Peint une pose avec une palette, dans l'ordre de l'ancien symbole : ombre portée, puis par groupe le trait d'encre
// (rempli + épaissi) et chaque pièce (ombre puis éclairé), enfin les yeux.
function paint(p: Palette, key: FigureKey): string {
  const s = getSurface();
  if (!s) return BLANK_SPRITE;
  const { canvas, ctx } = s;
  const baked = bakeFigure(shapeFromSignature(key.sig), key);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(SPRITE_PX, 0, 0, SPRITE_PX, -SPRITE_BOX.x0 * SPRITE_PX, -SPRITE_BOX.y0 * SPRITE_PX);
  const ink = p['f-ink'] ?? '#33241f';
  // Ombre au sol, sauf en selle (vélo, cheval, moto : le corps ne touche pas le sol).
  if (!riding(key.gait)) {
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = p['f-ground'] ?? '#3a2f5a';
    ctx.beginPath();
    ctx.ellipse(0, 0.6, 7, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = INK_WIDTH * 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  for (const grp of baked.groups) {
    const outline = new Path2D(grp.ink);
    ctx.fillStyle = ink;
    ctx.fill(outline);
    ctx.stroke(outline);
    for (const part of grp.parts) {
      ctx.fillStyle = p[`fs-${part.slot}`] ?? ink;
      ctx.fill(new Path2D(part.shade));
      if (part.lit) {
        ctx.fillStyle = p[`f-${part.slot}`] ?? ink;
        ctx.fill(new Path2D(part.lit));
      }
    }
  }
  ctx.fillStyle = ink;
  for (const [x, y] of baked.eyes) {
    ctx.beginPath();
    ctx.ellipse(x, y, 0.5, 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL('image/png');
}

// Plafond de sprites des vues de la bibliothèque (RoomView, ScenePanorama) : la rue Ghibli des commerces (G4b) dépasse
// 1 500 poses en vue à midi.
export const FIGURE_SPRITES_MAX = 2400;

export class FigureRegistry {
  private readonly palettes = new Map<string, Palette>();
  // Sprites : clé → data URL, dans l'ordre d'usage (le début de la Map part en premier).
  private readonly sprites = new Map<string, string>();
  // File de rendu : clé → palette, pose et numéro de l'image de la dernière demande (les demandes abandonnées partent).
  private readonly queue = new Map<string, { pk: string; key: FigureKey; at: number }>();
  private readonly holders = new WeakMap<Element, string>();
  private readonly counts = new Map<string, number>();
  private frame = 0;
  private readonly max: number;
  private readonly perFrame: number;
  // `label` : nom de l'affichage (repère au débogage).
  constructor(
    readonly label: string,
    opts: { max?: number; perFrame?: number } = {},
  ) {
    this.max = opts.max ?? 1500;
    this.perFrame = opts.perFrame ?? 8;
  }
  size(): number {
    return this.sprites.size;
  }
  has(sk: string): boolean {
    return this.sprites.has(sk);
  }
  // Retient une palette (rafraîchit son rang) et rend sa clé.
  addPalette(p: Palette): string {
    const pk = paletteKey(p);
    this.palettes.delete(pk);
    this.palettes.set(pk, p);
    if (this.palettes.size > MAX_PALETTES) this.palettes.delete(this.palettes.keys().next().value as string);
    return pk;
  }
  // Image d'un sprite existant (rafraîchit son rang d'usage), sinon null.
  private hit(sk: string): string | null {
    const url = this.sprites.get(sk);
    if (url === undefined) return null;
    this.sprites.delete(sk);
    this.sprites.set(sk, url);
    return url;
  }
  private create(pk: string, key: FigureKey, sk: string): string | null {
    this.queue.delete(sk);
    const p = this.palettes.get(pk);
    if (!p) return null;
    const url = paint(p, key);
    this.sprites.set(sk, url);
    return url;
  }
  // Sprite tout de suite (peint hors budget au besoin) ; null si la palette est inconnue.
  ensure(pk: string, key: FigureKey): string | null {
    const sk = spriteKey(pk, key);
    return this.hit(sk) ?? this.create(pk, key, sk);
  }
  // Sprite s'il existe, sinon mis en file (peint par flush) et null.
  request(pk: string, key: FigureKey): string | null {
    const sk = spriteKey(pk, key);
    const found = this.hit(sk);
    if (!found && this.palettes.has(pk)) this.queue.set(sk, { pk, key, at: this.frame });
    return found;
  }
  // Associe au nœud `node` la clé de sprite qu'il affiche (null : le libère). La nouvelle clé n'est détenue que si son sprite
  // existe (sinon rien ne change : la figure garde son image) ; l'ancienne est alors libérée. Rend l'image ou null.
  hold(node: Element, sk: string | null): string | null {
    const prev = this.holders.get(node);
    if (sk === null) {
      if (prev !== undefined) {
        this.holders.delete(node);
        this.release(prev);
      }
      return null;
    }
    const url = this.hit(sk);
    if (url === null) return null;
    if (prev === sk) return url;
    this.holders.set(node, sk);
    this.counts.set(sk, (this.counts.get(sk) ?? 0) + 1);
    if (prev !== undefined) this.release(prev);
    return url;
  }
  private release(sk: string): void {
    const n = (this.counts.get(sk) ?? 0) - 1;
    if (n > 0) this.counts.set(sk, n);
    else this.counts.delete(sk);
  }
  flush(): void {
    // Demandes non renouvelées depuis plus de 2 images (un marcheur a déjà demandé la phase suivante) : jetées avant de peindre.
    for (const [sk, q] of this.queue) if (this.frame - q.at > 2) this.queue.delete(sk);
    this.frame++;
    let made = 0;
    for (const [sk, { pk, key }] of [...this.queue]) {
      if (made >= this.perFrame) break;
      if (this.create(pk, key, sk) !== null) made++;
    }
    // Plafond : retirer les moins récemment utilisés (début de la Map), jamais une clé détenue : elle passe en fin de Map. Une
    // passe complète sans retrait s'arrête (la taille peut alors dépasser le plafond).
    let skipped = 0;
    while (this.sprites.size > this.max && skipped < this.sprites.size) {
      const [sk, url] = this.sprites.entries().next().value as [string, string];
      this.sprites.delete(sk);
      if (this.counts.has(sk)) {
        this.sprites.set(sk, url);
        skipped++;
        continue;
      }
      skipped = 0;
    }
  }
}

let shared: FigureRegistry | null = null;
export const FigureContext = createContext<FigureRegistry | null>(null);
// Registre de l'affichage (pièce, panorama) ; repli : registre partagé (les sprites ne vivent pas dans le DOM). Le repli
// suppose une seule couche (tests, rendu isolé) : un seul budget par image, un seul flush ; chaque scène réelle (RoomView,
// panorama) pose son propre FigureContext.Provider.
export function useFigureRegistry(): FigureRegistry {
  const r = useContext(FigureContext);
  if (r) return r;
  shared ??= new FigureRegistry('wmt-fig');
  return shared;
}

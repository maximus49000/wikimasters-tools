// src/content/figure/figure-host.tsx
import { createContext, useContext, useEffect, useRef, type ReactElement } from 'react';
import { INK_WIDTH, bakeFigure, keyString, type FigureKey } from '../../core/library/figure/bake';
import { shapeFromSignature } from '../../core/library/figure/dress';

// Hôte des symboles du pantin (G3) : les poses cuites (bake.ts) sont rangées dans un groupe des <defs> de la pièce, HORS de
// la couche des acteurs recopiée par <use> dans chaque fenêtre, et créées à la demande par le DOM (aucun re-rendu React).
// Chaque humain n'est qu'un <use> vers l'un d'eux. Plafond de symboles (les moins récemment utilisés partent) et budget de
// créations par image : tant qu'un symbole manque, la figure garde son image courante (poseFigure).
// Détenteurs : chaque nœud de figure déclare la clé qu'il affiche (hold) ; l'éviction ne retire jamais une clé détenue et
// n'interroge pas le DOM (une recherche `use[href]` par candidat coûtait l'essentiel de l'image, ≈ 56 000 nœuds).
const SVG_NS = 'http://www.w3.org/2000/svg';

export class FigureRegistry {
  readonly root: SVGGElement;
  private readonly ids = new Map<string, string>();
  private readonly nodes = new Map<string, SVGGElement>();
  // File de création : clé → pose et numéro de l'image de la dernière demande (les demandes abandonnées partent).
  private readonly queue = new Map<string, { key: FigureKey; at: number }>();
  private readonly holders = new WeakMap<Element, string>();
  private readonly counts = new Map<string, number>();
  private frame = 0;
  private next = 0;
  private readonly max: number;
  private readonly perFrame: number;
  constructor(
    private readonly prefix: string,
    opts: { max?: number; perFrame?: number } = {},
  ) {
    this.root = document.createElementNS(SVG_NS, 'g');
    this.max = opts.max ?? 900;
    this.perFrame = opts.perFrame ?? 8;
  }
  size(): number {
    return this.nodes.size;
  }
  // Référence d'un symbole existant (rafraîchit son rang d'usage), sinon null.
  private hit(k: string): string | null {
    const id = this.ids.get(k);
    if (!id) return null;
    const node = this.nodes.get(k)!;
    this.nodes.delete(k);
    this.nodes.set(k, node);
    return `#${id}`;
  }
  private create(key: FigureKey): string {
    const k = keyString(key);
    const id = `${this.prefix}-${(this.next++).toString(36)}`;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('id', id);
    const baked = bakeFigure(shapeFromSignature(key.sig), key);
    const path = (d: string, fill: string, stroke?: string): void => {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', fill);
      if (stroke) {
        p.setAttribute('stroke', stroke);
        p.setAttribute('stroke-width', String(INK_WIDTH * 2));
        p.setAttribute('stroke-linejoin', 'round');
      }
      g.append(p);
    };
    const shadow = document.createElementNS(SVG_NS, 'ellipse');
    for (const [a, v] of [['cx', '0'], ['cy', '0.6'], ['rx', '7'], ['ry', '1.8'], ['fill', 'var(--f-ground)'], ['opacity', '0.28']]) shadow.setAttribute(a!, v!);
    g.append(shadow);
    for (const grp of baked.groups) {
      path(grp.ink, 'var(--f-ink)', 'var(--f-ink)');
      for (const part of grp.parts) {
        path(part.shade, `var(--fs-${part.slot})`);
        if (part.lit) path(part.lit, `var(--f-${part.slot})`);
      }
    }
    for (const [x, y] of baked.eyes) {
      const e = document.createElementNS(SVG_NS, 'ellipse');
      for (const [a, v] of [['cx', String(x)], ['cy', String(y)], ['rx', '0.5'], ['ry', '0.75'], ['fill', 'var(--f-ink)']]) e.setAttribute(a!, v!);
      g.append(e);
    }
    this.root.append(g);
    this.ids.set(k, id);
    this.nodes.set(k, g);
    this.queue.delete(k);
    return `#${id}`;
  }
  ensure(key: FigureKey): string {
    return this.hit(keyString(key)) ?? this.create(key);
  }
  request(key: FigureKey): string | null {
    const k = keyString(key);
    const found = this.hit(k);
    if (!found) this.queue.set(k, { key, at: this.frame });
    return found;
  }
  // Associe au nœud `node` la clé qu'il affiche (null : le libère). La nouvelle clé n'est détenue que si son symbole existe
  // (sinon demandée, rien ne change : la figure garde son image) ; l'ancienne est alors libérée. Rend la référence ou null.
  hold(node: Element, key: FigureKey | null): string | null {
    const prev = this.holders.get(node);
    if (!key) {
      if (prev !== undefined) {
        this.holders.delete(node);
        this.release(prev);
      }
      return null;
    }
    const href = this.request(key);
    if (!href) return null;
    const k = keyString(key);
    if (prev === k) return href;
    this.holders.set(node, k);
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
    if (prev !== undefined) this.release(prev);
    return href;
  }
  private release(k: string): void {
    const n = (this.counts.get(k) ?? 0) - 1;
    if (n > 0) this.counts.set(k, n);
    else this.counts.delete(k);
  }
  flush(): void {
    // Demandes non renouvelées depuis plus de 2 images (un marcheur a déjà demandé la phase suivante) : jetées avant de créer.
    for (const [k, q] of this.queue) if (this.frame - q.at > 2) this.queue.delete(k);
    this.frame++;
    let made = 0;
    for (const { key } of [...this.queue.values()]) {
      if (made >= this.perFrame) break;
      this.create(key);
      made++;
    }
    // Plafond : retirer les moins récemment utilisés (début de la Map), jamais une clé détenue : elle passe en fin de Map. Une
    // passe complète sans retrait s'arrête (la taille peut alors dépasser le plafond).
    let skipped = 0;
    while (this.nodes.size > this.max && skipped < this.nodes.size) {
      const [k, node] = this.nodes.entries().next().value as [string, SVGGElement];
      if (this.counts.has(k)) {
        this.nodes.delete(k);
        this.nodes.set(k, node);
        skipped++;
        continue;
      }
      node.remove();
      this.nodes.delete(k);
      this.ids.delete(k);
      skipped = 0;
    }
  }
}

let shared: FigureRegistry | null = null;
export const FigureContext = createContext<FigureRegistry | null>(null);
export function useFigureRegistry(): FigureRegistry {
  const r = useContext(FigureContext);
  if (r) return r;
  shared ??= new FigureRegistry('wmt-fig');
  return shared;
}

// Accueille le groupe des symboles du registre dans les <defs> de la pièce.
export function FigureDefs({ registry }: { registry: FigureRegistry }): ReactElement {
  const ref = useRef<SVGGElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.append(registry.root);
    return () => registry.root.remove();
  }, [registry]);
  return <g data-figure-defs="" ref={ref} />;
}

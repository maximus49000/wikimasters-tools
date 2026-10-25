import { createContext, memo, useContext, useEffect, useReducer, useRef, type ReactElement, type ReactNode, type RefObject } from 'react';
import { centeredOf, yawOf } from '../../core/library/cel/camera';
import type { LightSide } from '../../core/library/cel/light';
import { REST_LIFE, type LifeState } from '../../core/library/cel/life-state';
import { lookOf } from '../../core/library/cel/looks';
import { place } from '../../core/library/cel/mesh';
import { celItemPartsOf, celPartsOf } from '../../core/library/cel/models';
import { SPRITE_KEY_PREFIX, spriteKey } from '../../core/library/cel/sprite-key';
import type { Angle } from '../../core/library/footprint';
import { FURNITURE_MODELS } from '../../core/library/furniture-models';
import { CELL_H, CELL_W, FACE_CAMERA, spriteFrameOf, type Camera } from '../../core/library/furniture-render3d';
import { itemModel, type ItemPlacement } from '../../core/library/item-models';
import type { StandingKind, StyleId } from '../../core/library/library-types';
import type { PxRect } from '../../core/library/room-grid';
import { paletteOf, type Palette } from '../../core/library/styles';
import { CarriedItem3D, CarriedItemSpriteArt, Model3DArt, ModelDecals, itemsKey, sameCarried, sameModel3D, type CarriedItem3DProps, type ItemContent, type Model3DArtProps, type ModelPart } from '../model3d-art';
import { spriteJob, type PaintedSprite } from './sprite-paint';
import { createSpriteStore, type SpriteStore } from './sprite-store';

// Hôte des sprites cellulo des meubles (G6) : chaque meuble debout et chaque objet porté est une image peinte (moteur cel), posée en
// <image> à la place exacte de son dessin à boîtes (Model3DArt), qui reste affiché tant que l'image n'est pas prête. Les décors des faces
// (couvertures de cartes, tranches, écrans) restent en SVG par-dessus : une image de site tiers ne passe jamais dans un canvas.

// px d'image par px de pièce, et suréchantillonnage du rendu (spec G6 §5).
export const SPRITE_PX = 3;
export const SPRITE_SS = 2;

type Job = ReturnType<typeof spriteJob>;
// `read` : lecture en cours dans la mémoire persistante (rien n'est peint en attendant) ; `paint` : à peindre ou en cours ;
// `encode` : rendu fini, encodage (finish → toDataURL) reporté à l'image suivante.
type Pending = { make: () => Job; job: Job | null; done: Map<() => void, boolean>; priority: number; seq: number; state: 'read' | 'paint' | 'encode' };
export type WantOptions = {
  /** Vrai quand celui qui attend montre encore un repli (aucune image de ce meuble) : la pompe se presse. */
  urgent?: boolean;
  /** Plus grand = peint d'abord (surface affichée ; un meuble à l'écran passe avant). */
  priority?: number;
};

// Budget de peinture par image tant qu'un repli est affiché (6 ms sinon) : autant que le temps passé ailleurs depuis l'image
// précédente (la cuisson prend environ la moitié du fil principal), entre RUSH_MS et RUSH_MAX_MS. Sur un appareil rapide (images
// de 16 ms), ~12 ms ; sur un fil saturé (banc à CPU ×4 : plusieurs centaines de ms entre deux images), jusqu'à RUSH_MAX_MS.
export const RUSH_MS = 12;
export const RUSH_MAX_MS = 150;

// Génération du dessin pour la mémoire persistante : version du dessin et suréchantillonnage (une image gardée n'est relue que
// si elle a été peinte par le même dessin).
const SPRITE_GEN = `${SPRITE_KEY_PREFIX}ss${SPRITE_SS}`;
let sharedStore: SpriteStore | null | undefined;
// Mémoire de l'appareil partagée par toutes les pièces (une seule base ouverte) ; null sans IndexedDB (vitest/jsdom).
export function defaultSpriteStore(): SpriteStore | null {
  if (sharedStore !== undefined) return sharedStore;
  let factory: IDBFactory | null = null;
  try {
    factory = typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    factory = null; // accès refusé (iframe sans stockage)
  }
  return (sharedStore = createSpriteStore({ factory, gen: SPRITE_GEN }));
}

// Registre des images peintes : file des demandes menée par tranches de temps à chaque image d'animation, cache LRU plafonné en
// nombre (`max`) et en octets (`maxBytes` : somme des longueurs des data URL), mémoire persistante (`store`) relue avant de peindre.
// - Budget par image : tant qu'au moins un demandeur montre un repli, le temps passé ailleurs depuis la fin de l'image précédente,
//   borné à [`rushMs`, `rushMaxMs`] ; `budgetMs` sinon (paliers de vie d'une pièce complète).
// - Dans une image, la tâche commencée avance d'abord (un seul tampon de rendu à la fois), puis la plus prioritaire (repli d'abord,
//   puis la plus grande surface, puis la plus ancienne demande) ; plusieurs tâches avancent tant que le budget le permet.
// - L'encodage d'une image finie (putImageData + toDataURL, coûteux sur Android) est fait au début de l'image suivante.
// Une image relue repasse en fin de LRU.
export class SpriteRegistry {
  private readonly sprites = new Map<string, PaintedSprite>();
  private total = 0;
  private readonly queue = new Map<string, Pending>();
  private seq = 0;
  private pending = false;
  private readonly max: number;
  private readonly maxBytes: number;
  private readonly budgetMs: number;
  private readonly rushMs: number;
  private readonly rushMaxMs: number;
  private lastEnd: number | null = null;
  private readonly schedule: (cb: () => void) => void;
  private readonly now: () => number;
  private readonly store: SpriteStore | null;
  constructor(
    readonly label: string,
    opts: { max?: number; maxBytes?: number; budgetMs?: number; rushMs?: number; rushMaxMs?: number; schedule?: (cb: () => void) => void; now?: () => number; store?: SpriteStore | null } = {},
  ) {
    this.max = opts.max ?? 220;
    this.maxBytes = opts.maxBytes ?? 48e6;
    this.budgetMs = opts.budgetMs ?? 6;
    this.rushMs = opts.rushMs ?? RUSH_MS;
    this.rushMaxMs = Math.max(this.rushMs, opts.rushMaxMs ?? RUSH_MAX_MS);
    this.schedule = opts.schedule ?? ((cb) => void requestAnimationFrame(() => cb()));
    this.now = opts.now ?? (() => performance.now());
    this.store = opts.store === undefined ? defaultSpriteStore() : opts.store;
    // Base ouverte dès la création (pendant le premier rendu de la pièce) : au premier want(), on sait déjà ce qui est gardé.
    this.store?.warm();
  }
  size(): number {
    return this.sprites.size;
  }
  bytes(): number {
    return this.total;
  }
  /** Tâches en attente : lecture en mémoire, peinture ou encodage (0 = plus rien à faire). */
  pendingCount(): number {
    return this.queue.size;
  }
  get(k: string): PaintedSprite | null {
    const s = this.sprites.get(k);
    if (s === undefined) return null;
    this.sprites.delete(k);
    this.sprites.set(k, s);
    return s;
  }
  // Demande de peinture : `job` fabrique la tâche (au moment de la commencer), `done` est appelé quand l'image est prête. Rend
  // l'annulation : une clé que plus personne n'attend n'est pas peinte (sa tâche commencée est abandonnée).
  want(k: string, job: () => Job, done: () => void, o: WantOptions = {}): () => void {
    if (this.sprites.has(k)) {
      done();
      return () => undefined;
    }
    const urgent = o.urgent ?? false;
    const q = this.queue.get(k);
    if (q) {
      q.done.set(done, urgent || (q.done.get(done) ?? false));
      q.priority = Math.max(q.priority, o.priority ?? 0);
    } else {
      const p: Pending = { make: job, job: null, done: new Map([[done, urgent]]), priority: o.priority ?? 0, seq: this.seq++, state: this.store ? 'read' : 'paint' };
      this.queue.set(k, p);
      if (this.store) this.recall(k, p, this.store);
    }
    this.pump();
    return () => {
      const p = this.queue.get(k);
      if (!p) return;
      p.done.delete(done);
      if (p.done.size === 0) this.queue.delete(k);
    };
  }
  // Lecture dans la mémoire de l'appareil : trouvée, l'image est prête sans peinture ; absente (ou pas de réponse dans le délai
  // maximal de la mémoire), la tâche passe à la peinture, et une image arrivée en retard la remplace.
  private recall(k: string, p: Pending, store: SpriteStore): void {
    const paint = (): void => {
      p.state = 'paint';
      this.pump();
    };
    const found = (s: PaintedSprite): void => {
      this.put(k, s);
      if (this.queue.get(k) !== p) return;
      // Image prête : la peinture éventuellement commencée (lecture arrivée après le délai maximal) est abandonnée.
      this.queue.delete(k);
      for (const d of p.done.keys()) d();
    };
    store.read(k, found).then((s) => (s ? found(s) : paint()), paint);
  }
  private put(k: string, s: PaintedSprite): void {
    const old = this.sprites.get(k);
    if (old) this.total -= old.url.length;
    this.sprites.delete(k);
    this.sprites.set(k, s);
    this.total += s.url.length;
    // La dernière image peinte reste toujours (même seule au-dessus du plafond d'octets).
    while (this.sprites.size > 1 && (this.sprites.size > this.max || this.total > this.maxBytes)) {
      const [oldest, v] = this.sprites.entries().next().value as [string, PaintedSprite];
      this.sprites.delete(oldest);
      this.total -= v.url.length;
    }
  }
  private static urgent(q: Pending): boolean {
    for (const u of q.done.values()) if (u) return true;
    return false;
  }
  // Prochaine tâche à peindre : celle déjà commencée, sinon la plus prioritaire.
  private next(): Pending | null {
    let best: Pending | null = null;
    let bestUrgent = false;
    for (const q of this.queue.values()) {
      if (q.state !== 'paint') continue;
      if (q.job) return q;
      const urgent = SpriteRegistry.urgent(q);
      if (!best || (urgent && !bestUrgent) || (urgent === bestUrgent && (q.priority > best.priority || (q.priority === best.priority && q.seq < best.seq)))) {
        best = q;
        bestUrgent = urgent;
      }
    }
    return best;
  }
  private busy(): boolean {
    for (const q of this.queue.values()) if (q.state !== 'read') return true;
    return false;
  }
  private rushing(): boolean {
    for (const q of this.queue.values()) if (q.state !== 'read' && SpriteRegistry.urgent(q)) return true;
    return false;
  }
  private pump(): void {
    if (this.pending) return;
    if (!this.busy()) {
      // File vide : le temps qui passe jusqu'à la prochaine demande n'est pas du temps « pris ailleurs ».
      this.lastEnd = null;
      return;
    }
    this.pending = true;
    this.schedule(() => {
      this.pending = false;
      const t0 = this.now();
      const elsewhere = this.lastEnd === null ? 0 : t0 - this.lastEnd;
      const budget = this.rushing() ? Math.min(this.rushMaxMs, Math.max(this.rushMs, elsewhere)) : this.budgetMs;
      // Encodages reportés de l'image précédente (au moins un par image, puis tant que le budget le permet).
      let first = true;
      const ready: (() => void)[] = [];
      for (const [k, q] of [...this.queue]) {
        if (q.state !== 'encode') continue;
        if (!first && this.now() - t0 >= budget) break;
        first = false;
        this.queue.delete(k);
        const s = q.job!.finish();
        this.put(k, s);
        void this.store?.write(k, s);
        ready.push(...q.done.keys());
      }
      // Annoncées ensemble, après les encodages : React regroupe les rendus d'une même tâche.
      for (const d of ready) d();
      for (let q = this.next(); q; q = this.next()) {
        const left = budget - (this.now() - t0);
        if (left <= 0) break;
        q.job ??= q.make();
        // Inachevée, la tâche reprend à l'image suivante ; finie, elle sera encodée au début de l'image suivante.
        if (!q.job.step(left)) break;
        q.state = 'encode';
      }
      this.lastEnd = this.now();
      this.pump();
    });
  }
}

export const SpriteContext = createContext<SpriteRegistry | null>(null);

// Un meuble à l'écran passe avant tous ceux qui n'y sont pas (la pièce paysage fait deux écrans de large).
const VISIBLE_BONUS = 1e9;
function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  // Sans mise en page (jsdom, élément pas encore posé) : considéré comme visible.
  if (r.width === 0 && r.height === 0) return true;
  const vw = window.innerWidth || document.documentElement.clientWidth, vh = window.innerHeight || document.documentElement.clientHeight;
  return r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
}

// Image de la clé, peinte à la demande. Tant que la nouvelle n'est pas prête (premier affichage, clé changée, image évincée), la
// dernière image montrée par ce composant reste : jamais de trou ni de clignotement. null avant la toute première image (repli).
// `priority` : surface affichée ; `el` : élément affiché, pour savoir s'il est à l'écran au moment de la demande (sans `el`, la
// priorité est prise telle quelle).
export function useSprite(key: string | null, job: () => Job, priority = 0, el?: RefObject<Element | null>): PaintedSprite | null {
  const reg = useContext(SpriteContext);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const jobRef = useRef(job);
  jobRef.current = job;
  const prio = useRef(priority);
  prio.current = priority;
  const last = useRef<PaintedSprite | null>(null);
  const cur = reg && key ? reg.get(key) : null;
  if (cur) last.current = cur;
  const missing = reg !== null && key !== null && cur === null;
  useEffect(() => {
    if (!missing) return undefined;
    const bonus = el?.current && onScreen(el.current) ? VISIBLE_BONUS : 0;
    return reg!.want(key!, () => jobRef.current(), bump, { urgent: last.current === null, priority: bonus + prio.current });
  }, [reg, key, missing, el]);
  return cur ?? last.current;
}

const camOf = (cam: Camera): 'room' | 'plunge' => (cam === FACE_CAMERA ? 'room' : 'plunge');
const r1 = (v: number): number => Math.round(v * 10) / 10;

export type FurnitureSpriteProps = Model3DArtProps & { style: StyleId; side: LightSide; life?: LifeState; lifeKey?: string; res?: number };

// Image peinte d'un meuble (null tant qu'aucune n'a été montrée). Un meuble garni d'objets (`items`, vues de zoom) n'est pas peint :
// ses objets ne sont pas dans l'image.
// `el` : groupe affiché du meuble (priorité aux meubles à l'écran, puis aux plus grands).
export function useFurnitureSprite(p: FurnitureSpriteProps, el?: RefObject<Element | null>): PaintedSprite | null {
  const { kind, angle, style, side, part } = p;
  const cam = p.camera ?? FACE_CAMERA;
  const model = FURNITURE_MODELS[kind];
  const lit = model.glow !== undefined && (p.lit ?? true);
  const res = p.res ?? SPRITE_PX;
  const key = p.items?.length ? null : spriteKey({ kind, angle, style, side, cam: camOf(cam), res, lit, life: p.lifeKey ?? '', ...(part && { part }) });
  return useSprite(key, () => {
    const frame = spriteFrameOf(model, angle, cam);
    const parts = celPartsOf(kind, lookOf(style), p.life ?? REST_LIFE, { lit, ...(part && { part }) });
    // Le surplomb (arc, dôme) passe par-dessus les meubles qu'il surplombe : son ombre au sol n'est pas dans son image.
    return spriteJob(parts, { cam: frame.cam, yaw: yawOf(angle), side, px: res, ss: SPRITE_SS, ...(part === 'overhang' && { shadow: null }) }, frame.anchor);
  }, p.rect.w * p.rect.h, el);
}

function FurnitureSpriteImpl(p: FurnitureSpriteProps): ReactElement {
  const el = useRef<SVGGElement>(null);
  const sprite = useFurnitureSprite(p, el);
  const { style: _style, side: _side, life: _life, lifeKey: _lifeKey, res: _res, ...art } = p;
  if (!sprite) {
    return (
      <g data-furniture-sprite="" ref={el}>
        <g data-sprite-fallback=""><Model3DArt {...art} /></g>
      </g>
    );
  }
  const { kind, angle, rect } = p;
  const frame = spriteFrameOf(FURNITURE_MODELS[kind], angle, p.camera ?? FACE_CAMERA);
  const [sx, sy] = [rect.w / (frame.cols * CELL_W), rect.h / (frame.rows * CELL_H)];
  const { box } = sprite;
  return (
    <g data-furniture-sprite="" ref={el}>
      <image href={sprite.url} x={r1(rect.x + sx * ((frame.cols * CELL_W) / 2 + box.x))} y={r1(rect.y + sy * (frame.rows * CELL_H + box.y))} width={r1(box.w * sx)} height={r1(box.h * sy)} preserveAspectRatio="none" />
      <DecalLayer kind={kind} angle={angle} rect={rect} content={p.content} items={p.items} camera={p.camera} palette={p.palette} steampunk={p.steampunk} part={p.part} />
    </g>
  );
}

// Meuble peint : <g data-furniture-sprite> avec son image et ses décors ; repli <g data-sprite-fallback><Model3DArt/></g> à la même place.
export const FurnitureSprite = memo(FurnitureSpriteImpl, (a, b) => sameModel3D(a, b) && a.style === b.style && a.side === b.side && a.life === b.life && a.lifeKey === b.lifeKey && a.res === b.res);

// Ce qui n'est montré que tant que le meuble n'a pas d'image peinte (ombre au sol du dessin à boîtes : celle du sprite est dans l'image).
export function UntilSprite({ children, ...p }: FurnitureSpriteProps & { children: ReactNode }): ReactElement | null {
  return useFurnitureSprite(p) ? null : <>{children}</>;
}

export type CarriedSpriteProps = CarriedItem3DProps & { style: StyleId; side: LightSide; res?: number };

function CarriedSpriteImpl(p: CarriedSpriteProps): ReactElement {
  const { host, angle, placement: pl, content, steampunk = false, style, side } = p;
  const cam = p.camera ?? FACE_CAMERA;
  const res = p.res ?? SPRITE_PX;
  // Allumé ou non : seulement pour un objet à abat-jour (petite lampe), allumé par défaut comme le dessin à boîtes.
  const lit = itemModel(pl.shape, steampunk, pl.box).pieces.some((q) => q.tag === 'glow') && (content?.lit ?? true);
  const key = spriteKey({ item: itemsKey([pl]), host, hostAngle: angle, style, side, cam: camOf(cam), res, lit });
  const sprite = useSprite(key, () => {
    // Rendu avec la caméra du porteur, à sa place chez lui : pièces de l'objet translatées au point de pose (repère centré du porteur).
    const hostModel = FURNITURE_MODELS[host];
    const frame = spriteFrameOf(hostModel, angle, cam);
    const t = centeredOf(hostModel, [pl.x, pl.y, pl.z]);
    const parts = celItemPartsOf(pl, lookOf(style), steampunk, { lit }).map((P) => ({ ...P, m: place(P.m, { t }) }));
    // Pas d'ombre au sol : l'objet est posé sur son porteur.
    return spriteJob(parts, { cam: frame.cam, yaw: yawOf(angle), side, px: res, ss: SPRITE_SS, shadow: null }, frame.anchor);
    // Petit et vite peint : compté comme à l'écran (après les meubles à l'écran, avant ceux qui n'y sont pas).
  }, VISIBLE_BONUS);
  const { style: _style, side: _side, res: _res, ...art } = p;
  if (!sprite) return <g data-sprite-fallback=""><CarriedItem3D {...art} /></g>;
  return <CarriedItemSpriteArt {...art} sprite={sprite} />;
}

// Objet porté peint (même groupe et même transformation que CarriedItem3D, décors par-dessus) ; repli CarriedItem3D.
export const CarriedSprite = memo(CarriedSpriteImpl, (a, b) => sameCarried(a, b) && a.style === b.style && a.side === b.side && a.res === b.res);

// Décors seuls d'un meuble (et des objets qui le garnissent), dans les mêmes cadres que Model3DArt, découpés à l'ouverture.
export function DecalLayer(props: { kind: StandingKind; angle: Angle; rect: PxRect; content?: Record<string, ItemContent>; items?: ItemPlacement[]; camera?: Camera; palette?: Palette; steampunk?: boolean; part?: ModelPart }): ReactElement {
  const { palette, ...rest } = props;
  return <ModelDecals {...rest} palette={palette ?? paletteOf('scandinave')} />;
}

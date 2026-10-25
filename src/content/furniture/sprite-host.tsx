import { createContext, memo, useContext, useEffect, useReducer, useRef, type ReactElement, type ReactNode } from 'react';
import { centeredOf, yawOf } from '../../core/library/cel/camera';
import type { LightSide } from '../../core/library/cel/light';
import { REST_LIFE, type LifeState } from '../../core/library/cel/life-state';
import { lookOf } from '../../core/library/cel/looks';
import { place } from '../../core/library/cel/mesh';
import { celItemPartsOf, celPartsOf } from '../../core/library/cel/models';
import { spriteKey } from '../../core/library/cel/sprite-key';
import type { Angle } from '../../core/library/footprint';
import { FURNITURE_MODELS } from '../../core/library/furniture-models';
import { CELL_H, CELL_W, FACE_CAMERA, spriteFrameOf, type Camera } from '../../core/library/furniture-render3d';
import { itemModel, type ItemPlacement } from '../../core/library/item-models';
import type { StandingKind, StyleId } from '../../core/library/library-types';
import type { PxRect } from '../../core/library/room-grid';
import { paletteOf, type Palette } from '../../core/library/styles';
import { CarriedItem3D, CarriedItemSpriteArt, Model3DArt, ModelDecals, itemsKey, sameCarried, sameModel3D, type CarriedItem3DProps, type ItemContent, type Model3DArtProps, type ModelPart } from '../model3d-art';
import { spriteJob, type PaintedSprite } from './sprite-paint';

// Hôte des sprites cellulo des meubles (G6) : chaque meuble debout et chaque objet porté est une image peinte (moteur cel), posée en
// <image> à la place exacte de son dessin à boîtes (Model3DArt), qui reste affiché tant que l'image n'est pas prête. Les décors des faces
// (couvertures de cartes, tranches, écrans) restent en SVG par-dessus : une image de site tiers ne passe jamais dans un canvas.

// px d'image par px de pièce, et suréchantillonnage du rendu (spec G6 §5).
export const SPRITE_PX = 3;
export const SPRITE_SS = 2;

type Job = ReturnType<typeof spriteJob>;
type Pending = { make: () => Job; job: Job | null; done: Set<() => void> };

// Registre des images peintes : file des demandes menée par tranches de temps (à chaque image d'animation, la plus ancienne tâche
// avance d'au plus `budgetMs`, puis les suivantes tant qu'il en reste ; une tâche longue se termine sur plusieurs images), cache LRU
// plafonné en nombre (`max`) et en octets (`maxBytes` : somme des longueurs des data URL). Une image relue repasse en fin de file.
export class SpriteRegistry {
  private readonly sprites = new Map<string, PaintedSprite>();
  private total = 0;
  private readonly queue = new Map<string, Pending>();
  private pending = false;
  private readonly max: number;
  private readonly maxBytes: number;
  private readonly budgetMs: number;
  private readonly schedule: (cb: () => void) => void;
  private readonly now: () => number;
  constructor(
    readonly label: string,
    opts: { max?: number; maxBytes?: number; budgetMs?: number; schedule?: (cb: () => void) => void; now?: () => number } = {},
  ) {
    this.max = opts.max ?? 220;
    this.maxBytes = opts.maxBytes ?? 48e6;
    this.budgetMs = opts.budgetMs ?? 6;
    this.schedule = opts.schedule ?? ((cb) => void requestAnimationFrame(() => cb()));
    this.now = opts.now ?? (() => performance.now());
  }
  size(): number {
    return this.sprites.size;
  }
  bytes(): number {
    return this.total;
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
  want(k: string, job: () => Job, done: () => void): () => void {
    if (this.sprites.has(k)) {
      done();
      return () => undefined;
    }
    const q = this.queue.get(k);
    if (q) q.done.add(done);
    else this.queue.set(k, { make: job, job: null, done: new Set([done]) });
    this.pump();
    return () => {
      const p = this.queue.get(k);
      if (!p) return;
      p.done.delete(done);
      if (p.done.size === 0) this.queue.delete(k);
    };
  }
  private store(k: string, s: PaintedSprite): void {
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
  private pump(): void {
    if (this.pending || this.queue.size === 0) return;
    this.pending = true;
    this.schedule(() => {
      this.pending = false;
      const t0 = this.now();
      for (const [k, q] of this.queue) {
        const left = this.budgetMs - (this.now() - t0);
        if (left <= 0) break;
        q.job ??= q.make();
        // Une seule tranche par tâche et par image : inachevée, elle reprend à l'image suivante.
        if (!q.job.step(left)) break;
        this.queue.delete(k);
        this.store(k, q.job.finish());
        for (const d of q.done) d();
      }
      this.pump();
    });
  }
}

export const SpriteContext = createContext<SpriteRegistry | null>(null);

// Image de la clé, peinte à la demande. Tant que la nouvelle n'est pas prête (premier affichage, clé changée, image évincée), la
// dernière image montrée par ce composant reste : jamais de trou ni de clignotement. null avant la toute première image (repli).
export function useSprite(key: string | null, job: () => Job): PaintedSprite | null {
  const reg = useContext(SpriteContext);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const jobRef = useRef(job);
  jobRef.current = job;
  const last = useRef<PaintedSprite | null>(null);
  const cur = reg && key ? reg.get(key) : null;
  if (cur) last.current = cur;
  const missing = reg !== null && key !== null && cur === null;
  useEffect(() => {
    if (!missing) return undefined;
    return reg!.want(key!, () => jobRef.current(), bump);
  }, [reg, key, missing]);
  return cur ?? last.current;
}

const camOf = (cam: Camera): 'room' | 'plunge' => (cam === FACE_CAMERA ? 'room' : 'plunge');
const r1 = (v: number): number => Math.round(v * 10) / 10;

export type FurnitureSpriteProps = Model3DArtProps & { style: StyleId; side: LightSide; life?: LifeState; lifeKey?: string; res?: number };

// Image peinte d'un meuble (null tant qu'aucune n'a été montrée). Un meuble garni d'objets (`items`, vues de zoom) n'est pas peint :
// ses objets ne sont pas dans l'image.
export function useFurnitureSprite(p: FurnitureSpriteProps): PaintedSprite | null {
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
  });
}

function FurnitureSpriteImpl(p: FurnitureSpriteProps): ReactElement {
  const sprite = useFurnitureSprite(p);
  const { style: _style, side: _side, life: _life, lifeKey: _lifeKey, res: _res, ...art } = p;
  if (!sprite) {
    return (
      <g data-furniture-sprite="">
        <g data-sprite-fallback=""><Model3DArt {...art} /></g>
      </g>
    );
  }
  const { kind, angle, rect } = p;
  const frame = spriteFrameOf(FURNITURE_MODELS[kind], angle, p.camera ?? FACE_CAMERA);
  const [sx, sy] = [rect.w / (frame.cols * CELL_W), rect.h / (frame.rows * CELL_H)];
  const { box } = sprite;
  return (
    <g data-furniture-sprite="">
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
  });
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

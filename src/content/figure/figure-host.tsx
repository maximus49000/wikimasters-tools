// src/content/figure/figure-host.tsx
import { createContext, useContext } from 'react';
import { INK_WIDTH, anchorsOf, bakeFigure, keyString, type Anchor, type FigureKey } from '../../core/library/figure/bake';
import { shapeFromSignature } from '../../core/library/figure/dress';
import { PHASES, poseOf, riding, type ArmPose } from '../../core/library/figure/skeleton';
import { citizenKey, type CitizenDesc, type Emotion } from '../../core/citizens/catalogue';
import type { CitizenSprite } from '../citizens/citizen-renderer';
import { CITIZENS_3D, RENDER_BUDGET_MS, WAIT3D_FALLBACK_MS } from './citizen-config';

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
// Ordre fixe des cases : la clé ne dépend pas de l'ordre d'insertion de l'objet. Habitants 3D : clé de l'habitant (`c3d`) et
// palier de lumière (`c3d-light`) en fin de liste, n'entrent dans la clé que s'ils sont là (palettes 2D : clés d'avant).
const PALETTE_2D = ['f-ink', 'f-ground', ...FIGURE_SLOTS.flatMap((s) => [`f-${s}`, `fs-${s}`])];
export const PALETTE_ORDER = [...PALETTE_2D, 'c3d', 'c3d-light'];
// Palettes retenues (une par tenue et par teinte du ciel, renouvelée à chaque rendu React) : les plus anciennes partent.
const MAX_PALETTES = 2048;

export const paletteKey = (p: Palette): string => (p.c3d === undefined ? PALETTE_2D : PALETTE_ORDER).map((k) => p[k] ?? '').join(',');
export const spriteKey = (pk: string, key: FigureKey): string => `${pk}#${keyString(key)}`;
// Sprite 3D : clé du sprite pantin de même palette et pose + état du visage (un clignement = une autre image).
export const spriteKey3D = (pk: string, key: FigureKey, face: string): string => `${spriteKey(pk, key)}@3d${face}`;
export type SpriteAnchors = Record<Anchor | 'hands', readonly [number, number]>;

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
// 1 500 poses en vue à midi. Les sprites 3D (data URL de même cadre et même résolution) comptent dans le même plafond.
export const FIGURE_SPRITES_MAX = 2400;
// Plafond de la vue rapprochée (vue « dehors » de RoomView : sprites 3D à 6 px par unité, quatre fois plus lourds).
export const CLOSE_UP_SPRITES_MAX = 600;

// ── Habitants 3D ──────────────────────────────────────────────────────────────────────────────────────────────────
// Ce dont le registre a besoin du rendu 3D (CitizenRenderer ; un faux en test).
export type Citizen3D = {
  ready(desc: CitizenDesc): boolean;
  prepare(desc: CitizenDesc): void;
  render(desc: CitizenDesc, key: FigureKey, light: number, face: string): CitizenSprite | null;
  dispose(): void;
  /** État du visage (face.ts : émotion du geste, clignement à l'instant t) ; absent : neutre, yeux ouverts. Fourni par le
   * module chargé à la demande : face.ts embarque three.js, figure-host ne l'importe pas. */
  faceOf?(arms: ArmPose, mood: Emotion, t: number, seed: number): string;
  /** Cause du dernier rendu nul : seul 'engine' compte pour la mise hors service ; 'citizen' met cet habitant seul en pantin.
   * Absent : 'engine'. */
  lastFailure?(): 'engine' | 'citizen' | 'notReady' | null;
};
// Fabrique du rendu 3D : null = pas de 3D possible ici (su tout de suite : figures en pantin, palettes 2D d'avant), sinon le
// rendu ou sa promesse (module chargé à la demande).
export type Citizen3DFactory = (pxPerUnit: number) => Citizen3D | Promise<Citizen3D | null> | null;
// Rendu partagé par résolution : un seul contexte WebGL pour tous les registres (RoomView en recrée un par monde ; les
// navigateurs plafonnent le nombre de contextes). Module chargé par import() : avec CITIZENS_3D à false, c'est du code mort
// que le bundle retire. Sans canvas (node, jsdom) : pas de 3D (et aucun appel réseau vers le relais).
const shared3D = new Map<number, Promise<Citizen3D | null>>();
const defaultCitizen3D: Citizen3DFactory = (px) => {
  if (!CITIZENS_3D) return null;
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return null;
  let p = shared3D.get(px);
  if (!p) {
    p = Promise.all([import('../citizens/citizen-renderer'), import('../../core/citizens/face')])
      .then(([m, f]): Citizen3D | null => {
        const r = new m.CitizenRenderer({ pxPerUnit: px });
        return {
          ready: (d) => r.ready(d),
          prepare: (d) => r.prepare(d),
          render: (d, k, light, face) => r.render(d, k, light, face),
          dispose: () => r.dispose(),
          faceOf: (arms, mood, t, seed) => f.faceState(f.emotionFor(arms, mood), f.blinkLevel(f.blinkAt(t, seed))),
          lastFailure: () => r.lastFailure(),
        };
      })
      .catch(() => null);
    shared3D.set(px, p);
  }
  return p;
};
// Habitant 3D connu du registre (clé `c3d` d'une palette) : clé, description, graine (clignements), attente 3D (waitFor3D).
type Citizen = { ck: string; desc: CitizenDesc; seed: number; waitSince?: number; waitOver?: boolean; failedAt?: number };
const MAX_CITIZENS = 2048;
// Toutes les 15 images, les figures qui attendent une image 3D sont réexaminées même sans rendu (modèle arrivé entre-temps).
const WATCH_EVERY = 15;
// Demandes 3D non renouvelées : jetées après 3 images (image seule : visage) ou 15 images (cycle : les figures fixes le
// redemandent toutes les WATCH_EVERY images, et à chaque image où un rendu 3D a été fait).
const STALE_ONE = 3;
const STALE_CYCLE = 15;
// Demande non renouvelée depuis plus de 2 images : elle garde sa place, mais plus sa priorité « figure en 3D » ou « cycle
// commencé » (passe au rang des nouveaux cycles).
const PRIO_FRESH = 2;
// Habitant dont le rendu échoue (habillage, pose) : lui seul en pantin, nouvel essai après ce délai (comme CitizenRenderer).
const CITIZEN_RETRY_MS = 30_000;
// Une figure qui montre de la 3D ne passe au pantin d'une pose dont le cycle 3D manque qu'après ce nombre d'images.
export const HOLD_3D_FRAMES = 2;
// 3D hors service (aucun rendu réussi à l'expiration d'une attente, ou DEAD_STREAK rendus nuls de suite avec une base prête) :
// pantins partout, sans attente, nouvel essai après REPROBE_MS.
const DEAD_STREAK = 5;
const REPROBE_MS = 30_000;
// Phases distinctes d'une pose (repère : la pose du pantin, comme le rendu 3D la calcule) : une allure immobile (debout,
// assis, pied à terre…) donne la même pose à toutes les phases, une seule image suffit. `rep[p]` : première phase de même
// pose que p ; `phases` : les phases distinctes. Calculé une fois par pose sans phase.
type PhaseSet = { rep: Uint8Array; phases: number[] };
const phaseSets = new Map<string, PhaseSet>();
export function phaseSet(key: FigureKey): PhaseSet {
  const umbrella = shapeFromSignature(key.sig).umbrella;
  const id = `${umbrella ? 1 : 0}|${key.yaw}|${key.gait}|${key.head}|${key.arms}|${key.lean}`;
  let ps = phaseSets.get(id);
  if (!ps) {
    const seen = new Map<string, number>();
    const rep = new Uint8Array(PHASES);
    const phases: number[] = [];
    const round = (_k: string, v: unknown): unknown => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 || 0 : v);
    for (let p = 0; p < PHASES; p++) {
      const pose = poseOf((key.yaw * Math.PI) / 8, (p * 2 * Math.PI) / PHASES, key.gait, { headYaw: (key.head * Math.PI) / 8, umbrella, arms: key.arms, lean: key.lean });
      const sig = JSON.stringify(pose, round);
      const first = seen.get(sig);
      if (first === undefined) {
        seen.set(sig, p);
        phases.push(p);
        rep[p] = p;
      } else rep[p] = first;
    }
    ps = { rep, phases };
    if (phaseSets.size >= 4096) phaseSets.clear();
    phaseSets.set(id, ps);
  }
  return ps;
}
// Pose ramenée à sa phase représentative (clés des sprites 3D : une seule image pour les phases identiques).
const repKey = (key: FigureKey): FigureKey => {
  const r = phaseSet(key).rep[key.phase % PHASES]!;
  return r === key.phase ? key : { ...key, phase: r };
};
// Demande de rendu 3D : un cycle (les PHASES phases d'une pose, visage neutre) ou une image seule (état du visage).
// Priorité : 0 = figure qui montre déjà de la 3D (nouvelle orientation, nouveau geste) ou visage, 1 = cycle commencé,
// 2 = nouveau cycle, 3 = cycle déjà complet à un autre palier de lumière (servi en attendant).
type Job = { kind: 'cycle' | 'one'; pk: string; key: FigureKey; face: string; cid: string; at: number; prio: number };
// Sprite 3D rendu : son cycle, sa phase, sa clé « habitant + pose + visage » (index sans la lumière).
type Meta3D = { cid: string | null; phase: number; lk: string };

export type FigureRegistryOptions = {
  max?: number;
  perFrame?: number;
  /** Résolution des sprites 3D (px par unité du pantin). */
  pxPerUnit?: number;
  /** Visages animés (clignement, émotion) : une image par état du visage. Sans : neutre, yeux ouverts. */
  faces?: boolean;
  /** Rendu 3D (tests) ; par défaut : CitizenRenderer partagé, chargé à la demande. */
  citizens?: Citizen3DFactory;
  /** Horloge en ms (budget des rendus 3D, attente 3D, clignements) ; par défaut performance.now. */
  now?: () => number;
};

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
  // Habitants 3D : accroches des sprites 3D (présence = sprite 3D), habitants par clé, file des rendus 3D, figures qui
  // attendent mieux que leur image (pantin de repli ou rien) avec leur mise à jour (true : plus rien à attendre).
  private readonly anchors3d = new Map<string, SpriteAnchors>();
  private readonly citizens = new Map<string, Citizen>();
  private readonly queue3d = new Map<string, Job>();
  private readonly watchers = new Map<Element, () => boolean>();
  // Phases rendues par cycle (tous paliers de lumière confondus) : un cycle complet = la figure peut passer en 3D.
  private readonly cycles = new Map<string, Uint16Array>();
  // Dernier sprite 3D rendu par « habitant + pose + visage » (sans la lumière) : servi pendant qu'un autre palier se rend.
  private readonly latest = new Map<string, string>();
  private readonly meta3d = new Map<string, Meta3D>();
  // Habitants dont l'attente 3D court (waitFor3D) : seuls examinés à chaque image.
  private readonly waitingSet = new Set<Citizen>();
  // Figures retirées du suivi pendant que la 3D est hors service : remises en suivi au nouvel essai.
  private readonly parked = new Map<Element, () => boolean>();
  private kick = false;
  private everRendered = false;
  private nullStreak = 0;
  private deadAt: number | null = null;
  private readonly px: number;
  private readonly faces: boolean;
  private readonly now: () => number;
  private readonly make3d: Citizen3DFactory;
  // undefined : pas encore demandé ; null : pas de 3D (repli pantin partout).
  private c3d: Citizen3D | null | undefined;
  private c3dPending = false;
  // `label` : nom de l'affichage (repère au débogage).
  constructor(
    readonly label: string,
    opts: FigureRegistryOptions = {},
  ) {
    this.max = opts.max ?? 1500;
    this.perFrame = opts.perFrame ?? 8;
    this.px = opts.pxPerUnit ?? SPRITE_PX;
    this.faces = opts.faces ?? false;
    this.now = opts.now ?? (() => performance.now());
    this.make3d = opts.citizens ?? defaultCitizen3D;
  }
  // Rendu 3D demandé une fois (une promesse le pose à son arrivée) ; false si la 3D est exclue ici.
  private start3D(): boolean {
    if (!CITIZENS_3D || this.c3d === null) return false;
    if (this.c3d !== undefined || this.c3dPending) return true;
    let made: ReturnType<Citizen3DFactory>;
    try {
      made = this.make3d(this.px);
    } catch {
      made = null;
    }
    if (made === null) {
      this.c3d = null;
      return false;
    }
    if (made instanceof Promise) {
      this.c3dPending = true;
      made.then(
        (r) => {
          this.c3dPending = false;
          this.c3d = r;
        },
        () => {
          this.c3dPending = false;
          this.c3d = null;
        },
      );
    } else this.c3d = made;
    return true;
  }
  // Retient un habitant 3D et rend sa clé (pour figurePalette) ; null sans 3D (interrupteur coupé, pas de rendu possible ici) :
  // la figure garde sa palette 2D, exactement comme avant.
  citizen(desc: CitizenDesc, seed: number): string | null {
    if (!CITIZENS_3D || !this.start3D()) return null;
    const ck = citizenKey(desc);
    const c = this.citizens.get(ck);
    if (c) {
      this.citizens.delete(ck);
      this.citizens.set(ck, c);
    } else {
      this.citizens.set(ck, { ck, desc, seed });
      if (this.citizens.size > MAX_CITIZENS) this.citizens.delete(this.citizens.keys().next().value as string);
    }
    this.c3d?.prepare(desc);
    return ck;
  }
  // Accroches 3D d'un sprite (repère du sprite, comme anchorsOf) ; null pour un sprite pantin ou inconnu.
  anchors(sk: string): SpriteAnchors | null {
    return this.anchors3d.get(sk) ?? null;
  }
  // Habitant 3D d'une palette (clé `c3d`), sinon null (palette 2D).
  private citizenOf(pk: string): Citizen | null {
    const ck = this.palettes.get(pk)?.c3d;
    return ck === undefined ? null : (this.citizens.get(ck) ?? null);
  }
  // 3D hors service pour ce registre (voir DEAD_STREAK) ; levé après REPROBE_MS pour un nouvel essai.
  private dead(): boolean {
    if (this.deadAt === null) return false;
    if (this.now() - this.deadAt < REPROBE_MS) return true;
    this.deadAt = null;
    this.nullStreak = 0;
    for (const [node, refresh] of this.parked) this.watchers.set(node, refresh);
    this.parked.clear();
    this.kick = true;
    return false;
  }
  // Habitant utilisable en 3D : pas en échec de rendu depuis moins de CITIZEN_RETRY_MS.
  private usable(c: Citizen): boolean {
    if (c.failedAt === undefined) return true;
    if (this.now() - c.failedAt < CITIZEN_RETRY_MS) return false;
    c.failedAt = undefined;
    return true;
  }
  // Une palette porte-t-elle un habitant 3D (et le rendu 3D peut-il venir maintenant) ?
  is3D(pk: string): boolean {
    const c = this.citizenOf(pk);
    return this.c3d !== null && !this.dead() && c !== null && this.usable(c);
  }
  // Une palette porte-t-elle un habitant 3D, même si la 3D est hors service pour l'instant (figure à garder en suivi) ?
  wants3D(pk: string): boolean {
    const c = this.citizenOf(pk);
    return this.c3d !== null && c !== null && this.usable(c);
  }
  // Visages animés : les figures 3D restent suivies pour cligner.
  animatedFaces(): boolean {
    return this.faces;
  }
  // Numéro de l'image (un par flush).
  frameNo(): number {
    return this.frame;
  }
  // État du visage d'une pose : '' sans l'option `faces` (ou avant l'arrivée du module 3D) ; sinon émotion du geste (ou
  // humeur) et clignement de l'instant.
  private faceOf(c: Citizen, key: FigureKey): string {
    return this.faces && this.c3d?.faceOf ? this.c3d.faceOf(key.arms, c.desc.mood, this.now(), c.seed) : '';
  }
  // Attente 3D d'un habitant (waitFor3D) : vraie tant que WAIT3D_FALLBACK_MS ne sont pas écoulées depuis sa première demande
  // (et que la 3D n'est pas hors service) ; au-delà, le pantin est servi.
  private waiting(c: Citizen): boolean {
    if (c.waitOver || this.dead()) return false;
    const t = this.now();
    if (c.waitSince === undefined) {
      c.waitSince = t;
      this.waitingSet.add(c);
    }
    if (t - c.waitSince < WAIT3D_FALLBACK_MS) return true;
    c.waitOver = true;
    this.waitingSet.delete(c);
    return false;
  }
  // Clé du sprite voulu pour (palette, pose) : 3D pour une palette 3D, sinon celle du pantin.
  keyFor(pk: string, key: FigureKey): string {
    const c = this.citizenOf(pk);
    return c ? spriteKey3D(pk, repKey(key), this.faceOf(c, key)) : spriteKey(pk, key);
  }
  // Cycle d'une pose : l'habitant et la pose sans la phase (ni la lumière, ni le visage).
  private cycleId(c: Citizen, key: FigureKey): string {
    return `${c.ck}|${key.sig}|${key.yaw}|${key.gait}|${key.head}|${key.arms}|${key.lean}`;
  }
  // Cycle complet : toutes ses phases distinctes rendues (une seule pour une pose immobile).
  private complete(cid: string, key: FigureKey): boolean {
    const n = this.cycles.get(cid);
    return n !== undefined && phaseSet(key).phases.every((p) => n[p]! > 0);
  }
  // Sprite 3D servable : l'exact, sinon le dernier rendu du même habitant, même pose, même visage (autre palier de lumière),
  // sinon visage neutre.
  private find3D(pk: string, c: Citizen, key: FigureKey, face: string): { sk: string; url: string } | null {
    const exact = spriteKey3D(pk, key, face);
    const u = this.hit(exact);
    if (u !== null) return { sk: exact, url: u };
    const ks = keyString(key);
    for (const f of face === '' ? [''] : [face, '']) {
      const l = this.latest.get(`${c.ck}|${ks}|${f}`);
      const ul = l === undefined ? null : this.hit(l);
      if (ul !== null) return { sk: l!, url: ul };
    }
    return null;
  }
  private enqueue3D(id: string, job: Omit<Job, 'at'>): void {
    const q = this.queue3d.get(id);
    if (q) {
      // Priorité de la demande la plus récente (la plus forte des demandes d'une même image) : une ancienne priorité
      // « figure en 3D » ne reste pas collée à une pose qu'on ne montre plus.
      q.prio = q.at === this.frame ? Math.min(q.prio, job.prio) : job.prio;
      q.at = this.frame;
    } else this.queue3d.set(id, { ...job, at: this.frame });
  }
  // Image à montrer pour (palette, pose) et sa clé. Palette 3D : sprite 3D seulement quand le cycle de la pose est complet
  // (la lecture n'attend jamais un rendu), sinon cycle mis en file et pantin (repli) ; `wait` (waitFor3D) : rien tant que
  // l'attente court ; `from3D` : la figure montre déjà de la 3D (cycle prioritaire). Pantin : peint tout de suite si `now`
  // (première apparition), sinon mis en file. Palette 2D : exactement ensure / request d'avant.
  pick(pk: string, key2D: FigureKey, now: boolean, wait = false, from3D = false): { sk: string; url: string } | null {
    const c = this.citizenOf(pk);
    if (c && this.c3d !== null && !this.dead() && this.usable(c)) {
      const key = repKey(key2D);
      const face = this.faceOf(c, key);
      const cid = this.cycleId(c, key);
      if (this.complete(cid, key)) {
        const got = this.find3D(pk, c, key, face);
        if (got) {
          // Visage ou palier de lumière pas encore rendus : le plus proche est servi, l'exact est rendu ensuite.
          const exact = spriteKey3D(pk, key, face);
          if (got.sk !== exact) {
            if (face !== '') this.enqueue3D(exact, { kind: 'one', pk, key, face, cid, prio: 0 });
            if (!this.sprites.has(spriteKey3D(pk, key, ''))) this.enqueue3D(`${pk}|${cid}`, { kind: 'cycle', pk, key, face: '', cid, prio: 3 });
          }
          return got;
        }
      }
      this.enqueue3D(`${pk}|${cid}`, { kind: 'cycle', pk, key, face: '', cid, prio: from3D ? 0 : this.cycles.has(cid) ? 1 : 2 });
      if (wait && this.waiting(c)) return null;
    }
    const sk = spriteKey(pk, key2D);
    const url = now ? (this.hit(sk) ?? this.create(pk, key2D, sk)) : this.request2D(pk, key2D, sk);
    return url === null ? null : { sk, url };
  }
  // Figure qui attend mieux que son image (pantin de repli, ou rien en waitFor3D) : `refresh` est rappelée après les flush
  // utiles (rendu 3D fait, attente écoulée, 3D hors service, visages animés, ou toutes les WATCH_EVERY images) jusqu'à rendre
  // true ; `unwatch` au masquage.
  watch(node: Element, refresh: () => boolean): void {
    // 3D hors service : mise de côté (reprise au nouvel essai), même si React re-rend la figure entre-temps.
    if (this.dead()) this.parked.set(node, refresh);
    else this.watchers.set(node, refresh);
  }
  unwatch(node: Element): void {
    this.watchers.delete(node);
    this.parked.delete(node);
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
  // Sprite tout de suite (pantin peint hors budget au besoin ; palette 3D : son sprite 3D s'il existe) ; null si la palette est
  // inconnue (ou attente 3D en cours).
  ensure(pk: string, key: FigureKey, wait = false): string | null {
    return this.pick(pk, key, true, wait)?.url ?? null;
  }
  // Sprite s'il existe (palette 3D : le 3D, sinon le pantin de repli), sinon mis en file (peint par flush) et null.
  request(pk: string, key: FigureKey, wait = false): string | null {
    return this.pick(pk, key, false, wait)?.url ?? null;
  }
  private request2D(pk: string, key: FigureKey, sk: string): string | null {
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
    // Budget des rendus 3D compté depuis le début de l'image (pantins compris).
    const t0 = this.citizens.size > 0 ? this.now() : 0;
    // Demandes non renouvelées depuis plus de 2 images (un marcheur a déjà demandé la phase suivante) : jetées avant de peindre.
    for (const [sk, q] of this.queue) if (this.frame - q.at > 2) this.queue.delete(sk);
    this.frame++;
    let made = 0;
    for (const [sk, { pk, key }] of [...this.queue]) {
      if (made >= this.perFrame) break;
      if (this.create(pk, key, sk) !== null) made++;
    }
    if (this.citizens.size > 0) this.flush3D(t0);
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
      if (this.anchors3d.delete(sk)) this.forget3D(sk);
      skipped = 0;
    }
  }
  // Sprite 3D retiré : son cycle perd une phase, l'index sans lumière l'oublie.
  private forget3D(sk: string): void {
    const m = this.meta3d.get(sk);
    if (!m) return;
    this.meta3d.delete(sk);
    if (this.latest.get(m.lk) === sk) this.latest.delete(m.lk);
    const n = m.cid === null ? undefined : this.cycles.get(m.cid);
    if (n && n[m.phase]! > 0) {
      n[m.phase]!--;
      if (n.every((v) => v === 0)) this.cycles.delete(m.cid!);
    }
  }
  private store3D(sk: string, out: CitizenSprite, c: Citizen, job: Job, key: FigureKey): void {
    this.sprites.set(sk, out.url);
    this.anchors3d.set(sk, out.anchors);
    const lk = `${c.ck}|${keyString(key)}|${job.face}`;
    this.latest.set(lk, sk);
    const cycle = job.face === '' ? job.cid : null;
    if (cycle !== null) {
      let n = this.cycles.get(cycle);
      if (!n) this.cycles.set(cycle, (n = new Uint16Array(PHASES)));
      n[key.phase % PHASES]!++;
    }
    this.meta3d.set(sk, { cid: cycle, phase: key.phase % PHASES, lk });
  }
  // Rendus 3D au budget de temps (RENDER_BUDGET_MS depuis le début de l'image), par priorité (Job), puis mise à jour des
  // figures qui attendent mieux que leur image. Base pas encore chargée : la demande reste en file sans coût ; rendu impossible
  // (null) : la demande part, le pantin reste ; DEAD_STREAK échecs de suite : 3D hors service.
  private flush3D(t0: number): void {
    for (const [id, q] of this.queue3d) if (this.frame - q.at > (q.kind === 'cycle' ? STALE_CYCLE : STALE_ONE)) this.queue3d.delete(id);
    const R = this.c3d;
    let made = 0;
    let deadNow = false;
    if (R && !this.dead() && this.queue3d.size > 0) {
      const prio = (q: Job): number => (this.frame - q.at > PRIO_FRESH ? Math.max(q.prio, 2) : q.prio);
      const jobs = [...this.queue3d].sort((a, b) => prio(a[1]) - prio(b[1]));
      jobs: for (const [id, job] of jobs) {
        const c = this.citizenOf(job.pk);
        if (!c) {
          this.queue3d.delete(id);
          continue;
        }
        if (!R.ready(c.desc)) {
          R.prepare(c.desc);
          continue;
        }
        const light = Number(this.palettes.get(job.pk)?.['c3d-light']);
        // Cycle : ses phases distinctes, à partir de la phase demandée (la prochaine montrée).
        const ph = phaseSet(job.key).phases;
        const from = Math.max(0, ph.indexOf(job.key.phase));
        const keys = job.kind === 'one' ? [job.key] : ph.map((_, i) => ({ ...job.key, phase: ph[(from + i) % ph.length]! }));
        for (const k of keys) {
          const sk = spriteKey3D(job.pk, k, job.face);
          if (this.sprites.has(sk)) continue;
          if (this.now() - t0 >= RENDER_BUDGET_MS) break jobs;
          let out: CitizenSprite | null;
          let why: 'engine' | 'citizen' | 'notReady' | null;
          try {
            out = R.render(c.desc, k, Number.isFinite(light) ? light : 1, job.face);
            why = out ? null : (R.lastFailure?.() ?? 'engine');
          } catch {
            out = null;
            why = 'engine';
          }
          if (!out) {
            // Base pas encore là : la demande attend. Habitant en échec : lui seul en pantin, la 3D reste en service.
            if (why === 'notReady') continue jobs;
            this.queue3d.delete(id);
            if (why === 'citizen') {
              c.failedAt = this.now();
              continue jobs;
            }
            if (++this.nullStreak >= DEAD_STREAK) {
              this.deadAt = this.now();
              deadNow = true;
              break jobs;
            }
            continue jobs;
          }
          this.nullStreak = 0;
          this.everRendered = true;
          this.store3D(sk, out, c, job, k);
          made++;
        }
        this.queue3d.delete(id);
      }
    }
    // Attentes écoulées (seuls les habitants qui attendent sont examinés) : leurs figures passent au pantin. Aucun rendu réussi
    // à ce moment : la 3D est hors service (plus de passants invisibles 4 s).
    let expired = false;
    if (this.waitingSet.size > 0) {
      const t = this.now();
      for (const c of [...this.waitingSet]) {
        if (t - c.waitSince! < WAIT3D_FALLBACK_MS) continue;
        c.waitOver = true;
        this.waitingSet.delete(c);
        expired = true;
      }
      if (expired && !this.everRendered && this.deadAt === null) {
        this.deadAt = t;
        deadNow = true;
      }
    }
    if (this.watchers.size === 0) return;
    const kick = this.kick;
    this.kick = false;
    if (made === 0 && !expired && !deadNow && !kick && !this.faces && this.frame % WATCH_EVERY !== 0) return;
    for (const [node, refresh] of [...this.watchers]) {
      let done: boolean;
      try {
        done = refresh();
      } catch {
        done = true;
      }
      if (!done) continue;
      this.watchers.delete(node);
      // Retirée parce que la 3D est hors service : reprise au nouvel essai.
      if (this.deadAt !== null) this.parked.set(node, refresh);
    }
  }
}

// Accroches de la pose montrée par un sprite : celles du rendu 3D pour un sprite 3D, sinon celles du pantin.
export function figureAnchors(reg: FigureRegistry, sk: string | null | undefined, key: FigureKey): SpriteAnchors | Record<Anchor, readonly [number, number]> {
  return (sk ? reg.anchors(sk) : null) ?? anchorsOf(key);
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

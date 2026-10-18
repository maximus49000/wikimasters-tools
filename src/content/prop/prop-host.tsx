import { createContext, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { facing } from '../../core/library/paint/props/kit';
import { PROPS, type PropArgs, type PropPainter } from '../../core/library/paint/props/index';
import { tintedCtx, type ShopPaintCtx } from '../../core/library/paint/shop/ctx';
import type { Sky } from '../../core/library/sky';
import { tone } from '../city-sprites';
import { BLANK_SPRITE } from '../figure/figure-host';
import { PaintRegistry, paintSurface, quantDay } from '../paint-registry';

// Images peintes des accessoires de rue Ghibli (G5) : chaque accessoire est peint UNE fois par clé (peintre, arguments,
// orientation, lumière, pose) sur le canvas hors écran partagé, puis gardé en PNG (data URL : la CSP du site refuse blob:)
// et posé en <image> au cadre de son sprite classique. Lumière au 1/8 de jour, toujours teinte ; élément allumé : le
// peintre peint ses parties lumineuses dans glowing(). Orientation −x : l'hôte retourne le canvas (le peintre dessine vers +x).
export const PROP_PX = 4;
export type PropSpec = { id: string; args?: PropArgs; dir?: 1 | -1; day: number; lit?: boolean; frame?: number };
type Frame = readonly [number, number, number, number];

const framesOf = (p: PropPainter | undefined): number => Math.max(1, Math.floor(p?.frames ?? 1));
const poseOf = (s: PropSpec): number => {
  const n = framesOf(PROPS[s.id]);
  return ((Math.floor(s.frame ?? 0) % n) + n) % n;
};

// id|args triés (JSON : aucune collision)|dir|jour quantifié (+ L si allumé)|pose.
export function propKey(s: PropSpec): string {
  const args = s.args ? JSON.stringify(Object.entries(s.args).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : '';
  return `${s.id}|${args}|${s.dir ?? 1}|${quantDay(s.day)}${s.lit ? 'L' : ''}|${poseOf(s)}`;
}

// Cadre de l'image dans le repère du sprite : celui du peintre, retourné autour de x = 0 pour dir = −1.
function frameOf(p: PropPainter, s: PropSpec): Frame {
  const [x, y, w, h] = p.box(s.args ?? {});
  return (s.dir ?? 1) === -1 ? [-(x + w), y, w, h] : [x, y, w, h];
}

// Surface de peinture (le canvas partagé ; les tests passent un faux contexte qui enregistre les appels).
export type PropSurface = {
  canvas: { width: number; height: number; toDataURL(type: string): string };
  ctx: ShopPaintCtx & { setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void; clearRect(x: number, y: number, w: number, h: number): void };
};

export function paintProp(s: PropSpec, surf: PropSurface | null | undefined = paintSurface() as PropSurface | null | undefined): string {
  const painter = PROPS[s.id];
  if (!painter || !surf) return BLANK_SPRITE;
  const [bx, by, bw, bh] = frameOf(painter, s);
  const { canvas, ctx } = surf;
  canvas.width = Math.max(1, Math.ceil(bw * PROP_PX));
  canvas.height = Math.max(1, Math.ceil(bh * PROP_PX));
  ctx.setTransform(PROP_PX, 0, 0, PROP_PX, -bx * PROP_PX, -by * PROP_PX);
  ctx.clearRect(bx, by, bw, bh);
  const dir = s.dir ?? 1;
  const lit = s.lit ?? false;
  const day = quantDay(s.day);
  const sky = { daylight: day } as Sky;
  // Toujours la teinte du moment ; les parties lumineuses d'un élément allumé passent par glowing() (peintre).
  const t = tintedCtx(ctx, (c: string) => tone(c, sky));
  // Orientation −x : canvas retourné autour de x = 0 (le cadre l'est déjà), ombres du kit compensées par facing.
  facing(dir);
  ctx.save();
  ctx.scale(dir, 1);
  try {
    painter.paint(t, s.args ?? {}, { day, lit, dir, frame: poseOf(s) });
  } catch {
    // Un peintre qui échoue ne doit pas bloquer la file de cuisson : image vide.
    return BLANK_SPRITE;
  } finally {
    ctx.restore();
    facing(1);
  }
  return canvas.toDataURL('image/png');
}

// 600 images (accessoires × orientations × lumières × poses en vue), 2 peintures par image.
export class PropRegistry extends PaintRegistry {
  constructor(label: string, opts: { max?: number; perFrame?: number; schedule?: (cb: () => void) => void } = {}) {
    super(label, { max: 600, perFrame: 2, ...opts });
  }
}

export const PropContext = createContext<PropRegistry | null>(null);

type Shown = { url: string; box: Frame };

// Image et cadre de l'accessoire ; tant que la clé n'est pas cuite, la dernière image montrée par ce composant (pas de
// trou au changement de lumière, de pose ou d'arguments), ou null ; `spec` null, un autre peintre ou une autre
// orientation effacent la mémoire (jamais l'image d'un autre objet ni un cadre retourné).
export function useProp(spec: PropSpec | null): Shown | null {
  const reg = useContext(PropContext);
  const [, bump] = useState(0);
  const last = useRef<Shown | null>(null);
  const ident = useRef<string | null>(null);
  const painter = spec ? PROPS[spec.id] : undefined;
  const key = spec && painter ? propKey(spec) : null;
  const url = reg && key ? reg.get(key) : null;
  useEffect(() => {
    if (!reg || !key || !spec || reg.get(key) !== null) return;
    return reg.want(
      key,
      () => paintProp(spec),
      () => bump((n) => n + 1),
    );
    // `spec` est entièrement décrit par la clé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, key]);
  const id = spec ? `${spec.id}|${spec.dir ?? 1}` : null;
  if (key === null || id !== ident.current) last.current = null;
  ident.current = id;
  if (url !== null && spec && painter) last.current = { url, box: frameOf(painter, spec) };
  return last.current;
}

// <image> au cadre du peintre ; sinon (registre absent, peintre inconnu, première image pas encore cuite) `fallback`.
// Avec un registre, le repli est enveloppé dans <g data-prop-fallback> : le banc attend qu'il n'en reste aucun, et un repli
// qui reste affiché se voit ; sans registre (tests, hôtes sans PropContext), le repli est rendu nu. Dans l'app, PropContext
// est toujours fourni (RoomView) : ce qui protège le classique, ce sont les gardes `ghibli ?` des appelants, qui ne montent
// PropImage qu'en Ghibli.
export function PropImage({ spec, fallback = null }: { spec: PropSpec; fallback?: ReactNode }): ReactElement {
  const shown = useProp(spec);
  const reg = useContext(PropContext);
  if (!shown) return reg && fallback !== null ? <g data-prop-fallback="">{fallback}</g> : <>{fallback}</>;
  const [x, y, w, h] = shown.box;
  return <image href={shown.url} x={x} y={y} width={w} height={h} preserveAspectRatio="none" />;
}

// ---------- Accessoires à poses cycliques (G5 : cheval au pas, tissu des drapeaux, mailloche de la fanfare) ----------
// L'image est rendue à la pose 0 ; la boucle de la couche hôte (placeCycles, à chaque image) choisit la pose de l'instant
// t : floor(frac(t / période + phase) × frames), la demande au registre si elle n'est pas cuite, et la pose sur l'<image>
// dès qu'elle l'est : au plus `frames` images par accessoire et par lumière, quel que soit le nombre de copies. `phase` (en
// cycles) décale les copies entre elles. Un re-rendu (lumière, arguments) remet la pose 0 et change `data-cycle-spec` : la
// boucle repart de là. Pas d'<image> encore (première cuisson) : le repli reste affiché.
export function CycledProp({ spec, period, phase = 0, fallback = null }: { spec: Omit<PropSpec, 'frame'>; period: number; phase?: number; fallback?: ReactNode }): ReactElement {
  return (
    <g data-prop-cycle={period} data-cycle-phase={phase} data-cycle-spec={JSON.stringify(spec)}>
      <PropImage spec={{ ...spec, frame: 0 }} fallback={fallback} />
    </g>
  );
}
// `img` : l'<image> de l'accessoire, gardée d'une image à l'autre (recherchée tant qu'elle n'existe pas, ou si le rendu l'a
// remplacée) ; `json` : dernier `data-cycle-spec` lu (relu à chaque pose : le rendu le change avec la lumière).
export type CycledNode = { node: Element; period: number; phase: number; img: Element | null; json: string; spec: PropSpec | null; frame: number };
export function collectCycles(root: Element): CycledNode[] {
  const out: CycledNode[] = [];
  for (const node of root.querySelectorAll('[data-prop-cycle]')) {
    const period = Number(node.getAttribute('data-prop-cycle'));
    if (!(period > 0)) continue;
    out.push({ node, period, phase: Number(node.getAttribute('data-cycle-phase')) || 0, img: null, json: '', spec: null, frame: -1 });
  }
  return out;
}
const noop = (): void => undefined;
const parseSpec = (json: string): PropSpec | null => {
  try {
    const s = JSON.parse(json) as PropSpec;
    return s && typeof s.id === 'string' && PROPS[s.id] ? s : null;
  } catch {
    return null;
  }
};
export function placeCycles(list: readonly CycledNode[], t: number, reg: PropRegistry | null): void {
  if (!reg) return;
  for (const c of list) {
    if (!c.img?.isConnected) {
      c.img = c.node.querySelector(':scope > image');
      c.frame = -1;
    }
    if (!c.img) continue;
    const json = c.node.getAttribute('data-cycle-spec') ?? '';
    if (json !== c.json) {
      c.json = json;
      c.spec = parseSpec(json);
      c.frame = -1;
    }
    if (!c.spec) continue;
    const n = framesOf(PROPS[c.spec.id]);
    const u = t / c.period + c.phase;
    const frame = Math.floor((u - Math.floor(u)) * n) % n;
    if (frame === c.frame) continue;
    const spec: PropSpec = { ...c.spec, frame };
    const key = propKey(spec);
    const url = reg.get(key);
    if (url === null) {
      reg.want(key, () => paintProp(spec), noop);
      continue;
    }
    c.img.setAttribute('href', url);
    c.frame = frame;
  }
}

// Même image dans un groupe que l'hôte retourne pour `spec.dir` = −1 (`scale(dir·k, k)` des éléments dynamiques des véhicules
// peints, de l'échelle portée) : ce miroir est annulé autour de l'image, cuite dans le sens `dir` (jamais une image
// retournée) ; le repli classique garde le miroir de l'hôte.
export function PropInMirror({ spec, fallback = null }: { spec: PropSpec; fallback?: ReactNode }): ReactElement {
  if ((spec.dir ?? 1) === 1) return <PropImage spec={spec} fallback={fallback} />;
  return (
    <g transform="scale(-1 1)">
      <PropImage spec={spec} fallback={<g transform="scale(-1 1)">{fallback}</g>} />
    </g>
  );
}
// Image cyclique dans le repère retourné par l'hôte (même règle que PropInMirror).
export function CycledInMirror({ spec, period, phase = 0, fallback = null }: { spec: Omit<PropSpec, 'frame'>; period: number; phase?: number; fallback?: ReactNode }): ReactElement {
  if ((spec.dir ?? 1) === 1) return <CycledProp spec={spec} period={period} phase={phase} fallback={fallback} />;
  return (
    <g transform="scale(-1 1)">
      <CycledProp spec={spec} period={period} phase={phase} fallback={<g transform="scale(-1 1)">{fallback}</g>} />
    </g>
  );
}

import { createContext, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { facing } from '../../core/library/paint/props/kit';
import { PROPS, type PropArgs, type PropPainter } from '../../core/library/paint/props/index';
import { tintedCtx, type ShopPaintCtx } from '../../core/library/paint/shop/ctx';
import type { Sky } from '../../core/library/sky';
import { tone } from '../city-sprites';
import { BLANK_SPRITE } from '../figure/figure-host';
import { PaintRegistry, paintSurface } from '../paint-registry';
import { quantDay } from '../shop/shop-host';

// Images peintes des accessoires de rue Ghibli (G5) : chaque accessoire est peint UNE fois par clé (peintre, arguments,
// orientation, lumière, pose) sur le canvas hors écran partagé, puis gardé en PNG (data URL : la CSP du site refuse blob:)
// et posé en <image> au cadre de son sprite classique. Lumière au 1/8 de jour ; élément allumé : couleurs de jour.
export const PROP_PX = 4;
export type PropSpec = { id: string; args?: PropArgs; dir?: 1 | -1; day: number; lit?: boolean; frame?: number };
type Frame = readonly [number, number, number, number];

const framesOf = (p: PropPainter | undefined): number => Math.max(1, Math.floor(p?.frames ?? 1));
const poseOf = (s: PropSpec): number => {
  const n = framesOf(PROPS[s.id]);
  return ((Math.floor(s.frame ?? 0) % n) + n) % n;
};

// id|args triés|dir|L ou jour quantifié|pose.
export function propKey(s: PropSpec): string {
  const args = s.args ? Object.keys(s.args).sort().map((k) => `${k}=${String(s.args![k])}`).join(',') : '';
  return `${s.id}|${args}|${s.dir ?? 1}|${s.lit ? 'L' : quantDay(s.day)}|${poseOf(s)}`;
}

// Cadre de l'image dans le repère du sprite : celui du peintre, retourné autour de x = 0 pour dir = −1.
function frameOf(p: PropPainter, s: PropSpec): Frame {
  const [x, y, w, h] = p.box(s.args ?? {});
  return (s.dir ?? 1) === -1 ? [-(x + w), y, w, h] : [x, y, w, h];
}

export function paintProp(s: PropSpec): string {
  const painter = PROPS[s.id];
  const surf = paintSurface();
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
  // Élément allumé : couleurs de jour ; sinon la teinte de la lumière du moment.
  const t = tintedCtx(ctx as unknown as ShopPaintCtx, lit ? (c: string) => c : (c: string) => tone(c, sky));
  facing(dir);
  try {
    painter.paint(t, s.args ?? {}, { day, lit, dir, frame: poseOf(s) });
  } finally {
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
// trou au changement de lumière ou de pose), ou null ; `spec` null efface la mémoire.
export function useProp(spec: PropSpec | null): Shown | null {
  const reg = useContext(PropContext);
  const [, bump] = useState(0);
  const last = useRef<Shown | null>(null);
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
  if (key === null) last.current = null;
  if (url !== null && spec && painter) last.current = { url, box: frameOf(painter, spec) };
  return last.current;
}

// <image> au cadre du peintre ; sinon (registre absent, peintre inconnu, première image pas encore cuite) `fallback`.
export function PropImage({ spec, fallback = null }: { spec: PropSpec; fallback?: ReactNode }): ReactElement {
  const shown = useProp(spec);
  if (!shown) return <>{fallback}</>;
  const [x, y, w, h] = shown.box;
  return <image href={shown.url} x={x} y={y} width={w} height={h} preserveAspectRatio="none" />;
}

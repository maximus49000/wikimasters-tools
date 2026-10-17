// Dessin provisoire Opus : Fable n'est pas passé (gel jusqu'au 2026-10-17), reprise Fable prévue.
import { memo, useId, type ReactElement } from 'react';
import { hostNativePx } from '../core/library/carried-items';
import { drawSize, type Angle } from '../core/library/footprint';
import { FURNITURE_MODELS, STEAMPUNK_TRIM } from '../core/library/furniture-models';
import { CELL_H, CELL_W, FACE_CAMERA, cameraKey, openingOf, overhangOf, pieceBounds, projectOf, renderModel, type Camera, type Fill, type Model, type Shape } from '../core/library/furniture-render3d';
import { itemModel, itemPieces, type ItemDisplay, type ItemPlacement, type ItemShape } from '../core/library/item-models';
import type { BoxFormat, CaseStyle } from '../core/game/platform-boxes';
import type { StandingKind } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';
import { GameSpine, inkOn, lightEdge } from './game-spine';
import { HifiFace, HifiGrille, HifiTop } from './hifi/hifi-art';

const LIT_SHADE = '#FFE9A8';
// referrerPolicy n'est pas typé sur <image> SVG : passé par déploiement d'objet.
const NO_REFERRER = { referrerPolicy: 'no-referrer' } as object;

// Éclaircit (> 1) ou assombrit (< 1) une couleur #RRGGBB.
export function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// Coordonnées au dixième de pixel : attributs SVG courts (le rendu ne change pas à l'œil).
const r1 = (v: number): number => Math.round(v * 10) / 10;
const pts = (points: [number, number][]): string => points.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');

// Formes prêtes à dessiner (attributs déjà arrondis) ; `ink` : 'none' aplat sans trait, 'only' trait seul ; `color` : couleur propre (sinon la palette) ;
// `glow` : objet dont l'abat-jour s'allume ; `decal` : face décorée (image, titre, pages, écran) posée par la matrice `m` (unités : mm de la face).
type DecalDraw = { item: string; role: string; shape: string; m: string; w: number; h: number; dim: number };
// `body` : corps d'un objet dont la couleur se choisit au dessin (dos d'un livre propre à chaque carte).
type Common = { fill: Fill; shade: number; color?: string; glow?: string; stored?: true; body?: true };
type Drawn = Common & (
  | { tag: 'polygon'; points: string; ink?: 'none' | 'only'; decal?: DecalDraw }
  | { tag: 'polyline'; points: string }
  | { tag: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
);
type Halo = { cx: number; cy: number; rx: number; ry: number; item?: string };
// `opening` : ouverture projetée du meuble porteur (points) qui découpe les objets rangés ; null = ouverture invisible (profil, dos) : ils sont cachés ;
// absente = objet dessiné seul, sans découpe.
// `origin` (objet seul) : px du coin bas avant gauche de sa boîte, pour le poser par translation dans le repère d'un porteur.
type Geometry = { shapes: Drawn[]; cols: number; rows: number; halos: Halo[]; opening?: string | null; origin?: [number, number] };

const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
// Halo d'une lampe autour de son abat-jour (formes repérées par `pick`), quel que soit l'angle.
function haloOf(shapes: Shape[], pick: (s: Shape) => boolean): Omit<Halo, 'item'> | null {
  const xy = shapes.flatMap((s): [number, number][] => (!pick(s) ? [] : s.kind === 'ellipse' ? [[s.cx - s.rx, s.cy - s.ry], [s.cx + s.rx, s.cy + s.ry]] : s.points));
  if (xy.length === 0) return null;
  const [x0, x1] = [Math.min(...xy.map((p) => p[0])), Math.max(...xy.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...xy.map((p) => p[1])), Math.max(...xy.map((p) => p[1]))];
  return { cx: r1((x0 + x1) / 2), cy: r1((y0 + y1) / 2), rx: r1((x1 - x0) * 1.1), ry: r1(y1 - y0) };
}

function geometryFrom(model: Model, angle: Angle, lampHalo: boolean, cam: Camera = FACE_CAMERA): Geometry {
  const r = renderModel(model, angle, cam);
  const shapes = r.shapes.map((s): Drawn => {
    const common: Common = { fill: s.fill, shade: s.shade, ...(s.color && { color: s.color }), ...(s.tag?.startsWith('glow:') && { glow: s.tag.slice(5) }), ...(s.tag?.startsWith('stored:') && { stored: true as const }) };
    if (s.kind === 'line') return { ...common, tag: 'polyline', points: pts(s.points) };
    if (s.kind === 'ellipse') return { ...common, tag: 'ellipse', cx: r1(s.cx), cy: r1(s.cy), rx: r1(s.rx), ry: r1(s.ry) };
    const out: Drawn = { ...common, tag: 'polygon', points: pts(s.points), ink: s.ink };
    const d = s.decal;
    // Face décorée assez grande à l'écran (sinon l'aplat suffit : allège la pièce) : matrice qui pose un rectangle de w × h mm sur la face projetée.
    const area = d ? Math.abs((d.tr[0] - d.tl[0]) * (d.bl[1] - d.tl[1]) - (d.tr[1] - d.tl[1]) * (d.bl[0] - d.tl[0])) : 0;
    if (d && area >= 2) {
      const [item, rest] = d.key.includes('|') ? (d.key.split('|') as [string, string]) : ['', d.key];
      const [role, shape] = rest.split(':') as [string, string];
      const [W, H] = [d.w * 10, d.h * 10];
      const m = `matrix(${r4((d.tr[0] - d.tl[0]) / W)} ${r4((d.tr[1] - d.tl[1]) / W)} ${r4((d.bl[0] - d.tl[0]) / H)} ${r4((d.bl[1] - d.tl[1]) / H)} ${r1(d.tl[0])} ${r1(d.tl[1])})`;
      // Ombrage de la face repassé sur le décor : un côté plus sombre l'est aussi sous l'image.
      out.decal = { item, role, shape, m, w: W, h: H, dim: Math.round(Math.max(0, 1 - s.shade) * 100) / 100 };
    }
    return out;
  });
  const halos: Halo[] = [];
  if (lampHalo) {
    const h = haloOf(r.shapes, (s) => s.fill === 'shade' && !s.tag);
    if (h) halos.push(h);
  }
  for (const item of new Set(r.shapes.flatMap((s) => (s.tag?.startsWith('glow:') ? [s.tag.slice(5)] : [])))) {
    const h = haloOf(r.shapes, (s) => s.tag === `glow:${item}`);
    if (h) halos.push({ ...h, item });
  }
  return { shapes, cols: r.cols, rows: r.rows, halos };
}

// Géométrie par (meuble, angle, garnitures Steampunk, objets posés), calculée une fois : la pièce se redessine à chaque mouvement du doigt.
// Le cache est borné (les rangements changent au fil de l'aménagement) : au-delà, les entrées les moins récemment utilisées partent
// (une entrée relue repasse en fin de file).
const CACHE_MAX = 400;
const geometryCache = new Map<string, Geometry>();
function cached(key: string, make: () => Geometry): Geometry {
  const hit = geometryCache.get(key);
  if (hit) {
    geometryCache.delete(key);
    geometryCache.set(key, hit);
    return hit;
  }
  const g = make();
  if (geometryCache.size >= CACHE_MAX) geometryCache.delete(geometryCache.keys().next().value!);
  geometryCache.set(key, g);
  return g;
}
export const itemsKey = (items: ItemPlacement[] | undefined): string =>
  (items ?? []).map((i) => `${i.key},${i.shape},${i.display ?? ''},${i.x},${i.y},${i.z},${i.color ?? ''},${i.box ?? ''}`).join(';');
// `part` (meuble à socle) : 'base' = socle et tige seulement, 'overhang' = arc et dôme seulement (rangés à part dans la pièce) ; absent = tout.
export type ModelPart = 'base' | 'overhang';
function geometryOf(kind: StandingKind, angle: Angle, steampunk: boolean, items?: ItemPlacement[], part?: ModelPart, cam: Camera = FACE_CAMERA): Geometry {
  return cached(`${kind}:${angle}:${steampunk ? 1 : 0}:${itemsKey(items)}:${part ?? ''}${cameraKey(cam)}`, () => {
    const base = FURNITURE_MODELS[kind];
    const trim = steampunk ? (STEAMPUNK_TRIM[kind] ?? []) : [];
    const extra = (items ?? []).flatMap((i) => itemPieces(i, steampunk));
    const whole = trim.length + extra.length > 0 ? { ...base, pieces: [...base.pieces, ...trim, ...extra] } : base;
    const over = part ? overhangOf(whole) : null;
    const model = over ? { ...whole, pieces: whole.pieces.filter((_, i) => over.pieces.has(i) === (part === 'overhang')) } : whole;
    const g = geometryFrom(model, angle, base.glow !== undefined, cam);
    if (!g.shapes.some((s) => s.stored)) return g;
    const o = openingOf(base, angle, cam);
    return { ...g, opening: o ? pts(o) : null };
  });
}

// Contenu d'un objet posé : image et titre de sa carte, lampe allumée ou non.
// `face` / `top` : décor dessiné par l'appelant sur la façade / le dessus (clé : ce qui change son dessin, pour le mémo).
export type FaceDraw = { key: string; draw: (w: number, h: number) => ReactElement };
// Jeu : `backUrl` image du dos de sa boîte, sinon `back` dos fabriqué ; `band` bandeau de sa console (null : boîte sans bandeau ; absent : boîte inconnue, bandeau rouge) ;
// `printed` : la jaquette (scan TheGamesDB) porte déjà son bandeau, la couverture n'en ajoute pas (la tranche, si).
export type Band = { color: string; label: string };
// `spine` : tranche dessinée comme la vraie (boîte connue) ; absente : bandeau et titre d'origine.
export type SpineData = { style: CaseStyle; format: BoxFormat; title: string; logoUrl?: string; studio?: string; console?: string };
export type ItemContent = { url?: string; title?: string; lit?: boolean; face?: FaceDraw; top?: FaceDraw; backUrl?: string; back?: FaceDraw; band?: Band | null; printed?: boolean; spine?: SpineData };

const cut = (title: string, max: number) => (title.length > max ? `${title.slice(0, Math.max(1, max - 1))}…` : title);
const GAME_RED = '#E24B4A';
const PLACEHOLDER = '#A8C5E6';

// Bandeau d'un jeu : celui de sa console quand la boîte est connue (aucun pour une console sans bandeau), sinon le rouge d'origine.
const gameBand = (content?: ItemContent): Band | null => (content?.band === undefined ? { color: GAME_RED, label: '' } : content.band);
// Décor d'une face, dans son repère propre (w × h mm, haut à gauche) : couverture, tranche, pages ou écran.
function DecalArt({ d, content, color }: { d: DecalDraw; content?: ItemContent; color: string }): ReactElement | null {
  const { w, h, role, shape } = d;
  const url = content?.url;
  const title = content?.title ?? '';
  if (role === 'pages') {
    // Tranche des pages : bloc crème en retrait des plats, quelques feuillets marqués.
    const m = Math.min(w, h) * 0.12;
    const lines = [0.35, 0.65];
    return (
      <>
        <rect x={r1(m)} y={r1(m)} width={r1(w - 2 * m)} height={r1(h - 2 * m)} fill="#F3EBD8" />
        {lines.map((f) => (w > h
          ? <line key={f} x1={r1(m)} x2={r1(w - m)} y1={r1(m + (h - 2 * m) * f)} y2={r1(m + (h - 2 * m) * f)} stroke="#D8CDB4" strokeWidth={r1(Math.max(0.6, h * 0.04))} />
          : <line key={f} y1={r1(m)} y2={r1(h - m)} x1={r1(m + (w - 2 * m) * f)} x2={r1(m + (w - 2 * m) * f)} stroke="#D8CDB4" strokeWidth={r1(Math.max(0.6, w * 0.04))} />))}
      </>
    );
  }
  if (role === 'spine' && shape === 'game' && content?.spine) return <GameSpine w={w} h={h} {...content.spine} />;
  if (role === 'spine') {
    // Titre le long de la tranche (du haut vers le bas), taille selon l'épaisseur ; bandeau de la console en haut d'un jeu, jaquette claire d'un CD.
    const gb = shape === 'game' ? gameBand(content) : null;
    const band = gb ? h * 0.1 : 0;
    const fs = w * 0.6;
    return (
      <>
        {shape === 'cd' && <rect x={r1(w * 0.12)} y={0} width={r1(w * 0.76)} height={h} fill="#F4F4F6" />}
        {gb && <rect width={w} height={r1(band)} fill={gb.color} {...lightEdge(gb.color)} />}
        {title && (
          <text transform={`translate(${r1(w / 2 - fs * 0.35)} ${r1(band + h * 0.05)}) rotate(90)`} fontSize={r1(fs)} fontFamily="system-ui, sans-serif" fontWeight={600} fill={shape === 'cd' ? '#333333' : inkOn(color)}>
            {cut(title, Math.floor(((h - band) * 0.9) / (fs * 0.6)))}
          </text>
        )}
      </>
    );
  }
  // Chaîne hi-fi : dessus (platine, puits CD, disque posé), façade (afficheur, molette) et grilles des enceintes ; sans contenu, poste au repos.
  if (role === 'top') return content?.top ? content.top.draw(w, h) : <HifiTop w={w} h={h} disc={null} spinning={false} />;
  if (role === 'grille') return <HifiGrille w={w} h={h} />;
  if (role === 'face') {
    if (content?.face) return content.face.draw(w, h);
    return shape === 'hifi' ? <HifiFace w={w} h={h} title={null} playing={false} /> : <rect width={w} height={h} fill="#1D1F22" />;
  }
  if (role === 'back') {
    // Dos d'une boîte de jeu : son image (TheGamesDB), sinon le dos fabriqué de la boîte connue ; boîte inconnue : aplat du boîtier et titre.
    const fs = Math.min(w * 0.12, h * 0.08);
    return (
      <g data-decal-back="">
        {content?.backUrl
          ? <image href={content.backUrl} x={r1(w * 0.03)} y={r1(h * 0.02)} width={r1(w * 0.94)} height={r1(h * 0.96)} {...NO_REFERRER} preserveAspectRatio="xMidYMid slice" />
          : content?.back ? content.back.draw(w, h) : (
            <>
              <rect width={w} height={h} fill={color} />
              {title && <text x={r1(w / 2)} y={r1(h * 0.2)} fontSize={r1(fs)} fontFamily="system-ui, sans-serif" fontWeight={600} textAnchor="middle" fill={inkOn(color)}>{cut(title, 14)}</text>}
            </>
          )}
      </g>
    );
  }
  if (role === 'screen') {
    return url ? <image href={url} width={w} height={h} {...NO_REFERRER} preserveAspectRatio="xMidYMid slice" /> : <rect width={w} height={h} fill={PLACEHOLDER} />;
  }
  // Couverture : image de la carte (rognée au cadre), sinon couverture de remplacement titrée. Boîtier cristal : marge du boîtier, charnière et reflet ;
  // DVD/jeu : bord du boîtier ; jeu : bandeau de sa console en haut (sauf jaquette scannée qui porte le sien) ; livre : marge du plat.
  // Marges de l'image : à gauche (charnière, dos), à droite, en haut et en bas (bord du boîtier ou du plat).
  const inset = shape === 'cd' ? { l: w * 0.09, r: w * 0.036, t: h * 0.04 } : shape === 'book' ? { l: w * 0.04, r: w * 0.046, t: h * 0.03 } : { l: w * 0.03, r: w * 0.028, t: h * 0.02 };
  const gb = shape === 'game' && !(url && content?.printed) ? gameBand(content) : null;
  const band = gb ? h * 0.09 : 0;
  const [ix, iy, iw, ih] = [inset.l, inset.t + band, w - inset.l - inset.r, h - 2 * inset.t - band];
  const fs = Math.min(iw * 0.16, ih * 0.14);
  const bandFs = band * 0.55;
  return (
    <>
      {gb && <rect width={w} height={r1(band + inset.t)} fill={gb.color} {...lightEdge(gb.color)} />}
      {gb?.label && <text x={r1(w / 2)} y={r1(inset.t + band * 0.72)} fontSize={r1(bandFs)} fontFamily="system-ui, sans-serif" fontWeight={700} textAnchor="middle" fill={inkOn(gb.color)}>{cut(gb.label, Math.floor(w / (bandFs * 0.62)))}</text>}
      {url && shape === 'game'
        // Jeu : jaquette entière sur le plastique du boîtier, comme sur la boîte ouverte.
        ? (
          <>
            <rect data-cover-ground="" x={r1(ix)} y={r1(iy)} width={r1(iw)} height={r1(ih)} fill={color} />
            <image href={url} x={r1(ix)} y={r1(iy)} width={r1(iw)} height={r1(ih)} {...NO_REFERRER} preserveAspectRatio="xMidYMid meet" />
          </>
        )
        : url
        ? <image href={url} x={r1(ix)} y={r1(iy)} width={r1(iw)} height={r1(ih)} {...NO_REFERRER} preserveAspectRatio="xMidYMid slice" />
        : (
          <>
            <rect x={r1(ix)} y={r1(iy)} width={r1(iw)} height={r1(ih)} fill={shape === 'book' ? shadeHex(color, 1.35) : PLACEHOLDER} />
            {title && <text x={r1(ix + iw / 2)} y={r1(iy + ih / 2)} fontSize={r1(fs)} fontFamily="system-ui, sans-serif" fontWeight={600} textAnchor="middle" fill="#2B2B2B">{cut(title, 12)}</text>}
          </>
        )}
      {shape === 'cd' && (
        <>
          <rect width={r1(w * 0.06)} height={h} fill="#FFFFFF" opacity={0.45} />
          <polygon points={`${r1(w * 0.45)},0 ${r1(w * 0.7)},0 ${r1(w * 0.35)},${h} ${r1(w * 0.1)},${h}`} fill="#FFFFFF" opacity={0.18} />
        </>
      )}
    </>
  );
}

type DrawProps = { g: Geometry; palette: Palette; lit: boolean; content?: Record<string, ItemContent>; lampShade?: boolean; bodyColor?: string };

// Formes d'une géométrie, décors des faces compris (dans l'ordre du peintre : un décor passe juste après sa face).
function Shapes({ g, palette, lit, content, lampShade = false, bodyColor }: DrawProps): ReactElement {
  const clipId = `wm-ouverture-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const isLit = (s: Drawn) => (s.glow !== undefined ? content?.[s.glow]?.lit ?? true : lampShade && s.fill === 'shade' && lit);
  const base = (s: Drawn) => (isLit(s) ? LIT_SHADE : (s.body && bodyColor) || (s.color ?? palette[s.fill]));
  const color = (s: Drawn) => shadeHex(base(s), s.shade);
  const drawOne = (s: Drawn, i: number): ReactElement => {
    if (s.tag === 'polyline') return <polyline key={i} points={s.points} fill="none" stroke={color(s)} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
    if (s.tag === 'ellipse') return <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={color(s)} stroke={palette.edge} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />;
    const poly = <polygon key={i} points={s.points} fill={s.ink === 'only' ? 'none' : color(s)} stroke={s.ink === 'none' ? 'none' : palette.edge} strokeWidth={1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
    if (!s.decal) return poly;
    const d = s.decal;
    return (
      <g key={i}>
        {poly}
        <g transform={d.m}>
          <DecalArt d={d} content={content?.[d.item]} color={base(s)} />
        </g>
        {d.dim > 0 && <polygon points={s.points} fill="#000000" opacity={d.dim} pointerEvents="none" />}
      </g>
    );
  };
  return (
    <>
      {g.halos.filter((h) => (h.item !== undefined ? content?.[h.item]?.lit ?? true : lit)).map((h, i) => (
        <ellipse key={`h${i}`} data-lamp-halo="" pointerEvents="none" cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} fill="#FFD38A" opacity={0.35} />
      ))}
      {g.opening && <clipPath id={clipId}><polygon points={g.opening} /></clipPath>}
      {runsOf(g.shapes).map((run) => {
        const els = run.shapes.map(([s, i]) => drawOne(s, i));
        // Objets rangés : découpés à l'ouverture du meuble (une suite d'objets = une seule découpe) ; ouverture invisible : cachés.
        if (!run.stored || g.opening === undefined) return els;
        return g.opening ? <g key={`c${run.shapes[0]![1]}`} clipPath={`url(#${clipId})`}>{els}</g> : null;
      })}
    </>
  );
}

// Formes consécutives de même nature (objet rangé ou non), avec leur rang : l'ordre du peintre est gardé.
function runsOf(shapes: Drawn[]): { stored: boolean; shapes: [Drawn, number][] }[] {
  const out: { stored: boolean; shapes: [Drawn, number][] }[] = [];
  shapes.forEach((s, i) => {
    const last = out[out.length - 1];
    if (last && last.stored === !!s.stored) last.shapes.push([s, i]);
    else out.push({ stored: !!s.stored, shapes: [[s, i]] });
  });
  return out;
}

type Props = { kind: StandingKind; angle: Angle; rect: PxRect; palette: Palette; lit?: boolean; steampunk?: boolean; items?: ItemPlacement[]; content?: Record<string, ItemContent>; part?: ModelPart; camera?: Camera };

// Meuble dessiné depuis son modèle 3D (vraies proportions), mis à l'échelle de son rectangle, avec les objets qui le garnissent (`items`, dans son repère).
function Model3DArtImpl({ kind, angle, rect, palette, lit = true, steampunk = false, items, content, part, camera }: Props): ReactElement {
  const g = geometryOf(kind, angle, steampunk, items, part, camera);
  const sx = rect.w / (g.cols * CELL_W);
  const sy = rect.h / (g.rows * CELL_H);
  return (
    <g data-model3d="" transform={`translate(${r1(rect.x)} ${r1(rect.y)}) scale(${sx} ${sy})`}>
      <Shapes g={g} palette={palette} lit={lit} content={content} lampShade={FURNITURE_MODELS[kind].glow !== undefined} />
    </g>
  );
}

// Redessiné seulement si le meuble change (le rectangle et la liste d'objets arrivent neufs à chaque rendu : comparés par valeur).
export const Model3DArt = memo(Model3DArtImpl, (a, b) => a.kind === b.kind && a.angle === b.angle && a.palette === b.palette && a.lit === b.lit
  && a.steampunk === b.steampunk && a.rect.x === b.rect.x && a.rect.y === b.rect.y && a.rect.w === b.rect.w && a.rect.h === b.rect.h
  && a.content === b.content && itemsKey(a.items) === itemsKey(b.items) && a.part === b.part && a.camera === b.camera);

// Géométrie d'un objet seul, dans son propre repère, par (forme, présentation, angle, Steampunk, couleur) : la même pour tous les objets
// de même forme, où qu'ils soient posés (la projection est affine : poser l'objet revient à translater son dessin).
// La couleur propre du corps (dos d'un livre) n'entre pas dans la clé : le corps est marqué `body` et coloré au dessin (bodyColor).
const BODY = '#B0D1E5';
function itemGeometry(shape: ItemShape, display: ItemDisplay, angle: Angle, steampunk: boolean, box?: BoxFormat, cam: Camera = FACE_CAMERA): Geometry {
  return cached(`item:${shape}:${display}:${angle}:${steampunk ? 1 : 0}:${box ?? ''}${cameraKey(cam)}`, () => {
    const m = itemModel(shape, steampunk, box);
    const pieces = itemPieces({ key: 'item', shape, display, x: 0, y: 0, z: 0, color: BODY, ...(box && { box }) }, steampunk);
    // Objet rangé : sa boîte est celle de ses pièces posées (sur la tranche, largeur et profondeur échangées ; de face, le présentoir
    // l'allonge vers le fond et le boîtier penché).
    const stored = shape !== 'monitor' && shape !== 'small-plant' && shape !== 'small-lamp';
    const ext = (k: 1 | 3 | 5) => Math.max(...pieces.map((q) => pieceBounds(q)[k]));
    const model: Model = { ...m, ...(stored && { w: ext(1), h: ext(3), d: ext(5) }), pieces };
    const g = geometryFrom(model, angle, false, cam);
    // Corps repéré par la couleur témoin, rendu à sa couleur de boîtier par défaut (remplacée au dessin s'il en a une).
    const own = m.pieces.find((q) => q.tag === 'body')?.color;
    const shapes = g.shapes.map((d): Drawn => (d.color === BODY ? { ...d, body: true, ...(own ? { color: own } : {}) } : d));
    return { ...g, shapes, origin: projectOf(model, angle, [0, 0, 0], cam) };
  });
}

// Taille dessinée (cases) d'un objet seul de face : cadre de sa vignette.
export function itemCells(shape: ItemShape, steampunk = false): { w: number; h: number } {
  const g = itemGeometry(shape, 'cover', 0, steampunk);
  return { w: g.cols, h: g.rows };
}

type ItemProps = { shape: ItemShape; display?: ItemDisplay; angle: Angle; rect: PxRect; palette: Palette; content?: ItemContent; color?: string; steampunk?: boolean; box?: BoxFormat; camera?: Camera };

// Objet seul (vignette), dessiné depuis son modèle 3D dans son rectangle ; mêmes décors que sur un meuble.
export function Item3DArt({ shape, display = 'cover', angle, rect, palette, content, color, steampunk = false, box, camera }: ItemProps): ReactElement {
  const g = itemGeometry(shape, display, angle, steampunk, box, camera);
  const sx = rect.w / (g.cols * CELL_W);
  const sy = rect.h / (g.rows * CELL_H);
  return (
    <g data-item3d={shape} transform={`translate(${r1(rect.x)} ${r1(rect.y)}) scale(${sx} ${sy})`}>
      <Shapes g={g} palette={palette} lit content={content ? { item: content } : undefined} bodyColor={color} />
    </g>
  );
}

type CarriedProps = { host: 'desk' | 'shelf'; angle: Angle; rect: PxRect; placement: ItemPlacement; palette: Palette; content?: ItemContent; steampunk?: boolean; camera?: Camera };

// Objet porté (carte rangée, écran, petit objet) dessiné à sa place dans le repère de son porteur tourné (`rect` : rectangle du porteur) :
// même angle, même échelle, même ombrage que le meuble ; sa géométrie est celle de l'objet seul, translatée.
function CarriedItem3DImpl({ host, angle, rect, placement: pl, palette, content, steampunk = false, camera }: CarriedProps): ReactElement {
  const g = itemGeometry(pl.shape, pl.display ?? 'cover', angle, steampunk, pl.box, camera);
  const { w, h } = drawSize(host, angle, camera);
  const [hx, hy] = hostNativePx(host, angle, [pl.x, pl.y, pl.z], camera);
  const [ox, oy] = g.origin ?? [0, 0];
  return (
    <g data-item3d={pl.shape} {...(pl.shape === 'monitor' && steampunk && { 'data-steampunk-art': 'analytical-engine' })}
      transform={`translate(${r1(rect.x)} ${r1(rect.y)}) scale(${r4(rect.w / (w * CELL_W))} ${r4(rect.h / (h * CELL_H))}) translate(${r1(hx - ox)} ${r1(hy - oy)})`}>
      <Shapes g={g} palette={palette} lit content={content ? { item: content } : undefined} bodyColor={pl.color} />
    </g>
  );
}

const sameBand = (a: Band | null | undefined, b: Band | null | undefined): boolean => (a && b ? a.color === b.color && a.label === b.label : a === b);
const sameSpine = (a: SpineData | undefined, b: SpineData | undefined): boolean => (a && b
  ? a.format === b.format && a.style.plastic === b.style.plastic && sameBand(a.style.band, b.style.band) && a.title === b.title
    && a.logoUrl === b.logoUrl && a.studio === b.studio && a.console === b.console
  : a === b);

// Redessiné seulement si l'objet, sa place, son porteur ou son contenu changent (comparés par valeur : un animal qui bouge ne refait rien).
export const CarriedItem3D = memo(CarriedItem3DImpl, (a, b) => a.host === b.host && a.angle === b.angle && a.palette === b.palette && a.steampunk === b.steampunk && a.camera === b.camera
  && a.rect.x === b.rect.x && a.rect.y === b.rect.y && a.rect.w === b.rect.w && a.rect.h === b.rect.h
  && itemsKey([a.placement]) === itemsKey([b.placement])
  && a.content?.url === b.content?.url && a.content?.title === b.content?.title && a.content?.lit === b.content?.lit
  && a.content?.backUrl === b.content?.backUrl && a.content?.back?.key === b.content?.back?.key && sameBand(a.content?.band, b.content?.band) && a.content?.printed === b.content?.printed && sameSpine(a.content?.spine, b.content?.spine) && a.content?.face?.key === b.content?.face?.key && a.content?.top?.key === b.content?.top?.key);

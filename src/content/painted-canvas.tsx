import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { gradeFor, gradeValues, type Grade } from '../core/library/paint/grade';
import { gradePixels } from '../core/library/paint/rue-sprites';

// Toile des images peintes (tranches de la ville, neige posée) : les grandes images peintes sont dessinées sur UNE toile 2D
// placée dans le <svg> par <foreignObject> (comme les arbres de la rue, street-trees.tsx, et la pluie, rain-canvas.tsx), avec
// l'étalonnage de l'heure APPLIQUÉ AUX PIXELS (matrice `gradeFor`, `gradePixels`) au lieu d'un filtre SVG `feColorMatrix`.
// Pourquoi (S26, 2026-10-24, enregistrement image par image pendant un zoom de la vue rue, viewBox changé à chaque image) :
// Chrome Android (1) lâche un instant le filtre SVG du groupe des tranches : la ville apparaît non assombrie (flash clair) ;
// (2) n'a pas le temps de redessiner les grandes <image> : la ville disparaît (8 images noires sur ~130 par zoom). Une toile
// déjà dessinée n'est qu'une texture composée : 0 image noire sur 130 au prototype, et plus de filtre à perdre.
// La toile n'est redessinée que quand une image ou l'étalonnage arrondi change, jamais pendant un geste : on prépare d'abord
// HORS écran toutes les images manquantes (décodage, copie étalonnée), puis on efface et redessine la toile d'un coup (jamais
// une toile à moitié vide). Une image remplacée reste dessinée jusqu'au décodage de la nouvelle ; un changement d'arrondi
// (crépuscule) garde l'ancienne teinte jusqu'à la nouvelle. Échec de décodage : 3 essais, puis l'ancienne image de la même
// place reste (s'il y en a une).
// Résolution : celle des tranches (`min(2, devicePixelRatio)` px par unité, donc nette en vue zoomée ×4 comme avant),
// plafonnée à 6 Mpx (au-delà, réduite). Images en data URL (CSP du site : pas de blob:), décodées par `new Image()` + decode().
// Sans canvas (jsdom) : la toile est rendue, rien n'est dessiné ; les images sont comptées comme posées (`data-images`).
// Limite connue (comme la pluie et les arbres) : une copie `<use>` du calque (fenêtre soulevée de la pièce) ne recopie pas une
// toile.
export type CanvasImage = { x: number; y: number; w: number; h: number; url: string };

const q20 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 20) / 20;
// Étalonnage arrondi au vingtième (même pas que les arbres de la rue, cuits ainsi : même teinte pour les deux) ; `grade` null
// en plein jour sans voile (identité : aucune copie étalonnée).
export function gradeKey(daylight: number, twilight: number, gloom: boolean): { key: string; grade: Grade | null } {
  const qd = q20(daylight);
  const qt = q20(twilight);
  const key = `${qd}|${qt}|${gloom ? 1 : 0}`;
  return { key, grade: qd >= 1 && qt <= 0 && !gloom ? null : gradeFor(qd, qt, gloom) };
}

// Source dessinable (image décodée, toile étalonnée, ou objet factice des tests) ; `null` = indisponible.
type Source = CanvasImageSource;
// Pilote : décodage, étalonnage et contexte de la toile (remplacé par les tests ; sans canvas, un pilote qui ne dessine rien).
export type PaintedCanvasDriver = {
  decode(url: string): Promise<Source | null>;
  grade(src: Source, grade: Grade): Promise<Source | null> | Source | null;
  context(cv: HTMLCanvasElement): CanvasRenderingContext2D | null;
};

export const PAINTED_DECODE_TRIES = 3;
const MAX_UNIT_SCALE = 2;
const MAX_PIXELS = 6_000_000;
// Images décodées gardées (deux générations des tranches de la ville et de la neige d'une grande pièce : 2 × 2 × 8).
const DECODED_MAX = 48;
// Copies étalonnées par image : l'affichée et la suivante.
const GRADED_PER_URL = 2;

const noCanvas = (): boolean => typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'));

function idleSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 1000 });
    else window.setTimeout(resolve, 16);
  });
}

const realDriver: PaintedCanvasDriver = {
  async decode(url) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img.naturalWidth > 0 ? img : null;
  },
  // Copie étalonnée en temps mort (une image par créneau) : pixels non prémultipliés, comme feColorMatrix en sRGB.
  async grade(src, grade) {
    await idleSlot();
    const img = src as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    gradePixels(data.data, grade);
    ctx.putImageData(data, 0, 0);
    return c;
  },
  context(cv) {
    try {
      return cv.getContext('2d');
    } catch {
      return null;
    }
  },
};
// Sans canvas (jsdom) : rien à décoder ni à dessiner.
const PLACEHOLDER = {} as Source;
const nullDriver: PaintedCanvasDriver = { decode: async () => PLACEHOLDER, grade: (s) => s, context: () => null };

let override: PaintedCanvasDriver | null = null;
const driver = (): PaintedCanvasDriver => override ?? (noCanvas() ? nullDriver : realDriver);

// Cache de module : image décodée par url (LRU), copies étalonnées par (url, étalonnage), urls abandonnées après 3 essais.
const decoded = new Map<string, Source>();
const decoding = new Map<string, Promise<Source | null>>();
const graded = new Map<string, Map<string, Source>>();
const grading = new Map<string, Promise<Source | null>>();
const broken = new Set<string>();
// Copies étalonnées encore en cache, et nombre de toiles visibles qui les montrent : une copie (une toile hors écran de la taille
// d'une tranche) sortie du cache et montrée nulle part rend son tampon tout de suite (WebView : la mémoire des toiles n'est
// rendue qu'au ramasse-miettes, bien trop tard sur Android). Une copie rendue n'est plus jamais dessinée (`released`).
const cachedGraded = new Set<Source>();
const inUse = new Map<Source, number>();
const released = new WeakSet<object>();
function releaseIfIdle(src: Source): void {
  if (cachedGraded.has(src) || inUse.has(src)) return;
  if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) {
    src.width = 0;
    src.height = 0;
    released.add(src);
  }
}
function evictGraded(src: Source): void {
  cachedGraded.delete(src);
  releaseIfIdle(src);
}
function use(list: Iterable<Source>, by: 1 | -1): void {
  for (const src of list) {
    const n = (inUse.get(src) ?? 0) + by;
    if (n > 0) inUse.set(src, n);
    else {
      inUse.delete(src);
      releaseIfIdle(src);
    }
  }
}

export function setPaintedCanvasDriverForTests(d: PaintedCanvasDriver | null): void {
  override = d;
}
export function resetPaintedCanvasForTests(): void {
  decoded.clear();
  decoding.clear();
  graded.clear();
  grading.clear();
  broken.clear();
  cachedGraded.clear();
  inUse.clear();
}

function keepDecoded(url: string, src: Source): void {
  decoded.delete(url);
  decoded.set(url, src);
  while (decoded.size > DECODED_MAX) {
    const old = decoded.keys().next().value as string;
    decoded.delete(old);
    graded.get(old)?.forEach(evictGraded);
    graded.delete(old);
  }
}

function decodeUrl(d: PaintedCanvasDriver, url: string): Promise<Source | null> {
  const hit = decoded.get(url);
  if (hit) {
    keepDecoded(url, hit);
    return Promise.resolve(hit);
  }
  if (broken.has(url)) return Promise.resolve(null);
  let p = decoding.get(url);
  if (!p) {
    p = (async () => {
      for (let i = 0; i < PAINTED_DECODE_TRIES; i++) {
        const src = await d.decode(url).catch(() => null);
        if (src) {
          keepDecoded(url, src);
          return src;
        }
      }
      broken.add(url);
      if (!noCanvas()) console.warn('[toile peinte] image indécodable après plusieurs essais');
      return null;
    })().finally(() => decoding.delete(url));
    decoding.set(url, p);
  }
  return p;
}

// Image prête à dessiner à l'étalonnage `key` (`grade` null : l'image décodée telle quelle). Étalonnage raté (contexte absent,
// lecture des pixels refusée) : l'image non étalonnée, pas mise en cache (le prochain changement de liste ou d'arrondi
// réessaie) ; la place est dessinée plutôt que laissée vide.
async function sourceFor(d: PaintedCanvasDriver, url: string, grade: Grade | null, key: string): Promise<Source | null> {
  const src = await decodeUrl(d, url);
  if (!src || !grade) return src;
  const per = graded.get(url);
  const hit = per?.get(key);
  if (hit) return hit;
  const gk = `${key}\n${url}`;
  let p = grading.get(gk);
  if (!p) {
    p = new Promise<Source | null>((resolve) => resolve(d.grade(src, grade)))
      .catch(() => null)
      .then((g) => {
        if (g && decoded.has(url)) {
          const m = graded.get(url) ?? new Map<string, Source>();
          const prev = m.get(key);
          m.delete(key);
          m.set(key, g);
          cachedGraded.add(g);
          if (prev && prev !== g) evictGraded(prev);
          while (m.size > GRADED_PER_URL) {
            const old = m.keys().next().value as string;
            const src = m.get(old)!;
            m.delete(old);
            evictGraded(src);
          }
          graded.set(url, m);
        }
        return g ?? src;
      })
      .finally(() => grading.delete(gk));
    grading.set(gk, p);
  }
  return p;
}

const boxId = (i: { x: number; y: number; w: number; h: number }): string => `${i.x},${i.y},${i.w},${i.h}`;

// Échelle du tampon (px par unité) : celle des tranches, plafonnée à MAX_PIXELS.
function unitScale(box: { w: number; h: number }): number {
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  let k = Math.min(MAX_UNIT_SCALE, dpr);
  if (box.w * box.h * k * k > MAX_PIXELS) k = Math.sqrt(MAX_PIXELS / (box.w * box.h));
  return k;
}

type Drawn = { count: number; grade: string; boxes: ReadonlySet<string> };

export function PaintedCanvas({ box, images, grade, onReady, tag }: { box: { x: number; y: number; w: number; h: number }; images: readonly CanvasImage[]; grade: Grade | null; onReady?: (ready: boolean) => void; tag: string }): ReactElement {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const gradeSig = grade ? gradeValues(grade) : 'identite';
  const sig = `${boxId(box)}#${gradeSig}#${images.map((i) => `${boxId(i)},${i.url}`).join('|')}`;
  // Dernier dessin : sources posées par place (repli d'une image indécodable), nombre d'images et étalonnage (diagnostic).
  const shown = useRef(new Map<string, Source>());
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  // Dernière demande, lue par le dessin asynchrone (la liste et l'étalonnage du rendu qui l'a lancé).
  const want = useRef({ box, images, grade, gradeSig });
  want.current = { box, images, grade, gradeSig };
  useEffect(() => {
    const d = driver();
    const { box: b, images: list, grade: g, gradeSig: key } = want.current;
    let cancelled = false;
    void (async () => {
      // Préparation hors écran : toutes les images de la liste (décodées, étalonnées) avant de toucher à la toile. Une copie
      // rendue entre-temps (sortie du cache par une autre toile) est refaite.
      let ready = await Promise.all(list.map((im) => sourceFor(d, im.url, g, key)));
      for (let tries = 0; tries < 2 && ready.some((src) => src && released.has(src as object)); tries++) ready = await Promise.all(list.map((im) => sourceFor(d, im.url, g, key)));
      if (cancelled) return;
      const placed: { im: CanvasImage; src: Source }[] = [];
      const boxes = new Set<string>();
      list.forEach((im, i) => {
        const id = boxId(im);
        const src = ready[i] ?? shown.current.get(id) ?? null;
        // Image abandonnée sans ancienne image à sa place : la place compte comme réglée (sinon la ville resterait masquée).
        if (src || broken.has(im.url)) boxes.add(id);
        if (src && !released.has(src as object)) placed.push({ im, src });
      });
      const cv = canvas.current;
      if (!cv) return;
      // Sans canvas (jsdom, pilote nul) : rien à dessiner, les images comptent comme posées. Vraie toile sans contexte 2D :
      // rien n'est noté comme dessiné (la ville ne serait jamais montrée sur une toile vide) ; le prochain changement réessaie.
      const ctx = d.context(cv);
      if (!ctx && d !== nullDriver) return;
      if (ctx) {
        const k = unitScale(b);
        const w = Math.max(1, Math.round(b.w * k));
        const h = Math.max(1, Math.round(b.h * k));
        // Taille du tampon changée (autre pièce) et dessin dans la même tâche : aucune image vide affichée entre les deux.
        if (cv.width !== w) cv.width = w;
        if (cv.height !== h) cv.height = h;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, w, h);
        for (const { im, src } of placed) {
          // Bords arrondis au pixel du tampon : deux tranches voisines se touchent sans couture.
          const x0 = Math.round((im.x - b.x) * k);
          const y0 = Math.round((im.y - b.y) * k);
          const x1 = Math.round((im.x + im.w - b.x) * k);
          const y1 = Math.round((im.y + im.h - b.y) * k);
          ctx.drawImage(src, x0, y0, x1 - x0, y1 - y0);
        }
      }
      const before = [...shown.current.values()];
      shown.current = new Map(placed.map((p) => [boxId(p.im), p.src]));
      use(shown.current.values(), 1);
      use(before, -1);
      setDrawn({ count: placed.length, grade: key, boxes });
    })();
    return () => {
      cancelled = true;
    };
  }, [sig]);
  // Démontage : tampon de la toile rendu tout de suite (WebView : mémoire, comme la pluie), copies montrées libérées.
  // (La toile est lue au montage : React vide la référence avant le nettoyage.)
  useEffect(() => {
    const cv = canvas.current;
    return () => {
      if (cv) {
        cv.width = 0;
        cv.height = 0;
      }
      use(shown.current.values(), -1);
      shown.current = new Map();
    };
  }, []);
  // Prête : chaque place de la liste a une image dessinée (la précédente compte tant que la nouvelle se prépare : une tranche
  // repeinte ou un nouvel arrondi ne masque jamais la ville).
  const ready = useMemo(() => drawn !== null && images.every((im) => drawn.boxes.has(boxId(im))), [drawn, images]);
  useEffect(() => {
    onReady?.(ready);
  }, [ready, onReady]);
  return (
    <foreignObject
      data-painted-canvas={tag}
      data-images={drawn ? drawn.count : 0}
      data-grade={drawn ? drawn.grade : ''}
      x={box.x}
      y={box.y}
      width={box.w}
      height={box.h}
      style={{ pointerEvents: 'none' }}
    >
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
    </foreignObject>
  );
}

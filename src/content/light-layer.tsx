import { useEffect, useRef, type ReactElement } from 'react';
import { buildLightMap, type Glass, type LightInput, type LightMap } from '../core/library/light';
import type { Box, LampSource } from '../core/library/light/occluders';
import type { Sky } from '../core/library/sky';
import type { Weather } from '../core/library/weather/weather-types';
import { celestialPlace } from './scene-panorama';

export type LightLayerProps = {
  windows: readonly Glass[];
  width: number;
  height: number;
  wallH: number;
  sky: Sky;
  clock: { read(nowMs: number): Weather };
  // Occulteurs et lampes allumées ; `signature` change dès que l'un d'eux bouge ou s'allume (repeinture immédiate).
  boxes?: readonly Box[];
  lamps?: readonly LampSource[];
  signature?: string;
  // Boîtes des animaux, relues à chaque repeinture sans rendu React.
  getPetBoxes?: () => readonly Box[];
  toUrl?: (map: LightMap) => string | null;
};

const TICK_MS = 250;
const FAST_MS = 83;
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Signature des animaux, quantifiée à 2 px : un mouvement plus petit ne déclenche aucune repeinture.
function petKey(boxes: readonly Box[]): string {
  return boxes.map((b) => [b.owner, b.x0, b.x1, b.d0, b.d1, b.z0, b.z1].map((v, i) => (i === 0 ? v : Math.round((v as number) / 2))).join(',')).join(';');
}

// Canvas hors écran, réutilisé : la carte (basse résolution) devient une image PNG en data URL. Null sans canvas (et sous jsdom).
let scratch: HTMLCanvasElement | null = null;
function canvasUrl(map: LightMap): string | null {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return null;
  scratch ??= document.createElement('canvas');
  if (scratch.width !== map.w) scratch.width = map.w;
  if (scratch.height !== map.h) scratch.height = map.h;
  const ctx = scratch.getContext('2d');
  if (!ctx) return null;
  const data = ctx.createImageData(map.w, map.h);
  data.data.set(map.rgba);
  ctx.putImageData(data, 0, 0);
  return scratch.toDataURL('image/png');
}

// Calque de lumière : ombre translucide + rayons chauds, repeint 4 fois par seconde (≈12 si un animal bouge, moins sur un appareil lent) sans re-rendu React (href posé à la main).
export function LightLayer({ windows, width, height, wallH, sky, clock, boxes, lamps, signature = '', toUrl = canvasUrl, getPetBoxes }: LightLayerProps): ReactElement {
  const imageRef = useRef<SVGImageElement | null>(null);
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const draw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const svg = image.ownerSVGElement;
    let lastKey = '';
    let lastPetKey = '';
    let lastSlow = 0;
    // Durée de la dernière repeinture qui a vraiment construit une carte : garde adaptative de la cadence rapide.
    let lastPaintMs = 0;
    const paint = (): void => {
      const s = skyRef.current;
      const w = clock.read(Date.now());
      const hidden = Number(svg?.style.getPropertyValue('--wmt-sun-hidden')) || 0;
      const r = (v: number, q: number): number => Math.round(v / q);
      const pets = getPetBoxes?.() ?? [];
      const pk = petKey(pets);
      const key = [r(s.sunFrac ?? -1, 0.005), r(s.daylight, 0.01), r(s.twilight, 0.01), r(w.cloud, 0.01), r(w.precip, 0.01), r(hidden, 0.01), signature, pk].join('|');
      if (key === lastKey && image.hasAttribute('href')) return;
      lastKey = key;
      lastPetKey = pk;
      const t0 = performance.now();
      // Sans fenêtre : pas de ciel, donc une pièce sans ombre ambiante et une nuit neutre pour que les lampes se voient.
      const noSky = windows.length === 0;
      const input: LightInput = noSky ? {
        width, height, wallH, windows, sunX: null, sunFrac: null, daylight: 0, twilight: 0, cloud: 0, precip: 0, hidden: 0, boxes, lamps, noSky, pets,
      } : {
        width, height, wallH, windows,
        sunX: s.sunFrac === null ? null : celestialPlace(s.sunFrac, width, wallH).x,
        sunFrac: s.sunFrac, daylight: s.daylight, twilight: s.twilight, cloud: w.cloud, precip: w.precip, hidden, boxes, lamps, pets,
      };
      const url = toUrl(buildLightMap(input));
      if (url !== null && image.getAttribute('href') !== url) image.setAttribute('href', url);
      lastPaintMs = performance.now() - t0;
    };
    draw.current = paint;
    const petsMoved = (): boolean => (getPetBoxes ? petKey(getPetBoxes()) !== lastPetKey : false);
    paint();
    lastSlow = Date.now();
    if (reducedMotion()) {
      if (!getPetBoxes) return () => { draw.current = null; };
      // Mouvement réduit : pas de cadence rapide, un simple contrôle à la seconde.
      const t = window.setInterval(() => {
        if (document.visibilityState !== 'hidden' && petsMoved()) paint();
      }, 1000);
      return () => { window.clearInterval(t); draw.current = null; };
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      // Rapide (≈12 Hz) seulement quand un animal a bougé, et au plus 1 repeinture pour 4 de temps de calcul
      // (un appareil lent retombe vers 4 Hz au lieu de saturer le fil principal) ; sinon le rythme habituel (4 Hz) du ciel.
      const gap = petsMoved() ? Math.max(FAST_MS, 4 * lastPaintMs) : TICK_MS;
      if (now - lastSlow < gap) return;
      lastSlow = now;
      paint();
    }, getPetBoxes ? FAST_MS : TICK_MS);
    return () => {
      window.clearInterval(timer);
      draw.current = null;
    };
  }, [windows, width, height, wallH, clock, toUrl, signature, boxes, lamps, getPetBoxes]);

  // Mouvement réduit : pas d'intervalle rapide (au plus un contrôle par seconde des animaux), mais le ciel (chaque minute) relance un calcul.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reducedMotion()) draw.current?.();
  }, [sky]);

  return <image data-light="" ref={imageRef} x={0} y={0} width={width} height={height} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />;
}

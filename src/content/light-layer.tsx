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
  toUrl?: (map: LightMap) => string | null;
};

const TICK_MS = 250;
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// Calque de lumière : ombre translucide + rayons chauds, repeint 4 fois par seconde sans re-rendu React (href posé à la main).
export function LightLayer({ windows, width, height, wallH, sky, clock, boxes, lamps, signature = '', toUrl = canvasUrl }: LightLayerProps): ReactElement {
  const imageRef = useRef<SVGImageElement | null>(null);
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const draw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const svg = image.ownerSVGElement;
    let lastKey = '';
    const paint = (): void => {
      const s = skyRef.current;
      const w = clock.read(Date.now());
      const hidden = Number(svg?.style.getPropertyValue('--wmt-sun-hidden')) || 0;
      const r = (v: number, q: number): number => Math.round(v / q);
      const key = [r(s.sunFrac ?? -1, 0.005), r(s.daylight, 0.01), r(s.twilight, 0.01), r(w.cloud, 0.01), r(w.precip, 0.01), r(hidden, 0.01), signature].join('|');
      if (key === lastKey && image.hasAttribute('href')) return;
      lastKey = key;
      const input: LightInput = {
        width, height, wallH, windows,
        sunX: s.sunFrac === null ? null : celestialPlace(s.sunFrac, width, wallH).x,
        sunFrac: s.sunFrac, daylight: s.daylight, twilight: s.twilight, cloud: w.cloud, precip: w.precip, hidden, boxes, lamps,
      };
      const url = toUrl(buildLightMap(input));
      if (url !== null && image.getAttribute('href') !== url) image.setAttribute('href', url);
    };
    draw.current = paint;
    paint();
    if (reducedMotion()) return () => { draw.current = null; };
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') paint();
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
      draw.current = null;
    };
  }, [windows, width, height, wallH, clock, toUrl, signature, boxes, lamps]);

  // Mouvement réduit : pas d'intervalle, mais le ciel (chaque minute) relance un calcul.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reducedMotion()) draw.current?.();
  }, [sky]);

  return <image data-light="" ref={imageRef} x={0} y={0} width={width} height={height} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />;
}

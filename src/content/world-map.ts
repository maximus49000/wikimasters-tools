import * as L from 'leaflet';
import type { CardPreview } from '../core/collection/card-preview';
import { buildCardPreview } from './card-preview-dom';

export type MapPoint = {
  slug: string;
  preview: CardPreview;
  lat: number;
  lon: number;
  manual: boolean;
};

export type WorldMapHandlers = {
  onOpen: (slug: string) => void;
  // Un marqueur a été glissé : nouvelle position manuelle.
  onMove: (slug: string, lat: number, lon: number) => void;
  // Clic droit sur un marqueur placé à la main : on retire le placement manuel.
  onRelease: (slug: string) => void;
  // Clic sur la carte pendant un placement.
  onPlace: (lat: number, lon: number) => void;
};

export type WorldMap = {
  setPoints(points: MapPoint[]): void;
  setPlacing(on: boolean): void;
  destroy(): void;
};

const PLACING_CLASS = 'wmt-placing';

export function createWorldMap(
  container: HTMLElement,
  dark: boolean,
  handlers: WorldMapHandlers,
): WorldMap {
  const map = L.map(container, { worldCopyJump: true, minZoom: 2, zoomSnap: 1 }).setView([25, 10], 2);
  // Tuiles OpenStreetMap : pas de clé API (CARTO en exige une désormais). Pas de version sombre :
  // en thème sombre, un filtre CSS (.wmt-dark, voir PANEL_CSS) inverse les couleurs des tuiles.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  container.classList.toggle('wmt-dark', dark);

  const markers = L.layerGroup().addTo(map);
  let placing = false;

  map.on('click', (event: L.LeafletMouseEvent) => {
    if (!placing) return;
    const { lat, lng } = event.latlng.wrap();
    handlers.onPlace(lat, lng);
  });

  // Le conteneur vient d'être inséré : Leaflet doit relire sa taille une fois la mise en page faite.
  const frame = requestAnimationFrame(() => map.invalidateSize());

  return {
    setPoints(points) {
      markers.clearLayers();
      for (const point of points) {
        const marker = L.marker([point.lat, point.lon], {
          icon: L.divIcon({
            className: point.manual ? 'wmt-pin wmt-pin-manual' : 'wmt-pin',
            iconSize: [14, 14],
          }),
          draggable: true,
        });
        // Au survol : la carte elle-même. Le pointeur peut se poser dessus sans la voir se déplacer.
        marker.bindTooltip(buildCardPreview(point.preview), {
          className: 'wmt-card-tip',
          direction: 'auto',
          offset: [12, 0],
          opacity: 1,
        });
        // La carte est haute : près du bord de la map, on la décale verticalement pour qu'elle reste entière.
        marker.on('tooltipopen', () => {
          const el = marker.getTooltip()?.getElement();
          if (!el) return;
          el.style.marginTop = '0px';
          const bounds = container.getBoundingClientRect();
          const rect = el.getBoundingClientRect();
          const shift = rect.bottom > bounds.bottom ? bounds.bottom - rect.bottom : 0;
          // Si la map est plus basse que la carte, on privilégie le haut de la carte.
          const top = rect.top + shift < bounds.top ? bounds.top - rect.top : shift;
          el.style.marginTop = `${top}px`;
        });
        marker.on('click', () => handlers.onOpen(point.slug));
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLatLng().wrap();
          handlers.onMove(point.slug, lat, lng);
        });
        if (point.manual) marker.on('contextmenu', () => handlers.onRelease(point.slug));
        marker.addTo(markers);
      }
    },
    setPlacing(on) {
      placing = on;
      container.classList.toggle(PLACING_CLASS, on);
    },
    destroy() {
      cancelAnimationFrame(frame);
      map.remove();
    },
  };
}

import * as L from 'leaflet';

export type MapPoint = { slug: string; title: string; lat: number; lon: number; manual: boolean };

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
  L.tileLayer(
    `https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`,
    { subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap © CARTO' },
  ).addTo(map);

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
        marker.bindTooltip(point.title);
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

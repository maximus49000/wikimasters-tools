import { useEffect, useMemo, useRef, useState } from 'react';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { KnownCard } from '../core/collection/collection-book';
import { EMPTY_GEO, partitionCards, type GeoState } from '../core/geo/geo-book';
import type { GeoRepo } from '../core/geo/geo-repo';
import { pageIsDark } from './map-theme';
import { createWorldMap, type MapPoint, type WorldMap } from './world-map';

// Styles des marqueurs et du mode « placement » (le CSS de Leaflet est ajouté à part).
export const PANEL_CSS = `
.wmt-pin{background:#34d399;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.wmt-pin-manual{background:#f59e0b}
.wmt-placing.leaflet-grab,.wmt-placing .leaflet-interactive{cursor:crosshair !important}
`;

type Props = {
  collection: CollectionRepo;
  geo: GeoRepo;
  onOpen: (slug: string) => void;
};

const box = {
  border: '1px solid var(--color-border, rgba(148,163,184,0.35))',
  borderRadius: 12,
  background: 'var(--color-surface, #0d1117)',
  color: 'var(--color-foreground, #e6edf3)',
  font: '14px/20px system-ui, sans-serif',
} as const;

export function WorldPanel({ collection, geo, onOpen }: Props) {
  const [cards, setCards] = useState<KnownCard[]>([]);
  const [geoState, setGeoState] = useState<GeoState>(EMPTY_GEO);
  const [placing, setPlacing] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<WorldMap | null>(null);
  // Les gestionnaires de la carte, créée une seule fois, lisent toujours l'état courant.
  const latest = useRef({ onOpen, geo, placing });
  latest.current = { onOpen, geo, placing };

  useEffect(() => {
    let alive = true;
    const loadCards = () => void collection.list().then((list) => alive && setCards(list));
    const loadGeo = () => void geo.load().then((state) => alive && setGeoState(state));
    loadCards();
    loadGeo();
    const offCollection = collection.subscribe(loadCards);
    const offGeo = geo.subscribe(loadGeo);
    return () => {
      alive = false;
      offCollection();
      offGeo();
    };
  }, [collection, geo]);

  useEffect(() => {
    if (cards.length > 0) void geo.resolveMissing(cards.map((card) => card.slug));
  }, [cards, geo]);

  const { placed, unplaced } = useMemo(() => partitionCards(cards, geoState), [cards, geoState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = createWorldMap(container, pageIsDark(), {
      onOpen: (slug) => latest.current.onOpen(slug),
      onMove: (slug, lat, lon) => void latest.current.geo.setManual(slug, { lat, lon }),
      onRelease: (slug) => void latest.current.geo.clearManual(slug),
      onPlace: (lat, lon) => {
        const slug = latest.current.placing;
        if (!slug) return;
        void latest.current.geo.setManual(slug, { lat, lon });
        setPlacing(null);
      },
    });
    mapRef.current = map;
    return () => {
      map.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const points: MapPoint[] = placed.map(({ card, position }) => ({
      slug: card.slug,
      title: card.title,
      lat: position.lat,
      lon: position.lon,
      manual: position.source === 'manual',
    }));
    mapRef.current?.setPoints(points);
  }, [placed]);

  useEffect(() => {
    mapRef.current?.setPlacing(placing !== null);
  }, [placing]);

  const placingTitle = cards.find((card) => card.slug === placing)?.title;

  return (
    <div style={{ ...box, display: 'flex', gap: 12, padding: 12, margin: '12px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div ref={containerRef} style={{ height: '70vh', minHeight: 420, borderRadius: 8 }} />
        <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: 12 }}>
          {cards.length === 0
            ? 'Aucune carte connue : parcourez la Collection pour que l’extension les découvre.'
            : `${cards.length} cartes connues · ${placed.length} placées. Glissez un point pour le corriger, clic droit sur un point orange pour retirer votre placement.`}
        </p>
      </div>
      <aside style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong>À placer ({unplaced.length})</strong>
        {placingTitle && (
          <div style={{ fontSize: 12 }}>
            Cliquez sur la carte pour placer « {placingTitle} ».{' '}
            <button type="button" onClick={() => setPlacing(null)} style={linkButton}>
              Annuler
            </button>
          </div>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', maxHeight: '64vh' }}>
          {unplaced.map((card) => (
            <li key={card.slug}>
              <button
                type="button"
                onClick={() => setPlacing(card.slug)}
                style={{
                  ...linkButton,
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '4px 6px',
                  borderRadius: 6,
                  background: card.slug === placing ? 'rgba(52,211,153,0.15)' : 'none',
                }}
              >
                {card.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

const linkButton = {
  border: 0,
  background: 'none',
  cursor: 'pointer',
  font: 'inherit',
  color: 'var(--color-accent, #34d399)',
  padding: 0,
} as const;

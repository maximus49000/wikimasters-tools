import { useEffect, useMemo, useRef, useState } from 'react';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { toCardPreview } from '../core/collection/card-preview';
import type { KnownCard } from '../core/collection/collection-book';
import { IDLE_SCAN, type CollectionScanner, type ScanState } from '../core/collection/collection-scan';
import { EMPTY_GEO, partitionCards, type GeoState } from '../core/geo/geo-book';
import type { GeoRepo } from '../core/geo/geo-repo';
import type { PriceBook } from '../core/pricing/price-book';
import { pageIsDark } from './map-theme';
import { createThrottledLoader } from './throttle';
import { createWorldMap, type MapPoint, type WorldMap } from './world-map';

// Styles des marqueurs et du mode « placement » (le CSS de Leaflet est ajouté à part).
export const PANEL_CSS = `
.wmt-pin{background:#34d399;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.wmt-pin-manual{background:#f59e0b}
.wmt-dark .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.95) contrast(.9)}
.wmt-dark{background:#1b1b1b}
.wmt-card-tip{padding:0;border:0;background:none;box-shadow:none}
.wmt-card-tip::before{display:none}
.wmt-card{position:relative;width:168px;height:236px;border-radius:12px;overflow:hidden;background:#0d1117;color:#e6edf3;border:2px solid rgba(148,163,184,.5);box-shadow:0 6px 18px rgba(0,0,0,.5);font:600 13px/17px system-ui,sans-serif;white-space:normal}
.wmt-card-art{position:absolute;inset:0;background:linear-gradient(160deg,#1f2937,#0d1117)}
.wmt-card-art img{width:100%;height:100%;object-fit:cover;display:block}
.wmt-card-rarity{position:absolute;top:8px;left:8px;padding:2px 8px;border-radius:6px;background:rgba(13,17,23,.85);border:1px solid rgba(148,163,184,.5);font:700 12px/16px system-ui,sans-serif}
.wmt-card-price{position:absolute;top:8px;right:8px;padding:2px 8px;border-radius:6px;background:rgb(34,197,94);color:rgb(13,17,23);box-shadow:0 0 10px rgba(34,197,94,.6);font:700 12px/16px system-ui,sans-serif;text-align:center}
.wmt-card-title{position:absolute;left:0;right:0;bottom:0;padding:22px 10px 10px;background:linear-gradient(transparent,rgba(13,17,23,.92));text-align:center}
.wmt-placing.leaflet-grab,.wmt-placing .leaflet-interactive{cursor:crosshair !important}
`;

type Props = {
  collection: CollectionRepo;
  geo: GeoRepo;
  scanner: CollectionScanner;
  book: PriceBook | null;
  onOpen: (slug: string) => void;
};

const box = {
  border: '1px solid var(--color-border, rgba(148,163,184,0.35))',
  borderRadius: 12,
  background: 'var(--color-surface, #0d1117)',
  color: 'var(--color-foreground, #e6edf3)',
  font: '14px/20px system-ui, sans-serif',
} as const;

// Un scan « en cours » sans aucune activité depuis cette durée est considéré comme interrompu.
const STALLED_MS = 60_000;

export function WorldPanel({ collection, geo, scanner, book, onOpen }: Props) {
  const [cards, setCards] = useState<KnownCard[]>([]);
  const [scan, setScan] = useState<ScanState>(IDLE_SCAN);
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
    const loadScan = () => void scanner.state().then((state) => alive && setScan(state));
    const cardsReload = createThrottledLoader(loadCards, 1000);
    const geoReload = createThrottledLoader(loadGeo, 1000);
    loadCards();
    loadGeo();
    loadScan();
    const offCollection = collection.subscribe(cardsReload.call);
    const offGeo = geo.subscribe(geoReload.call);
    const offScan = scanner.subscribe(loadScan);
    return () => {
      alive = false;
      cardsReload.cancel();
      geoReload.cancel();
      offCollection();
      offGeo();
      offScan();
    };
  }, [collection, geo, scanner]);

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
      preview: toCardPreview(card, book?.byTitle(card.title) ?? null),
      lat: position.lat,
      lon: position.lon,
      manual: position.source === 'manual',
    }));
    mapRef.current?.setPoints(points);
  }, [placed, book]);

  useEffect(() => {
    mapRef.current?.setPlacing(placing !== null);
  }, [placing]);

  const stalled = scan.status === 'running' && Date.now() - scan.updatedAt > STALLED_MS;
  const placingTitle = cards.find((card) => card.slug === placing)?.title;

  return (
    <div style={{ ...box, display: 'flex', gap: 12, padding: 12, margin: '12px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div ref={containerRef} style={{ height: '70vh', minHeight: 420, borderRadius: 8 }} />
        <p style={{ margin: '8px 0 0', fontSize: 12 }}>
          {scan.status === 'running' && !stalled && `Scan de la Collection en cours… page ${scan.nextPage + 1}, ${scan.entries} cartes lues.`}
          {stalled && 'Scan interrompu (aucune activité). '}
          {scan.status === 'done' && `Collection scannée (${scan.entries} cartes lues). `}
          {scan.status === 'error' && `Scan interrompu : ${scan.error ?? 'erreur inconnue'}. `}
          {scan.status === 'idle' && 'Scan de la Collection pas encore lancé. '}
          {(scan.status !== 'running' || stalled) && (
            <button
              type="button"
              onClick={() => void scanner.run({ force: scan.status === 'done' })}
              style={linkButton}
            >
              {scan.status === 'done' ? 'Re-scanner' : scan.status === 'error' || stalled ? 'Reprendre' : 'Lancer le scan'}
            </button>
          )}
        </p>
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

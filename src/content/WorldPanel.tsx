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
.wmt-card{position:relative;display:flex;flex-direction:column;width:260px;height:378px;border-radius:16px;overflow:hidden;background:#f1f5f9;color:#0f172a;border:1px solid rgba(15,23,42,.12);box-shadow:0 8px 24px rgba(0,0,0,.45);font:400 12px/16px system-ui,sans-serif;white-space:normal}
.wmt-card[data-rarity="SR"]{background:linear-gradient(160deg,#fbcfe8,#f472b6 60%,#ec4899)}
.wmt-card-art{flex:0 0 45%;background:linear-gradient(160deg,#cbd5e1,#94a3b8)}
.wmt-card-art img{width:100%;height:100%;object-fit:cover;display:block}
.wmt-card-rarity{position:absolute;top:10px;left:10px;padding:2px 10px;border-radius:8px;background:#94a3b8;color:#fff;font:700 13px/18px system-ui,sans-serif}
.wmt-card[data-rarity="SR"] .wmt-card-rarity{background:#f472b6}
.wmt-card-star{position:absolute;top:8px;right:10px;font:400 26px/28px system-ui,sans-serif;color:rgba(234,179,8,.85)}
.wmt-card-price{position:absolute;top:44px;right:8px;padding:2px 8px;border-radius:6px;background:rgb(34,197,94);color:rgb(13,17,23);box-shadow:0 0 10px rgba(34,197,94,.6);font:700 12px/16px system-ui,sans-serif;text-align:center}
.wmt-card-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:10px 12px 8px;gap:4px}
.wmt-card-title{font:700 16px/20px system-ui,sans-serif;color:#0b0f19}
.wmt-card-extract{flex:1;min-height:0;overflow:hidden;color:rgba(15,23,42,.75);-webkit-mask-image:linear-gradient(#000 75%,transparent)}
.wmt-card-stats{display:flex;justify-content:space-between;padding-top:6px;border-top:1px solid rgba(15,23,42,.15);font:700 15px/20px system-ui,sans-serif}
.wmt-card-atk{color:#dc2626}.wmt-card-def{color:#1d4ed8}
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

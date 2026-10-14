import { useState, type CSSProperties, type ReactElement } from 'react';
import type { PlaceHit } from '../core/library/geocode';
import { localClock } from '../core/library/scene-clock';
import { GEO, OFF, toSceneCity, type SceneCity, type SceneLocation } from '../core/library/scene-location';
import { formatMinutes } from '../core/library/time-setting';
import { usePlaceSearch } from './use-place-search';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
type Mode = SceneLocation['mode'];
const MODES: readonly { mode: Mode; glyph: string; label: string }[] = [
  { mode: 'geo', glyph: '📍', label: 'Géolocalisation' },
  { mode: 'city', glyph: '🏙', label: 'Ville' },
  { mode: 'off', glyph: '⊘', label: 'Désactivé' },
];

const modeStyle = (on: boolean): CSSProperties => ({
  flex: 1,
  minHeight: 56,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  cursor: 'pointer',
  font: '600 12.5px system-ui, sans-serif',
  color: on ? '#0d1117' : 'inherit',
  background: on ? 'var(--color-accent, #34d399)' : 'none',
  border: on ? '1px solid transparent' : border,
  borderRadius: 12,
});
const hitStyle: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', width: '100%', minHeight: 48, padding: '4px 10px', cursor: 'pointer', color: 'inherit', background: 'none', border: 'none', borderTop: border, font: 'inherit', textAlign: 'left' };
const searchStyle: CSSProperties = { boxSizing: 'border-box', width: '100%', minHeight: 44, padding: '0 10px', borderRadius: 12, border, background: 'transparent', color: 'inherit', font: 'inherit' };
const hintStyle: CSSProperties = { fontSize: 12.5, opacity: 0.75 };

// Ligne secondaire d'un résultat : « région, pays · population » (la population départage les homonymes).
export const placeDetail = (hit: PlaceHit): string =>
  [[hit.admin, hit.country].filter(Boolean).join(', '), hit.population ? `${new Intl.NumberFormat('fr-FR').format(hit.population)} hab.` : ''].filter(Boolean).join(' · ');
const cityTime = (city: SceneCity): string => formatMinutes(localClock(new Date(), city.tz).minutes);
const sameCity = (a: SceneCity | null, b: SceneCity): boolean => !!a && a.name === b.name && a.lat === b.lat && a.lon === b.lon;

// Trois choix du lieu de la scène et recherche de ville, partagés par la fenêtre de la pièce et Paramètres › Position.
// Géolocalisation et Désactivé s'enregistrent au toucher ; « Ville » n'enregistre rien tant qu'aucune ville n'est touchée.
export function LocationPicker({ value, onChange }: { value: SceneLocation; onChange: (next: SceneLocation) => void }): ReactElement {
  const [view, setView] = useState<Mode>(value.mode);
  const search = usePlaceSearch();
  const chosen = value.mode === 'city' ? value.city : null;
  const pick = (mode: Mode): void => {
    setView(mode);
    if (mode === 'geo') onChange(GEO);
    if (mode === 'off') onChange(OFF);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div role="group" aria-label="Lieu de la scène" data-location-modes="" style={{ display: 'flex', gap: 6 }}>
        {MODES.map(({ mode, glyph, label }) => (
          <button key={mode} type="button" data-location-mode={mode} aria-pressed={view === mode} aria-label={label} title={label} onClick={() => pick(mode)} style={modeStyle(view === mode)}>
            <span aria-hidden="true" style={{ fontSize: 20 }}>{glyph}</span>
            <span aria-hidden="true">{label}</span>
          </button>
        ))}
      </div>
      {view === 'city' && (
        <>
          {chosen && (
            <p data-place-chosen="" style={{ margin: 0 }}>
              Choisie : <strong>{chosen.name}</strong>{chosen.country ? ` (${chosen.country})` : ''} · il y est {cityTime(chosen)}
            </p>
          )}
          <input type="search" data-place-search="" aria-label="Chercher une ville" placeholder="Chercher une ville…" value={search.query} onChange={(e) => search.setQuery(e.currentTarget.value)} style={searchStyle} />
          {search.status === 'loading' && <span data-place-status="loading" aria-live="polite" style={hintStyle}>Recherche…</span>}
          {search.status === 'short' && search.query.trim() !== '' && <span data-place-status="short" style={hintStyle}>Tapez au moins 2 lettres.</span>}
          {search.status === 'done' && search.hits.length === 0 && <span data-place-status="empty" role="status">Aucune ville trouvée</span>}
          {(search.status === 'offline' || search.status === 'failed') && (
            <span data-place-status="offline" role="status">Recherche impossible sans internet — la ville déjà choisie reste</span>
          )}
          {search.hits.length > 0 && (
            <ul data-place-results="" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {search.hits.map((hit) => (
                <li key={`${hit.name}|${hit.lat}|${hit.lon}`}>
                  <button type="button" data-place-hit={`${hit.name}|${hit.country}`} aria-pressed={sameCity(chosen, hit)} onClick={() => onChange({ mode: 'city', city: toSceneCity(hit) })} style={hitStyle}>
                    <strong>{hit.name}</strong>
                    <small style={{ opacity: 0.75 }}>{placeDetail(hit)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState, type CSSProperties } from 'react';
import type { Listen } from '../core/music/listen';
import type { ScreenDetail } from '../core/screen/tmdb-api';
import { tidalUrl } from '../core/tidal/tidal-listen';
import { Glyph } from './Glyphs';
import { getMusicService } from './music-registry';

const SIZE = 44; // cible tactile
const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: SIZE, padding: '0 4px 0 8px', boxSizing: 'border-box', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, textAlign: 'left', font: '13px system-ui, sans-serif', textDecoration: 'none' };
const ellipsis: CSSProperties = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// « Bande originale » du film ou de la série, sous la bande-annonce : trouvée à l'ouverture de la fiche (et gardée) sur la plateforme choisie.
// Spotify : un clic lance l'album ; Tidal : un lien ↗ ouvre l'album (pas de lecture dans l'appli). Rien d'affiché sans compte lié ni sans BO trouvée.
export function SoundtrackButton({ detail }: { detail: Pick<ScreenDetail, 'mediaType' | 'id' | 'title' | 'originalTitle'> }) {
  const service = getMusicService();
  const [listen, setListen] = useState<Listen | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { mediaType, id, title, originalTitle } = detail;

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    setListen(null);
    setMessage(null);
    const load = () => {
      void service.soundtrack(`${mediaType}:${id}`, originalTitle ? [title, originalTitle] : [title]).then((found) => !cancelled && setListen(found));
    };
    load();
    // Un compte lié ou délié, ou une autre plateforme choisie : la BO se redemande (depuis le dépôt, sans nouvel appel si elle est gardée).
    const off = service.subscribe(load);
    return () => {
      cancelled = true;
      off();
    };
  }, [service, mediaType, id, title, originalTitle]);

  if (!service || !listen) return null;
  const link = listen.albumUri ? tidalUrl(listen.albumUri) : null;
  const first = listen.items[0];
  if (!link && !first) return null;

  const label = `Écouter la bande originale${listen.album ? ` : ${listen.album.name}` : ''}`;
  const body = (
    <>
      <Glyph name="note" size={18} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...ellipsis, fontWeight: 600 }}>{listen.album?.name ?? 'Bande originale'}</span>
        <span style={{ ...ellipsis, fontSize: 11, opacity: 0.7 }}>Bande originale{listen.album?.artist ? ` · ${listen.album.artist}` : ''}</span>
      </span>
      <span style={{ width: SIZE, height: SIZE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Glyph name={link ? 'external' : 'play'} size={link ? 16 : 20} />
      </span>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" aria-label={label} title="Ouvrir la bande originale sur Tidal" style={row}>
          {body}
        </a>
      ) : (
        <button type="button" onClick={() => void service.play(first!, listen).then(setMessage)} aria-label={label} title="Écouter la bande originale" style={row}>
          {body}
        </button>
      )}
      {message && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {message}
        </p>
      )}
    </div>
  );
}

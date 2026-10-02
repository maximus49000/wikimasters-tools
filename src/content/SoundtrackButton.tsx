import { useEffect, useState } from 'react';
import type { Listen } from '../core/music/listen';
import type { ScreenDetail } from '../core/screen/tmdb-api';
import { Glyph } from './Glyphs';
import { getMusicService } from './music-registry';

const SIZE = 44; // cible tactile
const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

// « Bande originale » du film ou de la série, sous la bande-annonce : trouvée sur Spotify à l'ouverture de la fiche (et gardée),
// rien d'affiché sans compte lié, sans BO trouvée ou avec une autre plateforme.
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

  const first = listen?.items[0];
  if (!service || !listen || !first) return null;

  const play = async () => setMessage(await service.play(first, listen));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        onClick={() => void play()}
        aria-label={`Écouter la bande originale${listen.album ? ` : ${listen.album.name}` : ''}`}
        title="Écouter la bande originale"
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: SIZE, padding: '0 4px 0 8px', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, textAlign: 'left', font: '13px system-ui, sans-serif' }}
      >
        <Glyph name="note" size={18} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{listen.album?.name ?? 'Bande originale'}</span>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, opacity: 0.7 }}>
            Bande originale{listen.album?.artist ? ` · ${listen.album.artist}` : ''}
          </span>
        </span>
        <span style={{ width: SIZE, height: SIZE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Glyph name="play" size={20} />
        </span>
      </button>
      {message && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {message}
        </p>
      )}
    </div>
  );
}

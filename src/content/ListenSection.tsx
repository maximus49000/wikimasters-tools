import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Track } from '../core/spotify/spotify-api';
import type { Listen } from '../core/music/listen';
import { Glyph } from './Glyphs';
import { getMusicService } from './music-registry';
import type { ListenView } from './music-service';

const SIZE = 44; // cible tactile
const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const iconButton = {
  width: SIZE,
  height: SIZE,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  cursor: 'pointer',
  color: 'inherit',
  background: 'none',
  border,
  borderRadius: 8,
} as const;

type Props = { slug: string; title: string; onHeight: (px: number) => void };

// Section « Écouter » de la fiche d'une carte musique de la collection ; rien pour les autres cartes.
export function ListenSection({ slug, title, onHeight }: Props) {
  const service = getMusicService();
  const [view, setView] = useState<ListenView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    void service.view(slug, title).then((next) => !cancelled && setView(next));
    // Liaison ou déliaison pendant que la fiche est ouverte : on recharge.
    const off = service.subscribe(() => setVersion((value) => value + 1));
    return () => {
      cancelled = true;
      off();
    };
  }, [service, slug, title, version]);

  // La fiche se replace selon la hauteur réelle de la section.
  useLayoutEffect(() => {
    onHeight(view && view.status !== 'none' ? (ref.current?.offsetHeight ?? 0) : 0);
  }, [view, message, onHeight]);

  if (!service || !view || view.status === 'none') return null;

  const play = async (item: Track, listen: Listen) => setMessage(await service.play(item, listen));
  const link = async () => setMessage(await service.link());

  return (
    <div ref={ref} style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {view.status === 'unlinked' && (
        <button type="button" onClick={link} aria-label="Lier Spotify pour écouter" title="Lier Spotify pour écouter" style={{ ...iconButton, width: '100%', gap: 8, font: '600 13px system-ui, sans-serif' }}>
          <Glyph name="link" /> Spotify
        </button>
      )}
      {view.status === 'error' && <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{view.message}</p>}
      {view.status === 'ready' && (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 'min(160px, 25vh)', overflowY: 'auto' }}>
            {view.listen.items.map((item, index) => (
              <li key={item.uri} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: SIZE, borderBottom: border, fontSize: 13 }}>
                {view.listen.kind !== 'track' && <span style={{ width: 18, opacity: 0.6, fontSize: 11 }}>{index + 1}</span>}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                  {view.listen.kind === 'artist' && item.artist && <span style={{ opacity: 0.6 }}> · {item.artist}</span>}
                </span>
                <button type="button" onClick={() => void play(item, view.listen)} aria-label={`Lire ${item.title}`} title={`Lire ${item.title}`} style={{ ...iconButton, width: 36, height: 36, borderRadius: '50%' }}>
                  <Glyph name="play" size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void service.unlink()} aria-label="Délier Spotify" title="Délier Spotify" style={{ ...iconButton, width: 28, height: 28, alignSelf: 'flex-end', opacity: 0.6 }}>
            <Glyph name="unlink" size={14} />
          </button>
        </>
      )}
      {message && <p role="status" style={{ margin: 0, fontSize: 12 }}>{message}</p>}
    </div>
  );
}

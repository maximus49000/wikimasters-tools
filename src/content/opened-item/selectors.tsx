// Sélecteurs du plateau de l'objet ouvert (face intérieure du couvercle) : pour l'instant les pistes d'une carte musique.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { Track } from '../../core/spotify/spotify-api';
import type { Listen } from '../../core/music/listen';
import { musicRows, type SelectorModel } from '../../core/library/opened-item';
import { TIDAL_HOME_URL } from '../../core/tidal/config';
import { tidalUrl } from '../../core/tidal/tidal-listen';
import { track as telemetry } from '../../core/telemetry/registry';
import { Glyph } from '../Glyphs';
import { NO_PLAYER, noPlayer, noSubscribe } from '../ListenSection';
import { getMusicService, getPlayerSource } from '../music-registry';
import { isPlayingUri } from '../player-source';
import { usePlatform } from '../usePlatform';

const SIZE = 44;
const ROW = { display: 'flex', alignItems: 'center', gap: 8, minHeight: SIZE, borderBottom: '1px solid rgba(43,29,22,.25)', fontSize: 13 } as const;
const ROUND = { width: SIZE, height: SIZE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer', color: 'inherit', background: 'none', border: '1px solid rgba(43,29,22,.5)', borderRadius: '50%', textDecoration: 'none' } as const;
const EMPTY: SelectorModel = { rows: [], empty: 'Aucune piste trouvée' };

type Props = { slug: string; title: string; onPlayed: (track: Track) => void };

export function MusicSelector({ slug, title, onPlayed }: Props): ReactElement {
  const service = getMusicService();
  const source = getPlayerSource();
  const platform = usePlatform();
  const player = useSyncExternalStore(source?.subscribe ?? noSubscribe, source?.current ?? noPlayer);
  const [model, setModel] = useState<SelectorModel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Carte affichée : le message d'une lecture d'une carte quittée ou démontée est ignoré.
  const shown = useRef({ slug, title, alive: true });
  shown.current.slug = slug;
  shown.current.title = title;
  useEffect(() => { shown.current.alive = true; return () => { shown.current.alive = false; }; }, []);

  useEffect(() => {
    let cancelled = false;
    setModel(null);
    setMessage(null);
    if (!service) { setModel(EMPTY); return; }
    void service.view(slug, title).then(
      (view) => !cancelled && setModel(view.status === 'ready' ? musicRows(view.listen) : EMPTY),
      () => !cancelled && setModel(EMPTY),
    );
    return () => { cancelled = true; };
  }, [service, slug, title]);

  if (!model) return <div data-selector="music" />;
  const play = async (item: Track, listen: Listen) => {
    if (!service) return;
    const result = await service.play(item, listen, { slug, title });
    const now = shown.current;
    if (now.alive && now.slug === slug && now.title === title) setMessage(result);
    if (result === null) onPlayed(item);
  };

  return (
    <div data-selector="music" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {model.empty && <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{model.empty}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {model.rows.map((row, index) => {
          if (row.kind !== 'track') return null;
          const nowPlaying = isPlayingUri(source ? player : NO_PLAYER, row.track.uri);
          return (
            <li key={row.track.uri} data-track={row.track.uri} data-playing={nowPlaying ? '1' : undefined} style={ROW}>
              {row.listen.kind !== 'track' && <span style={{ width: 18, opacity: 0.6, fontSize: 11 }}>{index + 1}</span>}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: nowPlaying ? 700 : 400 }}>
                {row.track.title}
                {row.listen.kind === 'artist' && row.track.artist && <span style={{ opacity: 0.6 }}> · {row.track.artist}</span>}
              </span>
              {platform === 'tidal' ? (
                <a href={tidalUrl(row.track.uri) ?? TIDAL_HOME_URL} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${row.track.title} dans Tidal`} title={`Ouvrir ${row.track.title} dans Tidal`}
                  onClick={() => { telemetry('lecture-musique', 'tidal'); onPlayed(row.track); }} style={ROUND}>
                  <Glyph name="external" size={16} />
                </a>
              ) : (
                <button type="button" aria-label={`${nowPlaying ? 'Mettre en pause' : 'Lire'} ${row.track.title}`} title={`${nowPlaying ? 'Mettre en pause' : 'Lire'} ${row.track.title}`}
                  onClick={() => (nowPlaying && source ? void source.toggle() : void play(row.track, row.listen))}
                  style={{ ...ROUND, ...(nowPlaying ? { background: '#34d399', color: '#0d1117', borderColor: 'transparent' } : {}) }}>
                  <Glyph name={nowPlaying ? 'pause' : 'play'} size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {message && <p role="alert" style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.85 }}>{message}</p>}
    </div>
  );
}

// Sélecteurs du plateau de l'objet ouvert (face intérieure du couvercle) : pistes d'une carte musique, bande-annonce et BO d'un film ou d'un jeu.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { Track } from '../../core/spotify/spotify-api';
import type { Listen } from '../../core/music/listen';
import { bookRows, gameRows, musicRows, screenRows, type GameViewLike, type ScreenViewLike, type SelectorModel, type SelectorRow } from '../../core/library/opened-item';
import { TIDAL_HOME_URL } from '../../core/tidal/config';
import { tidalUrl } from '../../core/tidal/tidal-listen';
import { track as telemetry } from '../../core/telemetry/registry';
import type { BookView } from '../book-service';
import { getBookService } from '../book-registry';
import { getGameService } from '../game-registry';
import { Glyph } from '../Glyphs';
import { HlsTrailerPlayer } from '../HlsTrailerPlayer';
import { NO_PLAYER, noPlayer, noSubscribe } from '../ListenSection';
import { getMusicService, getPlayerSource } from '../music-registry';
import { isPlayingUri } from '../player-source';
import { getScreenService } from '../screen-registry';
import { TrailerPlayer } from '../TrailerPlayer';
import { usePlatform } from '../usePlatform';

const SIZE = 44;
const ROW = { display: 'flex', alignItems: 'center', gap: 8, minHeight: SIZE, borderBottom: '1px solid rgba(43,29,22,.25)', fontSize: 13 } as const;
const ROUND = { width: SIZE, height: SIZE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer', color: 'inherit', background: 'none', border: '1px solid rgba(43,29,22,.5)', borderRadius: '50%', textDecoration: 'none' } as const;
const EMPTY: SelectorModel = { rows: [], empty: 'Aucune piste trouvée' };

export type Video = Extract<SelectorRow, { kind: 'video' }>['video'];
type Props = { slug: string; title: string; onPlayed: (track: Track) => void };
// `onVideo` : la vidéo choisie (à montrer à la place du disque), ou null quand on la quitte.
// `video` : la vidéo actuellement au plateau (source unique, tenue par le parent) ; null = le disque.
type MediaProps = Props & { video: Video | null; onVideo: (video: Video | null) => void };
type BodyProps = Props & { name: string; loadKey: string; load: () => Promise<SelectorModel>; video?: Video | null; onVideo?: (video: Video | null) => void };

// La vidéo choisie, à la place du disque : lecteur de bande-annonce (YouTube) ou flux HLS Steam, avec leur ⛶ plein écran.
export function VideoPlayer({ video, onEnded }: { video: Video; onEnded?: () => void }): ReactElement {
  return (
    <div data-case-video="" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%' }}>
        {video.kind === 'youtube'
          ? <TrailerPlayer trailerKey={video.key} {...(onEnded ? { onEnded } : {})} />
          : <HlsTrailerPlayer url={video.url} pageUrl={video.pageUrl} {...(video.poster ? { poster: video.poster } : {})} {...(onEnded ? { onEnded } : {})} />}
      </div>
    </div>
  );
}

// Corps commun des sélecteurs : les lignes d'un modèle (pistes, vidéo), lecture d'une piste avec la carte.
function SelectorBody({ name, slug, title, loadKey, load, onPlayed, video = null, onVideo }: BodyProps): ReactElement {
  const service = getMusicService();
  const source = getPlayerSource();
  const platform = usePlatform();
  const player = useSyncExternalStore(source?.subscribe ?? noSubscribe, source?.current ?? noPlayer);
  const [model, setModel] = useState<SelectorModel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const videoOn = video !== null;
  // Carte affichée : le message d'une lecture d'une carte quittée ou démontée est ignoré.
  const shown = useRef({ slug, title, alive: true });
  shown.current.slug = slug;
  shown.current.title = title;
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => { shown.current.alive = true; return () => { shown.current.alive = false; }; }, []);

  useEffect(() => {
    let cancelled = false;
    setModel(null);
    setMessage(null);
    loader.current().then(
      (next) => !cancelled && setModel(next),
      () => !cancelled && setModel(EMPTY),
    );
    return () => { cancelled = true; };
  }, [loadKey]);

  if (!model) return <div data-selector={name} />;
  const play = async (item: Track, listen: Listen) => {
    if (!service) return;
    const result = await service.play(item, listen, { slug, title });
    const now = shown.current;
    if (now.alive && now.slug === slug && now.title === title) setMessage(result);
    if (result === null) played(item);
  };
  // Une piste de BO rend le disque au plateau avant de partir au poste ; une vidéo, elle, ne va jamais au poste.
  const played = (item: Track) => {
    if (videoOn) onVideo?.(null);
    onPlayed(item);
  };

  return (
    <div data-selector={name} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {model.empty && <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{model.empty}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {model.rows.map((row, index) => {
          if (row.kind === 'video') {
            const label = 'Voir la bande-annonce';
            return (
              <li key="video" data-video="" data-playing={videoOn ? '1' : undefined} style={ROW}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: videoOn ? 700 : 400 }}>{row.label}</span>
                <button type="button" aria-label={label} title={label} aria-pressed={videoOn}
                  onClick={() => onVideo?.(videoOn ? null : row.video)}
                  style={{ ...ROUND, ...(videoOn ? { background: '#34d399', color: '#0d1117', borderColor: 'transparent' } : {}) }}>
                  <Glyph name="play" size={16} />
                </button>
              </li>
            );
          }
          if (row.kind === 'synopsis') {
            return <li key="synopsis" data-synopsis="" style={{ ...ROW, display: 'block', padding: '6px 0', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{row.text}</li>;
          }
          if (row.kind === 'link') {
            const label = `Lire sur ${row.label}`;
            return (
              <li key={row.url} data-link={row.url} style={ROW}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                <a href={row.url} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} style={ROUND}>
                  <Glyph name="external" size={16} />
                </a>
              </li>
            );
          }
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
                  onClick={() => { telemetry('lecture-musique', 'tidal'); played(row.track); }} style={ROUND}>
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

export function MusicSelector({ slug, title, onPlayed }: Props): ReactElement {
  const service = getMusicService();
  const load = async (): Promise<SelectorModel> => {
    if (!service) return EMPTY;
    const view = await service.view(slug, title);
    return view.status === 'ready' ? musicRows(view.listen) : EMPTY;
  };
  return <SelectorBody name="music" slug={slug} title={title} loadKey={`${slug}|${title}|${service ? 1 : 0}`} load={load} onPlayed={onPlayed} />;
}

// La BO du film, de la série ou du jeu : seule une réponse du service musical (compte lié) compte ; sinon pas de piste.
const soundtrackOf = async (key: string, titles: string[]): Promise<Listen | null> => {
  try { return (await getMusicService()?.soundtrack(key, titles)) ?? null; } catch { return null; }
};
const titlesOf = (title: string, original?: string): string[] => (original ? [title, original] : [title]);

// Film ou série : bande-annonce (à la place du disque) puis BO (qui va au poste). Le service dit sa panne ; ⓘ reste là pour la fiche.
export function ScreenSelector({ slug, title, onPlayed, video, onVideo }: MediaProps): ReactElement {
  const load = async (): Promise<SelectorModel> => {
    const screen = getScreenService();
    if (!screen) return screenRows({ status: 'none' }, null);
    const view = await screen.view(slug, title).catch((): ScreenViewLike => ({ status: 'error', message: 'Le film est indisponible pour le moment.' }));
    const bo = view.status === 'detail' ? await soundtrackOf(`${view.detail.mediaType}:${view.detail.id}`, titlesOf(view.detail.title, view.detail.originalTitle)) : null;
    return screenRows(view, bo);
  };
  return <SelectorBody name="screen" slug={slug} title={title} loadKey={`${slug}|${title}`} load={load} onPlayed={onPlayed} video={video} onVideo={onVideo} />;
}

export function GameSelector({ slug, title, onPlayed, video, onVideo }: MediaProps): ReactElement {
  const load = async (): Promise<SelectorModel> => {
    const games = getGameService();
    if (!games) return gameRows({ status: 'none' }, null);
    const view = await games.view(slug, title).catch((): GameViewLike => ({ status: 'error', message: 'Le jeu vidéo est indisponible pour le moment.' }));
    const bo = view.status === 'detail' ? await soundtrackOf(`game:${view.detail.source}:${view.detail.id}`, titlesOf(view.detail.title, view.detail.originalTitle)) : null;
    return gameRows(view, bo);
  };
  return <SelectorBody name="game" slug={slug} title={title} loadKey={`${slug}|${title}`} load={load} onPlayed={onPlayed} video={video} onVideo={onVideo} />;
}

// Livre : le synopsis et les liens de lecture gratuite (Wikisource, Gutenberg, Internet Archive). Rien ne se joue : pas de disque, pas de poste.
export function BookSelector({ slug, title, onPlayed }: Props): ReactElement {
  const load = async (): Promise<SelectorModel> => {
    const books = getBookService();
    if (!books) return bookRows({ status: 'none' }, null);
    const view = await books.view(slug, title).catch((): BookView => ({ status: 'error', message: 'Le livre est indisponible pour le moment.' }));
    const reading = view.status === 'detail'
      ? await books.reading(slug, { id: view.detail.id, title: view.detail.title, ...(view.detail.author ? { author: view.detail.author } : {}) }).catch(() => null)
      : null;
    return bookRows(view, reading);
  };
  return <SelectorBody name="book" slug={slug} title={title} loadKey={`${slug}|${title}`} load={load} onPlayed={onPlayed} />;
}

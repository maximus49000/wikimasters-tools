import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Track } from '../core/spotify/spotify-api';
import type { Listen } from '../core/music/listen';
import { Glyph } from './Glyphs';
import { getMusicService, getPlayerSource } from './music-registry';
import type { ListenView } from './music-service';
import { isPlayingUri, type PlayerView } from './player-source';

// Après une limite de Spotify (429) : on recharge d'elle-même la section une fois le délai demandé passé,
// avec une marge (la pause du client se termine à la milliseconde près) et au plus 5 fois d'affilée.
const RETRY_MARGIN_MS = 1_000;
const MAX_AUTO_RETRIES = 5;
// Au-delà, un minuteur se déclencherait aussitôt.
const MAX_TIMER_MS = 2_147_483_647;

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

// Sans lecteur (plateforme sans Spotify) : une vue vide stable.
const NO_PLAYER: PlayerView = { linked: false, track: null, hidden: false, enabled: true, card: null };
const noSubscribe = () => () => undefined;
const noPlayer = () => NO_PLAYER;

type Props = { slug: string; title: string };

// Section « Écouter » de la fiche native d'une carte musique de la collection ; rien pour les autres cartes.
export function ListenSection({ slug, title }: Props) {
  const service = getMusicService();
  const source = getPlayerSource();
  const player = useSyncExternalStore(source?.subscribe ?? noSubscribe, source?.current ?? noPlayer);
  const [view, setView] = useState<ListenView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Rechargements automatiques d'affilée après une limite ; chaque carte repart de zéro.
  const [autoRetries, setAutoRetries] = useState(0);

  // Carte dont la vue affichée est issue : un rechargement de la même carte (nouvelle tentative, liaison) garde l'affichage jusqu'à la réponse.
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    // Vue et message de la carte précédente : périmés dès que la fiche change. Pas à chaque rechargement : la fiche clignoterait.
    const card = `${slug}\n${title}`;
    if (shownFor.current !== card) {
      shownFor.current = card;
      setView(null);
      setMessage(null);
    }
    void service.view(slug, title).then((next) => !cancelled && setView(next));
    // Liaison ou déliaison pendant que la fiche est ouverte : on recharge.
    const off = service.subscribe(() => setVersion((value) => value + 1));
    return () => {
      cancelled = true;
      off();
    };
  }, [service, slug, title, version]);

  useEffect(() => setAutoRetries(0), [slug, title]);

  // Limite de Spotify : le chargement est relancé après le délai demandé. Un chargement abouti remet le compte à zéro.
  useEffect(() => {
    if (!view) return;
    if (view.status !== 'error' || view.retryAfterMs === undefined) {
      setAutoRetries(0);
      return;
    }
    if (autoRetries >= MAX_AUTO_RETRIES) return;
    const timer = setTimeout(() => {
      setAutoRetries((count) => count + 1);
      setVersion((value) => value + 1);
    }, Math.min(view.retryAfterMs + RETRY_MARGIN_MS, MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [view, autoRetries]);

  if (!service || !view || view.status === 'none') return null;
  const retrying = view.status === 'error' && view.retryAfterMs !== undefined && autoRetries < MAX_AUTO_RETRIES;

  // La carte est retenue par le lecteur : il en offre ensuite la fiche (bouton « Carte »).
  const play = async (item: Track, listen: Listen) => setMessage(await service.play(item, listen, { slug, title }));
  const link = async () => setMessage(await service.link());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {view.status === 'unlinked' && (
        <button type="button" onClick={link} aria-label="Lier Spotify pour écouter" title="Lier Spotify pour écouter" style={{ ...iconButton, width: '100%', gap: 8, font: '600 13px system-ui, sans-serif' }}>
          <Glyph name="link" /> Spotify
        </button>
      )}
      {view.status === 'notfound' && <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>Introuvable sur Spotify.</p>}
      {view.status === 'error' && (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {view.message}
          {retrying && ' Nouvelle tentative automatique.'}
        </p>
      )}
      {view.status === 'ready' && (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 'min(160px, 25vh)', overflowY: 'auto' }}>
            {view.listen.items.map((item, index) => {
              const nowPlaying = isPlayingUri(player, item.uri);
              return (
              <li key={item.uri} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: SIZE, borderBottom: border, fontSize: 13 }}>
                {view.listen.kind !== 'track' && <span style={{ width: 18, opacity: 0.6, fontSize: 11 }}>{index + 1}</span>}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                  {view.listen.kind === 'artist' && item.artist && <span style={{ opacity: 0.6 }}> · {item.artist}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => (nowPlaying && source ? void source.toggle() : void play(item, view.listen))}
                  aria-label={`${nowPlaying ? 'Mettre en pause' : 'Lire'} ${item.title}`}
                  title={`${nowPlaying ? 'Mettre en pause' : 'Lire'} ${item.title}`}
                  style={{ ...iconButton, borderRadius: '50%', ...(nowPlaying ? { background: 'var(--color-accent, #34d399)', color: '#0d1117', borderColor: 'transparent' } : {}) }}
                >
                  <Glyph name={nowPlaying ? 'pause' : 'play'} size={16} />
                </button>
              </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => void service.unlink()} aria-label="Délier Spotify" title="Délier Spotify" style={{ ...iconButton, alignSelf: 'flex-end', opacity: 0.6 }}>
            <Glyph name="unlink" size={14} />
          </button>
        </>
      )}
      {message && <p role="status" style={{ margin: 0, fontSize: 12 }}>{message}</p>}
    </div>
  );
}

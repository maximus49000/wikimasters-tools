import { useEffect, useRef, useState } from 'react';
import { formatRating, formatVotes, posterUrl } from '../core/screen/screen-format';
import type { FilmographyItem, ScreenDetail } from '../core/screen/tmdb-api';
import { Glyph } from './Glyphs';
import { getScreenService } from './screen-registry';
import type { ScreenDetailResult, ScreenView } from './screen-service';
import { SoundtrackButton } from './SoundtrackButton';
import { TrailerPlayer } from './TrailerPlayer';

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
const STAR = '#fbbf24';

type Opened = { item: FilmographyItem; result: ScreenDetailResult | null };
type Props = { slug: string; title: string };

function Rating({ detail }: { detail: ScreenDetail }) {
  if (!detail.rating) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <span style={{ color: STAR, display: 'inline-flex' }}>
        <Glyph name="star" size={16} />
      </span>
      <b style={{ fontSize: 15 }}>{formatRating(detail.rating.average)}</b>
      <span style={{ opacity: 0.7 }}>/10 · {formatVotes(detail.rating.votes)} votes</span>
    </div>
  );
}

function Detail({ detail }: { detail: ScreenDetail }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {detail.trailerKey && <TrailerPlayer trailerKey={detail.trailerKey} />}
      <SoundtrackButton detail={detail} />
      <Rating detail={detail} />
      {detail.overview && <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, maxHeight: 'min(96px, 15vh)', overflowY: 'auto' }}>{detail.overview}</p>}
    </div>
  );
}

// Section « film, série ou filmographie » de la fiche native d'une carte de la collection ; rien pour les autres cartes.
export function ScreenSection({ slug, title }: Props) {
  const service = getScreenService();
  const [view, setView] = useState<ScreenView | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const token = useRef(0);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    setOpened(null);
    void service.view(slug, title).then((next) => !cancelled && setView(next));
    return () => {
      cancelled = true;
    };
  }, [service, slug, title]);

  if (!service || !view || view.status === 'none') return null;

  const open = (item: FilmographyItem) => {
    const mine = ++token.current;
    setOpened({ item, result: null });
    void service.detail(item.mediaType, item.id).then((result) => {
      if (mine === token.current) setOpened({ item, result });
    });
  };
  const back = () => {
    token.current += 1;
    setOpened(null);
  };

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {view.status === 'error' && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {view.message}
        </p>
      )}
      {view.status === 'detail' && <Detail detail={view.detail} />}
      {view.status === 'filmography' && (
        <>
          {opened && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button type="button" onClick={back} aria-label="Retour à la filmographie" title="Retour à la filmographie" style={iconButton}>
                  <Glyph name="back" />
                </button>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}>
                  {opened.item.title}
                  {opened.item.year && <span style={{ fontWeight: 400, opacity: 0.7 }}> {opened.item.year}</span>}
                </span>
              </div>
              {opened.result === null && (
                <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
                  Chargement…
                </p>
              )}
              {opened.result?.status === 'error' && (
                <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
                  {opened.result.message}
                </p>
              )}
              {opened.result?.status === 'detail' && <Detail detail={opened.result.detail} />}
            </>
          )}
          {/* Liste masquée (pas retirée) pendant la fiche d'un titre : le défilement est conservé au retour. */}
          <div style={{ display: opened ? 'none' : 'block' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
              <Glyph name="film" size={16} /> Filmographie <span style={{ fontWeight: 400, opacity: 0.7 }}>· {view.items.length}</span>
            </div>
            {view.items.length === 0 && <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.7 }}>Aucun titre connu.</p>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 'min(180px, 28vh)', overflowY: 'auto' }}>
              {view.items.map((item) => {
                const poster = posterUrl(item.posterPath);
                return (
                  <li key={`${item.mediaType}-${item.id}`} style={{ borderBottom: border }}>
                    <button
                      type="button"
                      onClick={() => open(item)}
                      aria-label={`Ouvrir ${item.title}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: SIZE, padding: '2px 0', cursor: 'pointer', color: 'inherit', background: 'none', border: 0, textAlign: 'left', font: '13px system-ui, sans-serif' }}
                    >
                      <span style={{ width: 26, height: 38, flex: 'none', borderRadius: 3, background: poster ? `center / cover no-repeat url(${poster})` : 'rgba(148,163,184,0.25)' }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                        {item.year && <span style={{ fontSize: 11, opacity: 0.6 }}>{item.year}</span>}
                      </span>
                      {item.rating !== undefined && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: STAR, fontSize: 12 }}>
                          <Glyph name="star" size={13} /> {formatRating(item.rating)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
      <p style={{ margin: 0, fontSize: 10, opacity: 0.6 }}>Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.</p>
    </div>
  );
}

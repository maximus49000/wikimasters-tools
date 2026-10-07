import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { EMPTY_OWNERSHIP, ownedCardOf } from '../core/collection/work-marks';
import { formatRating, formatVotes, posterUrl } from '../core/screen/screen-format';
import type { FilmographyItem, ScreenDetail } from '../core/screen/tmdb-api';
import { getCollectionMarks } from './collection-marks-registry';
import { Glyph } from './Glyphs';
import { getScreenService } from './screen-registry';
import type { ScreenDetailResult, ScreenView } from './screen-service';
import { SoundtrackButton } from './SoundtrackButton';
import { TrailerPlayer } from './TrailerPlayer';
import { WatchProviders } from './WatchProviders';
import { OwnedNotice, WorkBack, WorkList, type WorkItem } from './WorkList';

const STAR = '#fbbf24';
const noSubscribe = () => () => undefined;
const keyOf = (item: FilmographyItem): string => `${item.mediaType}-${item.id}`;

type Opened = { item: FilmographyItem; result: ScreenDetailResult | null };
// `onOpenCard` : ouvre la carte d'un film ou d'une série possédé (fournie par la fiche native qui porte la section).
type Props = { slug: string; title: string; onOpenCard?: (slug: string) => void };

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
      <SoundtrackButton soundtrackKey={`${detail.mediaType}:${detail.id}`} title={detail.title} {...(detail.originalTitle ? { originalTitle: detail.originalTitle } : {})} />
      {detail.trailerKey && <TrailerPlayer trailerKey={detail.trailerKey} />}
      {detail.watch && <WatchProviders watch={detail.watch} />}
      <Rating detail={detail} />
      {detail.overview && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, maxHeight: 'min(180px, 26vh)', overflowY: 'auto' }}>{detail.overview}</p>}
    </div>
  );
}

// Section « film, série ou filmographie » de la fiche native d'une carte de la collection ; rien pour les autres cartes.
export function ScreenSection({ slug, title, onOpenCard }: Props) {
  const service = getScreenService();
  const marks = getCollectionMarks();
  const [view, setView] = useState<ScreenView | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const token = useRef(0);
  // Les films et séries dont on possède la carte : se complète à mesure que leurs identifiants TMDB sont lus.
  const ownership = useSyncExternalStore(marks?.subscribe ?? noSubscribe, () => marks?.ownership() ?? EMPTY_OWNERSHIP);

  useEffect(() => marks?.ensure(), [marks]);

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

  // La mention JustWatch n'est due que lorsque des offres sont affichées (fiche d'un titre, ouverte ou non depuis une filmographie).
  const shown = opened?.result ?? view;
  const showsWatch = shown.status === 'detail' && shown.detail.watch !== undefined;

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

  const toWork = (item: FilmographyItem): WorkItem => {
    const poster = posterUrl(item.posterPath);
    const owned = ownedCardOf(ownership, item.mediaType, item.id);
    return {
      key: keyOf(item),
      title: item.title,
      ...(item.year ? { year: item.year } : {}),
      ...(item.rating !== undefined ? { rating: formatRating(item.rating) } : {}),
      ...(poster ? { thumbUrl: poster } : {}),
      ...(owned ? { owned } : {}),
    };
  };
  const ownedOpen = opened ? ownedCardOf(ownership, opened.item.mediaType, opened.item.id) : undefined;

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
              <WorkBack title={opened.item.title} year={opened.item.year} label="Retour à la filmographie" onBack={back} />
              {ownedOpen && <OwnedNotice card={ownedOpen} onOpenCard={onOpenCard} />}
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
          <WorkList
            glyph="film"
            label="Filmographie"
            items={view.items.map(toWork)}
            emptyText="Aucun titre connu."
            hidden={opened !== null}
            onOpen={(work) => {
              const item = view.items.find((candidate) => keyOf(candidate) === work.key);
              if (item) open(item);
            }}
            {...(onOpenCard ? { onOpenCard } : {})}
          />
        </>
      )}
      <p style={{ margin: 0, fontSize: 10, opacity: 0.6 }}>
        {showsWatch && 'Disponibilités : JustWatch · '}Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
      </p>
    </div>
  );
}

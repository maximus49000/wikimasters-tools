import { useEffect, useState, type CSSProperties } from 'react';
import type { GameDetail } from '../core/game/game-detail';
import { formatCount } from '../core/game/game-format';
import { GameChoiceDialog } from './GameChoiceDialog';
import { getGameService } from './game-registry';
import type { GameView } from './game-service';
import { Glyph } from './Glyphs';
import { HlsTrailerPlayer } from './HlsTrailerPlayer';
import { SoundtrackButton } from './SoundtrackButton';
import { TrailerPlayer } from './TrailerPlayer';

const SIZE = 44; // cible tactile
const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const iconButton: CSSProperties = { width: SIZE, height: SIZE, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
const SOURCE = { steam: { name: 'Steam', page: 'Page Steam', label: 'Ouvrir la page Steam', credit: 'Données : Steam' }, igdb: { name: 'IGDB', page: 'Fiche IGDB', label: 'Ouvrir la fiche IGDB', credit: 'Données : IGDB.com' } } as const;

function Rating({ detail }: { detail: GameDetail }) {
  const { rating, metascore } = detail;
  if (!rating && !metascore) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {rating && (
        <>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#4ade80' }}>{rating.kind === 'positive' ? `${rating.value} %` : rating.value}</span>
          <span style={{ fontSize: 12, lineHeight: '16px' }}>
            {rating.kind === 'positive' ? <b style={{ display: 'block', fontSize: 13 }}>{rating.verdict ?? 'Avis des joueurs'}</b> : <b style={{ display: 'block', fontSize: 13 }}>/100</b>}
            <span style={{ opacity: 0.7 }}>{rating.count > 0 ? `${formatCount(rating.count)} avis` : 'Note IGDB'}</span>
          </span>
        </>
      )}
      {metascore && (
        <span title="Metascore" style={{ marginLeft: 'auto', minWidth: 34, height: 26, padding: '0 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, fontWeight: 700, fontSize: 13, background: '#66cc33', color: '#0b1b00' }}>
          {metascore.score}
        </span>
      )}
    </div>
  );
}

function Facts({ detail }: { detail: GameDetail }) {
  const rows: [string, string][] = [
    ...(detail.price ? ([['Prix', detail.price]] as [string, string][]) : []),
    ...(detail.playersOnline !== undefined ? ([['En ligne', `● ${formatCount(detail.playersOnline)} joueurs`]] as [string, string][]) : []),
    ...(detail.developers.length > 0 ? ([['Studio', detail.developers.slice(0, 2).join(', ')]] as [string, string][]) : []),
    ...(detail.releaseDate ? ([['Sortie', detail.releaseDate]] as [string, string][]) : []),
    ...(detail.platforms.length > 0 ? ([['Plateformes', detail.platforms.slice(0, 4).join(' · ')]] as [string, string][]) : []),
  ];
  if (rows.length === 0) return null;
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', margin: 0, fontSize: 13 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt style={{ opacity: 0.65 }}>{label}</dt>
          <dd style={{ margin: 0 }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Detail({ detail }: { detail: GameDetail }) {
  const source = SOURCE[detail.source];
  return (
    <>
      <SoundtrackButton soundtrackKey={`game:${detail.source}:${detail.id}`} title={detail.title} {...(detail.originalTitle ? { originalTitle: detail.originalTitle } : {})} />
      {detail.trailer?.kind === 'hls' && <HlsTrailerPlayer url={detail.trailer.url} pageUrl={detail.pageUrl} {...(detail.trailer.poster ? { poster: detail.trailer.poster } : {})} />}
      {detail.trailer?.kind === 'youtube' && <TrailerPlayer trailerKey={detail.trailer.key} />}
      <Rating detail={detail} />
      {detail.genres.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {detail.genres.slice(0, 5).map((genre) => (
            <span key={genre} style={{ border, borderRadius: 999, padding: '1px 9px', fontSize: 12 }}>
              {genre}
            </span>
          ))}
        </div>
      )}
      <Facts detail={detail} />
      <a
        href={detail.pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={source.label}
        style={{ minHeight: SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border, borderRadius: 10, color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
      >
        {source.page} <Glyph name="external" size={16} />
      </a>
      <p style={{ margin: 0, fontSize: 10, opacity: 0.6 }}>
        {source.credit}
        {detail.metascore ? ' · Metascore : Metacritic' : ''}
      </p>
    </>
  );
}

type Props = { slug: string; title: string };

// Section « jeu vidéo » de la fiche native d'une carte : un jeu (Steam, sinon IGDB), ou une section vide avec le glyphe pour en choisir un ; rien pour les autres cartes.
export function GameSection({ slug, title }: Props) {
  const service = getGameService();
  const [view, setView] = useState<GameView | null>(null);
  const [version, setVersion] = useState(0);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    void service.view(slug, title).then((next) => !cancelled && setView(next));
    return () => {
      cancelled = true;
    };
  }, [service, slug, title, version]);

  if (!service || !view || view.status === 'none') return null;
  const current = view.status === 'detail' ? view.detail : null;

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Glyph name="gamepad" size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>Jeu vidéo{current ? ` · ${SOURCE[current.source].name}` : ''}</span>
        <button type="button" onClick={() => setChoosing(true)} aria-label="Changer de jeu" title="Changer de jeu" style={iconButton}>
          <Glyph name="swap" />
        </button>
      </div>
      {view.status === 'error' && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {view.message}
        </p>
      )}
      {current && <Detail detail={current} />}
      {choosing && <GameChoiceDialog service={service} slug={slug} title={title} current={current} onChanged={() => setVersion((value) => value + 1)} onClose={() => setChoosing(false)} />}
    </div>
  );
}

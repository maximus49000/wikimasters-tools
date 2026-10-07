import { useEffect, useState, type CSSProperties } from 'react';
import type { BookDetail } from '../core/book/book-detail';
import { getBookService } from './book-registry';
import type { BookView } from './book-service';
import { Glyph } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const link: CSSProperties = { color: 'inherit', fontWeight: 600 };

function Facts({ detail }: { detail: BookDetail }) {
  const published = [detail.year, detail.publisher].filter((value) => value !== undefined && value !== '').join(' · ');
  const rows: [string, string][] = [
    ...(detail.author ? ([['Auteur', detail.author]] as [string, string][]) : []),
    ...(published ? ([['Publié', published]] as [string, string][]) : []),
    ...(detail.pages !== undefined ? ([['Édition', `${detail.pages} pages`]] as [string, string][]) : []),
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

// Synopsis agrandi : 16 px sur bureau, 15 px sur mobile, encadré défilant, jamais tronqué.
function Synopsis({ synopsis }: { synopsis: NonNullable<BookDetail['synopsis']> }) {
  const wikipedia = synopsis.source === 'wikipedia';
  return (
    <>
      <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Synopsis</div>
      <p style={{ margin: 0, fontSize: 'clamp(15px, 4vw, 16px)', lineHeight: '25px', maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-line', padding: '12px 14px', border, borderRadius: 10, background: 'rgba(148,163,184,0.08)' }}>
        {synopsis.text}
      </p>
      <span style={{ fontSize: 12, opacity: 0.8 }}>
        {wikipedia ? 'Résumé Wikipédia (fr) · ' : 'Résumé Open Library · '}
        <a href={synopsis.url} target="_blank" rel="noopener noreferrer" style={link}>
          {wikipedia ? 'Lire l’article complet' : 'Voir la fiche'} <Glyph name="external" size={12} />
        </a>
      </span>
    </>
  );
}

function Detail({ detail }: { detail: BookDetail }) {
  return (
    <>
      <Facts detail={detail} />
      {detail.genres.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {detail.genres.map((genre) => (
            <span key={genre} style={{ border, borderRadius: 999, padding: '1px 9px', fontSize: 12 }}>
              {genre}
            </span>
          ))}
        </div>
      )}
      {detail.synopsis && <Synopsis synopsis={detail.synopsis} />}
      <a
        href={detail.pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ouvrir la fiche Open Library"
        style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border, borderRadius: 10, color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
      >
        Fiche Open Library <Glyph name="external" size={16} />
      </a>
      <p style={{ margin: 0, fontSize: 10, opacity: 0.6 }}>Données : Open Library, Wikipédia, Wikidata</p>
    </>
  );
}

type Props = { slug: string; title: string };

// Section « livre » de la fiche native d'une carte : un livre (Open Library), ou une fiche vide ; rien pour les autres cartes.
export function BookSection({ slug, title }: Props) {
  const service = getBookService();
  const [view, setView] = useState<BookView | null>(null);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    service
      .view(slug, title)
      .catch((): BookView => ({ status: 'error', message: 'Le livre est indisponible pour le moment.' }))
      .then((next) => !cancelled && setView(next));
    return () => {
      cancelled = true;
    };
  }, [service, slug, title]);

  if (!service || !view || view.status === 'none') return null;

  return (
    <div data-wmt-book-card="" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Glyph name="book" size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>Livre</span>
      </div>
      {view.status === 'error' && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {view.message}
        </p>
      )}
      {view.status === 'empty' && (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>Aucune fiche trouvée pour ce livre.</p>
      )}
      {view.status === 'detail' && <Detail detail={view.detail} />}
    </div>
  );
}

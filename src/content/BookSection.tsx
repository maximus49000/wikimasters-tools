import { useEffect, useState, type CSSProperties } from 'react';
import type { BookDetail } from '../core/book/book-detail';
import { getBookService } from './book-registry';
import { formatDay, formatEuro } from '../core/book/book-format';
import { paperShopLinks, type PriceLine } from '../core/book/shops';
import type { BookOffers, BookReading, BookView } from './book-service';
import { BookChoiceDialog } from './BookChoiceDialog';
import { Glyph } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const link: CSSProperties = { color: 'inherit', fontWeight: 600 };
const SIZE = 44; // cible tactile
const iconButton: CSSProperties = { width: SIZE, height: SIZE, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };

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

const REFERENCE_NOTE = 'prix neuf papier · le prix du livre est unique en France : identique chez tous les vendeurs (remise max. 5 %)';

function ShopRow({ shop }: { shop: BookOffers['shops'][number] }) {
  const fallback = shop.shop === 'libraire' ? 'chercher' : 'voir le prix';
  return (
    <a
      href={shop.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', border, borderRadius: 8, color: 'inherit', textDecoration: 'none', fontSize: 13 }}
    >
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>
        {shop.label}
        <small style={{ display: 'block', fontWeight: 400, fontSize: 11, opacity: 0.65 }}>{shop.kind === 'ebook' ? 'ebook' : 'papier'}</small>
      </span>
      <span style={{ fontWeight: shop.price ? 700 : 400, opacity: shop.price ? 1 : 0.65 }}>{shop.price ? formatEuro(shop.price.amount) : fallback}</span>
      <Glyph name="external" size={14} />
    </a>
  );
}

// « Prix en France » : les liens d'achat s'affichent aussitôt (pure logique) ; les prix s'y ajoutent quand ils sont lus (ebook Google Books,
// papier Amazon.fr). Aucun prix lu : pas de prix de référence, jamais de prix inventé.
function Prices({ detail }: { detail: BookDetail }) {
  const service = getBookService();
  const [offers, setOffers] = useState<BookOffers | null>(null);

  useEffect(() => {
    setOffers(null);
    if (!service) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => service.offers({ title: detail.title, ...(detail.author ? { author: detail.author } : {}), ...(detail.isbn ? { isbn: detail.isbn } : {}) }))
      .then((next) => !cancelled && setOffers(next))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [service, detail.id, detail.title, detail.author, detail.isbn]);

  const shops = offers?.shops ?? paperShopLinks({ title: detail.title, ...(detail.author ? { author: detail.author } : {}), ...(detail.isbn ? { isbn: detail.isbn } : {}) });
  const paperPrice: PriceLine | undefined = offers?.paperPrice;
  const readAt = Math.max(0, ...shops.map((shop) => shop.price?.readAt ?? 0));
  return (
    <div data-wmt-book-prices="" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prix en France</div>
      {paperPrice && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 12px', border, borderRadius: 10, background: 'rgba(148,163,184,0.08)' }}>
          <b style={{ fontSize: 22, color: '#4ade80' }}>{formatEuro(paperPrice.amount)}</b>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{REFERENCE_NOTE}</span>
        </div>
      )}
      {shops.map((shop) => (
        <ShopRow key={shop.shop} shop={shop} />
      ))}
      {readAt > 0 && <span style={{ fontSize: 10, opacity: 0.6 }}>Prix lus le {formatDay(readAt)} · mémorisés 7 jours</span>}
    </div>
  );
}

// « Lecture gratuite » : le texte intégral quand une source libre existe (Wikisource, Gutenberg, Internet Archive), sinon la date de passage au domaine public.
function Reading({ slug, detail }: { slug: string; detail: BookDetail }) {
  const service = getBookService();
  const [reading, setReading] = useState<BookReading | null>(null);

  useEffect(() => {
    setReading(null);
    if (!service) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => service.reading(slug, { id: detail.id, title: detail.title, ...(detail.author ? { author: detail.author } : {}) }))
      .then((next) => !cancelled && setReading(next))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [service, slug, detail.id, detail.title, detail.author]);

  if (!reading) return null;
  const [main, ...others] = reading.links;
  return (
    <div data-wmt-book-reading="" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lecture gratuite</div>
      {main ? (
        <>
          <a
            href={main.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Lire gratuitement sur ${main.label}`}
            style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border, borderRadius: 10, color: 'inherit', textDecoration: 'none', fontWeight: 700, fontSize: 14, background: 'rgba(74,222,128,0.12)' }}
          >
            Lire gratuitement <small style={{ fontWeight: 400, opacity: 0.75 }}>· {main.label}</small> <Glyph name="external" size={16} />
          </a>
          {others.map((other) => (
            <a key={other.source} href={other.url} target="_blank" rel="noopener noreferrer" style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', border, borderRadius: 8, color: 'inherit', textDecoration: 'none', fontSize: 13 }}>
              <span style={{ flex: 1 }}>Aussi sur {other.label}</span>
              <Glyph name="external" size={14} />
            </a>
          ))}
        </>
      ) : (
        <p style={{ margin: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', border, borderRadius: 8, fontSize: 13, opacity: 0.75 }}>
          {reading.complete
            ? reading.protectedUntil !== undefined
              ? `Pas de texte libre · protégé jusqu’en ${reading.protectedUntil}`
              : 'Pas de texte libre'
            : 'Les sources de lecture libre sont indisponibles pour le moment.'}
        </p>
      )}
    </div>
  );
}

function Detail({ slug, detail }: { slug: string; detail: BookDetail }) {
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
      <Prices detail={detail} />
      <Reading slug={slug} detail={detail} />
      <a
        href={detail.pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ouvrir la fiche Open Library"
        style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border, borderRadius: 10, color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
      >
        Fiche Open Library <Glyph name="external" size={16} />
      </a>
      <p style={{ margin: 0, fontSize: 10, opacity: 0.6 }}>Données : Open Library, Wikipédia, Wikidata, Google Books, Wikisource, Internet Archive, Projet Gutenberg</p>
    </>
  );
}

type Props = { slug: string; title: string };

// Section « livre » de la fiche native d'une carte : un livre (Open Library), ou une fiche vide avec le glyphe pour en choisir un ; rien pour les autres cartes.
export function BookSection({ slug, title }: Props) {
  const service = getBookService();
  const [view, setView] = useState<BookView | null>(null);
  const [version, setVersion] = useState(0);
  const [choosing, setChoosing] = useState(false);

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
  }, [service, slug, title, version]);

  if (!service || !view || view.status === 'none') return null;
  const current = view.status === 'detail' ? view.detail : null;

  return (
    <div data-wmt-book-card="" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Glyph name="book" size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>Livre</span>
        <button type="button" data-wmt-book-switch="" onClick={() => setChoosing(true)} aria-label="Changer de livre" title="Changer de livre" style={iconButton}>
          <Glyph name="swap" />
        </button>
      </div>
      {view.status === 'error' && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {view.message}
        </p>
      )}
      {view.status === 'empty' && <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{view.none ? 'Aucun livre pour cette carte.' : 'Aucune fiche trouvée pour ce livre.'}</p>}
      {current && <Detail slug={slug} detail={current} />}
      {choosing && (
        <BookChoiceDialog service={service} slug={slug} title={title} currentId={current?.id ?? null} onChanged={() => setVersion((value) => value + 1)} onClose={() => setChoosing(false)} />
      )}
    </div>
  );
}

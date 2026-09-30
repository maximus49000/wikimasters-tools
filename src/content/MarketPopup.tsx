import { useEffect, useState, type CSSProperties } from 'react';
import { formatAge, formatRemaining } from '../core/market/format';
import { summarize, type CardMarket } from '../core/market/market-book';
import type { MarketRepo } from '../core/market/market-repo';

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(0, 0, 0, 0.65)',
  font: '400 14px/20px system-ui, sans-serif',
};

const panel: CSSProperties = {
  width: '100%',
  maxWidth: 440,
  maxHeight: '85vh',
  overflowY: 'auto',
  padding: 16,
  borderRadius: 12,
  background: '#0d1117',
  color: '#e6edf3',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
};

const muted: CSSProperties = { color: '#9aa7b4', fontSize: 12 };

function OfferList({ card, now }: { card: CardMarket; now: number }) {
  const summary = summarize(card, now);
  if (!summary) {
    return (
      <p style={muted}>
        Aucune offre active connue (dernière observation {formatAge(now - card.seenAt)}).
      </p>
    );
  }
  const offers = [...card.offers].sort((a, b) => a.endAt - b.endAt);
  return (
    <>
      <p style={{ margin: '4px 0' }}>
        <strong>{summary.offerCount}</strong> {summary.offerCount === 1 ? 'offre' : 'offres'} ·{' '}
        <strong>{summary.bidCount}</strong> avec mise · moyenne <strong>{summary.avgPrice} WB</strong> ·
        dès {summary.minPrice} WB
      </p>
      <p style={{ ...muted, margin: '0 0 6px' }}>Observé {formatAge(now - summary.seenAt)}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {offers.map((offer) => (
          <li
            key={offer.id}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0' }}
          >
            <span>{offer.price} WB</span>
            <span style={muted}>
              {offer.hasBid ? 'avec mise' : 'sans mise'} · fin dans {formatRemaining(offer.endAt - now)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function MarketPopup({
  slug,
  repo,
  onClose,
}: {
  slug: string;
  repo: MarketRepo;
  onClose: () => void;
}) {
  const [cards, setCards] = useState<CardMarket[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    repo
      .lookup(slug)
      .then((found) => !cancelled && setCards(found))
      .catch(() => !cancelled && setCards([]));
    return () => {
      cancelled = true;
    };
  }, [repo, slug]);

  const now = Date.now();
  const title = cards?.[0]?.title ?? slug.replace(/_/g, ' ');

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-label={`Marché : ${title}`} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 16 }}>Marché · {title}</strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', fontSize: 18 }}
          >
            ×
          </button>
        </div>

        {cards === null && <p style={muted}>Chargement…</p>}
        {cards?.length === 0 && (
          <p>
            Cette carte n&apos;a jamais été vue sur le marché. Ouvrez la page Marché : l&apos;extension
            mémorise les enchères que le site charge.
          </p>
        )}
        {cards?.map((card) => (
          <section key={card.cardId + String(card.isShiny)} style={{ marginTop: 12 }}>
            {(cards.length > 1 || card.isShiny) && (
              <strong>{card.isShiny ? '✨ Shiny' : 'Normale'} · {card.rarity}</strong>
            )}
            <OfferList card={card} now={now} />
          </section>
        ))}

        <p style={{ ...muted, marginTop: 12, marginBottom: 0 }}>
          Échantillon : seules les enchères chargées sur la page Marché sont vues. Calcul local, outil
          non officiel.
        </p>
      </div>
    </div>
  );
}

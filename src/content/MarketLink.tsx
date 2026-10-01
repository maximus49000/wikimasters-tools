import { useEffect, useState } from 'react';
import type { HistoryRepo } from '../core/market/history-repo';
import type { CardHistory } from '../core/market/price-history';
import { PriceChart } from './PriceChart';

// Reprend le gabarit du lien « Voir l'article sur Wikipédia » voisin (text-sm, font-medium,
// couleur d'accent du site). Les variables CSS traversent le shadow DOM.
export function MarketLink({
  onOpen,
  history,
  slug,
}: {
  onOpen: () => void;
  history: HistoryRepo;
  slug: string;
}) {
  const [hover, setHover] = useState(false);
  const [past, setPast] = useState<CardHistory[]>([]);

  useEffect(() => {
    const load = () => history.lookup(slug).then(setPast, () => setPast([]));
    void load();
    return history.subscribe(() => void load());
  }, [history, slug]);

  const withData = past.filter((card) => card.samples.length > 0);
  return (
    <div>
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        padding: 0,
        margin: 0,
        border: 0,
        background: 'none',
        cursor: 'pointer',
        font: '500 14px/20px system-ui, sans-serif',
        fontFamily: 'inherit',
        color: hover
          ? 'var(--color-accent-light, #6ee7b7)'
          : 'var(--color-accent, #34d399)',
        transition: 'color 150ms',
      }}
    >
      Voir l&apos;article sur le marché →
    </button>
    {withData.map((card, index) => (
      <PriceChart
        key={`${card.rarity}-${index}`}
        card={card}
        title={withData.length > 1 ? (card.isShiny ? '✨ Shiny' : 'Normale') : undefined}
      />
    ))}
    </div>
  );
}

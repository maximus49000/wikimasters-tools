import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatAge, formatRemaining } from '../core/market/format';
import { slugToTitle, summarize, type CardMarket } from '../core/market/market-book';
import type { MarketRepo } from '../core/market/market-repo';
import type { HistoryRepo } from '../core/market/history-repo';
import { hourRows, trendOf, weekAverage, type CardHistory } from '../core/market/price-history';
import type { StartSearchOutcome } from './market-search-flow';

type Phase = 'idle' | 'searching' | 'done' | 'timeout' | 'no-controls';

const NO_RESPONSE_MS = 12_000;

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

const returnButton: CSSProperties = {
  display: 'inline-flex',
  margin: '0 0 8px',
  padding: 0,
  border: 0,
  background: 'none',
  cursor: 'pointer',
  font: '500 13px/18px system-ui, sans-serif',
  fontFamily: 'inherit',
  color: 'var(--color-accent, #34d399)',
};

const searchButton: CSSProperties = {
  marginTop: 12,
  padding: '6px 12px',
  border: 0,
  borderRadius: 8,
  cursor: 'pointer',
  font: '600 13px/18px system-ui, sans-serif',
  fontFamily: 'inherit',
  background: 'var(--color-accent, #34d399)',
  color: 'var(--color-accent-foreground, #0d1117)',
};

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

function HistorySection({ card, now }: { card: CardHistory; now: number }) {
  const average = weekAverage(card, now);
  const trend = trendOf(card);
  const rows = hourRows(card);
  if (average === null && rows.length === 0) return null;
  const cell: CSSProperties = { padding: '2px 6px', textAlign: 'right' };
  return (
    <div style={{ marginTop: 8 }}>
      {average !== null && (
        <p style={{ margin: '4px 0' }}>
          Moyenne des enchères avec mise (7 j) : <strong>{average} WB</strong>
          {trend && (
            <span style={{ color: trend === 'up' ? '#22c55e' : '#ef4444', marginLeft: 4 }}>
              {trend === 'up' ? '▲' : '▼'}
            </span>
          )}
        </p>
      )}
      {rows.length > 0 && (
        <table style={{ ...muted, borderCollapse: 'collapse', width: '100%' }}>
          <caption style={{ textAlign: 'left', paddingBottom: 2 }}>Par heure restante (cumul des relevés)</caption>
          <thead>
            <tr>
              {['Reste', 'Nb', 'Min', 'Moy.', 'Max'].map((head) => (
                <th key={head} style={{ ...cell, fontWeight: 600 }}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.hour}>
                <td style={cell}>{row.hour} h</td>
                <td style={cell}>{row.n}</td>
                <td style={cell}>{row.min}</td>
                <td style={cell}>{row.avg}</td>
                <td style={cell}>{row.max}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SearchStatus({ phase, hasOffers }: { phase: Phase; hasOffers: boolean }) {
  if (phase === 'searching') return <p style={muted}>Recherche en cours sur le marché…</p>;
  if (phase === 'no-controls') {
    return (
      <p style={{ ...muted, color: '#f0b429' }}>
        Le champ de recherche du site est introuvable (la page a peut-être changé).
      </p>
    );
  }
  if (phase === 'timeout') {
    return (
      <p style={{ ...muted, color: '#f0b429' }}>
        Recherche lancée, mais aucune réponse observée. Elle n&apos;est peut-être pas passée par l&apos;API
        que l&apos;extension écoute.
      </p>
    );
  }
  if (phase === 'done' && !hasOffers) {
    return (
      <p style={muted}>
        Aucune offre trouvée pour cette carte parmi les résultats chargés. Le site en affiche 50 à la
        fois : elle peut figurer plus loin.
      </p>
    );
  }
  return null;
}

export function MarketPopup({
  slug,
  repo,
  history,
  search,
  autoStart,
  canReturn,
  onReturn,
  onClose,
}: {
  slug: string;
  repo: MarketRepo;
  history: HistoryRepo;
  search: (slug: string) => Promise<StartSearchOutcome>;
  autoStart: boolean;
  canReturn: boolean;
  onReturn: () => void;
  onClose: () => void;
}) {
  const [cards, setCards] = useState<CardMarket[] | null>(null);
  const [past, setPast] = useState<CardHistory[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const searching = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const reload = useCallback(() => {
    repo
      .lookup(slug)
      .then(setCards)
      .catch(() => setCards([]));
  }, [repo, slug]);

  useEffect(() => {
    const loadPast = () => history.lookup(slug).then(setPast, () => setPast([]));
    void loadPast();
    return history.subscribe(() => void loadPast());
  }, [history, slug]);

  useEffect(() => {
    reload();
    return repo.subscribe(() => {
      reload();
      if (searching.current) {
        searching.current = false;
        window.clearTimeout(timer.current);
        setPhase('done');
      }
    });
  }, [repo, reload]);

  const startSearch = useCallback(async () => {
    searching.current = true;
    window.clearTimeout(timer.current);
    setPhase('searching');
    const outcome = await search(slug);
    if (outcome === 'no-controls') {
      searching.current = false;
      setPhase('no-controls');
    } else if (outcome === 'started') {
      timer.current = window.setTimeout(() => {
        if (!searching.current) return;
        searching.current = false;
        setPhase('timeout');
      }, NO_RESPONSE_MS);
    }
    // 'navigating' : la page se recharge, le popup sera rouvert de l'autre côté.
  }, [search, slug]);

  useEffect(() => {
    if (autoStart) void startSearch();
    return () => window.clearTimeout(timer.current);
    // Lancement unique à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = Date.now();
  const title = cards?.[0]?.title ?? slugToTitle(slug);
  const hasOffers = cards?.some((card) => summarize(card, now) !== null) ?? false;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-label={`Marché : ${title}`} onClick={(e) => e.stopPropagation()}>
        {canReturn && (
          <button type="button" onClick={onReturn} style={returnButton}>
            ← Retour à la carte
          </button>
        )}
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
        {cards?.length === 0 && phase === 'idle' && (
          <p>
            Cette carte n&apos;a jamais été vue sur le marché. Lancez une recherche ci-dessous, ou ouvrez
            la page Marché : l&apos;extension mémorise les enchères que le site charge.
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

        {past.map((card, index) => (
          <section key={`${card.rarity}-${index}`} style={{ marginTop: 12 }}>
            <strong>Historique · {card.rarity}</strong>
            <HistorySection card={card} now={now} />
          </section>
        ))}

        <SearchStatus phase={phase} hasOffers={hasOffers} />
        <button
          type="button"
          style={{ ...searchButton, opacity: phase === 'searching' ? 0.5 : 1 }}
          disabled={phase === 'searching'}
          onClick={() => void startSearch()}
        >
          {phase === 'searching' ? 'Recherche en cours…' : 'Rechercher sur le marché'}
        </button>

        <p style={{ ...muted, marginTop: 12, marginBottom: 0 }}>
          Échantillon : seules les enchères chargées sur la page Marché sont vues. Calcul local, outil
          non officiel.
        </p>
      </div>
    </div>
  );
}

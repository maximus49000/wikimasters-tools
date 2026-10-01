import { useEffect, useState, type CSSProperties } from 'react';
import type { MarketCollector, Target } from '../core/market/market-poll';
import { refreshLabel } from './refresh-button';

type Props = {
  collector: Pick<MarketCollector, 'force' | 'forceProgress' | 'subscribe' | 'tick'>;
  // Les cartes affichées au moment du clic.
  getTargets: () => Target[];
};

const wrap: CSSProperties = { display: 'flex', justifyContent: 'center', padding: '16px 0' };

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.45)',
  background: 'rgba(22, 27, 34, 0.9)',
  color: '#e6edf3',
  font: '500 14px/20px system-ui, sans-serif',
  fontFamily: 'inherit',
};

const SPIN = '@keyframes wmt-refresh-spin { to { transform: rotate(360deg); } }';

function Icon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={spinning ? { animation: 'wmt-refresh-spin 0.9s linear infinite' } : undefined}
    >
      {spinning ? (
        <path d="M12 3a9 9 0 0 1 9 9" />
      ) : (
        <>
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 4v7h-7" />
        </>
      )}
    </svg>
  );
}

export function RefreshButton({ collector, getTargets }: Props) {
  const [progress, setProgress] = useState({ remaining: 0, total: 0 });

  useEffect(() => {
    const load = () => collector.forceProgress().then(setProgress, () => undefined);
    void load();
    return collector.subscribe(() => void load());
  }, [collector]);

  const { text, busy } = refreshLabel(progress);

  function onClick(): void {
    const targets = getTargets();
    if (busy || targets.length === 0) return;
    void collector
      .force(targets)
      .then(() => collector.tick())
      .catch((error) => console.warn('[wikimasters-tools]', 'rechargement du marché :', error));
  }

  return (
    <div style={wrap}>
      <style>{SPIN}</style>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
        title="Relit tout de suite le prix du marché des cartes affichées sur cette page. Outil non officiel."
        style={{ ...base, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
      >
        <Icon spinning={busy} />
        {text}
      </button>
    </div>
  );
}

import { useEffect, useState, type CSSProperties } from 'react';
import type { ForceView, MarketCollector, Target } from '../core/market/market-poll';
import { refreshLabel } from './refresh-button';

export type CollectionView = ForceView & { targets: Target[] };

type Props = {
  collector: Pick<MarketCollector, 'force' | 'forceStatus' | 'subscribe' | 'tick'>;
  // La page, le filtre actif et les cartes affichées au moment voulu.
  getView: () => CollectionView;
  // Met simplement à jour le contenu des cartes (sans nouvelle requête).
  onUpdate: () => void;
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

export function RefreshButton({ collector, getView, onUpdate }: Props) {
  const [status, setStatus] = useState({ remaining: 0, total: 0, queued: false });

  useEffect(() => {
    const load = () => {
      const view = getView();
      void collector.forceStatus({ filter: view.filter, page: view.page }).then(setStatus, () => undefined);
    };
    load();
    // La page ou le filtre peuvent changer sans événement du collecteur : on relit régulièrement.
    const timer = window.setInterval(load, 1000);
    const unsubscribe = collector.subscribe(load);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [collector, getView]);

  const { text, state } = refreshLabel(status);

  function onClick(): void {
    const view = getView();
    if (view.targets.length === 0) return;
    void collector
      .force(view.targets, { filter: view.filter, page: view.page })
      .then((outcome) => {
        // Déjà en tête : aucune requête de plus, on met juste à jour le contenu des cartes.
        if (outcome === 'running') onUpdate();
        else return collector.tick();
        return undefined;
      })
      .catch((error) => console.warn('[wikimasters-tools]', 'rechargement du marché :', error));
  }

  return (
    <div style={wrap}>
      <style>{SPIN}</style>
      <button
        type="button"
        onClick={onClick}
        aria-busy={state === 'running'}
        title="Relit tout de suite le prix du marché des cartes affichées sur cette page (selon le filtre actif). Outil non officiel."
        style={{ ...base, opacity: state === 'running' ? 0.75 : 1, cursor: 'pointer' }}
      >
        <Icon spinning={state === 'running'} />
        {text}
      </button>
    </div>
  );
}

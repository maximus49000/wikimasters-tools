import { useSyncExternalStore } from 'react';
import type { PurchaseAds } from '../core/ads/purchase-ads';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const choice = (selected: boolean) =>
  ({
    flex: 1,
    minHeight: 44,
    cursor: 'pointer',
    font: '600 14px system-ui, sans-serif',
    color: selected ? '#0d1117' : 'inherit',
    background: selected ? 'var(--color-accent, #34d399)' : 'none',
    border: selected ? '1px solid transparent' : border,
    borderRadius: 8,
  }) as const;

// « Publicité d'achat » : afficher ou masquer les offres payantes du site (WikiBidous, WikiMasters PRO).
export function PurchaseAdsSettings({ ads, onClose }: { ads: PurchaseAds; onClose: () => void }) {
  const enabled = useSyncExternalStore(ads.subscribe, ads.enabled);
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Publicité d’achat"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(360px, 100%)', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Publicité d’achat</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <p style={{ margin: '0 0 12px', opacity: 0.8 }}>
          Activé : les propositions d’achat en argent réel du site (boutique WikiBidous, abonnement WikiMasters PRO, bouton et onglet PRO « Marché ») sont affichées. Désactivé : elles sont masquées partout, et la pastille du solde n’ouvre plus la boutique.
        </p>
        <div role="group" aria-label="Publicité d’achat" style={{ display: 'flex', gap: 8 }}>
          <button type="button" aria-pressed={enabled} onClick={() => ads.setEnabled(true)} style={choice(enabled)}>
            Activé
          </button>
          <button type="button" aria-pressed={!enabled} onClick={() => ads.setEnabled(false)} style={choice(!enabled)}>
            Désactivé
          </button>
        </div>
      </div>
    </div>
  );
}

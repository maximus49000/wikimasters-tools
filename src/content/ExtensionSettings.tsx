import { useState } from 'react';
import type { ImageService } from '../core/images/image-service';
import { ImageSettings } from './ImageSettings';
import type { PurchaseAds } from '../core/ads/purchase-ads';
import { PlayerSettings } from './PlayerSettings';
import { PurchaseAdsSettings } from './PurchaseAdsSettings';
import type { PlayerSource } from './player-source';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const row = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, padding: '0 8px', cursor: 'pointer', color: 'inherit', background: 'none', border: 'none', borderBottom: border, font: '14px system-ui, sans-serif', textAlign: 'left' } as const;

// « Paramètre d'extension » : une liste style Paramètres. Chaque ligne ouvre le réglage existant ; sa fermeture ramène à la liste.
export function ExtensionSettings({ images, player, ads, onClose }: { images: ImageService; player: PlayerSource | null; ads: PurchaseAds; onClose: () => void }) {
  const [view, setView] = useState<'list' | 'images' | 'player' | 'ads'>('list');
  if (view === 'images') return <ImageSettings images={images} onClose={() => setView('list')} />;
  if (view === 'ads') return <PurchaseAdsSettings ads={ads} onClose={() => setView('list')} />;
  if (view === 'player' && player) return <PlayerSettings source={player} onClose={() => setView('list')} />;
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Paramètre d’extension"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(400px, 100%)', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Paramètre d’extension</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <button type="button" data-wmt-ext-row="images" onClick={() => setView('images')} style={row}>
          <span aria-hidden="true">🖼</span>
          <span>Images</span>
          <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>›</span>
        </button>
        <button type="button" data-wmt-ext-row="ads" onClick={() => setView('ads')} style={row}>
          <span aria-hidden="true">🛒</span>
          <span>Publicité d’achat</span>
          <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>›</span>
        </button>
        {player && (
          <button type="button" data-wmt-ext-row="player" onClick={() => setView('player')} style={row}>
            <span aria-hidden="true">▶</span>
            <span>Lecteur</span>
            <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>›</span>
          </button>
        )}
      </div>
    </div>
  );
}

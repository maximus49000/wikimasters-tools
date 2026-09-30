import type { CSSProperties } from 'react';
import type { BadgeModel } from '../core/pricing/badge';

const base: CSSProperties = {
  font: '600 12px/1.3 system-ui, sans-serif',
  padding: '4px 8px',
  margin: '6px 8px',
  borderRadius: 8,
  background: 'rgba(16, 24, 20, 0.88)',
  color: '#e6f4ec',
  border: '1px solid rgba(52, 211, 153, 0.6)',
};

const low: CSSProperties = {
  border: '1px dashed rgba(148, 163, 184, 0.7)',
  color: '#cbd5e1',
};

export function PriceBadge({ model }: { model: BadgeModel }) {
  return (
    <div title={model.tooltip} style={model.tone === 'low' ? { ...base, ...low } : base}>
      <strong>{model.label}</strong>
      <span style={{ fontWeight: 400, opacity: 0.85 }}> {model.detail}</span>
    </div>
  );
}

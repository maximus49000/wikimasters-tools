import type { CSSProperties } from 'react';
import type { PurchaseModel } from '../core/pricing/badge';

// Même gabarit que la pastille de rareté du site, en vert.
const chip: CSSProperties = {
  font: '700 12px/16px system-ui, sans-serif',
  // Après le raccourci `font` : reprend la police de la page hôte.
  fontFamily: 'inherit',
  padding: '2px 8px',
  borderRadius: 6,
  background: 'rgb(34, 197, 94)',
  color: 'rgb(13, 17, 23)',
  boxShadow: '0 0 10px rgba(34, 197, 94, 0.6)',
  textAlign: 'center',
};

export function PurchaseBadge({ model }: { model: PurchaseModel }) {
  return (
    <div title={model.tooltip} style={chip}>
      <div>$</div>
      <div>{model.label}</div>
    </div>
  );
}

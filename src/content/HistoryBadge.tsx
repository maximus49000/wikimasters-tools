import type { CSSProperties } from 'react';
import type { HistoryBadgeModel } from '../core/market/history-badge';

const chip: CSSProperties = {
  font: '700 12px/16px system-ui, sans-serif',
  fontFamily: 'inherit',
  padding: '2px 8px',
  borderRadius: 6,
  background: 'rgba(13, 17, 23, 0.85)',
  color: '#e6edf3',
  border: '1px solid rgba(148, 163, 184, 0.45)',
  whiteSpace: 'nowrap',
};

const ARROW = {
  up: { glyph: '▲', color: 'rgb(34, 197, 94)' },
  down: { glyph: '▼', color: 'rgb(239, 68, 68)' },
  flat: { glyph: '=', color: 'rgb(148, 163, 184)' },
} as const;

// Valeur ancienne ou inconnue : discrète, pour ne pas se confondre avec une moyenne récente.
const MUTED = '#9aa7b4';

export function HistoryBadge({ model }: { model: HistoryBadgeModel }) {
  const arrow = model.trend ? ARROW[model.trend] : null;
  const muted = model.kind !== 'average';
  return (
    <div title={model.tooltip} style={muted ? { ...chip, color: MUTED, fontStyle: model.kind === 'unknown' ? 'normal' : 'italic' } : chip}>
      {model.label}
      {arrow && <span style={{ color: arrow.color, marginLeft: 4 }}>{arrow.glyph}</span>}
    </div>
  );
}

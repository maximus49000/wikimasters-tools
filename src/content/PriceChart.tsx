import type { CSSProperties } from 'react';
import { buildChart } from '../core/market/chart-model';
import type { CardHistory } from '../core/market/price-history';

const BOX = { width: 320, height: 120, padX: 8, padY: 10 };
const COLORS = { max: '#f59e0b', avg: '#34d399', min: '#38bdf8' };

const muted: CSSProperties = { color: '#9aa7b4', fontSize: 12, lineHeight: '16px' };

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 12 }}>
      <span style={{ width: 10, height: 3, borderRadius: 2, background: color }} />
      {label} <strong style={{ fontWeight: 600 }}>{value.toLocaleString('fr-FR')}</strong>
    </span>
  );
}

// Évolution des enchères misées : maximum, moyenne et minimum à chaque relevé (7 derniers jours).
export function PriceChart({ card, title }: { card: CardHistory; title?: string }) {
  const model = buildChart(card.samples, BOX);
  if (!model) return null;

  return (
    <div style={{ marginTop: 8, font: '400 13px/18px system-ui, sans-serif', fontFamily: 'inherit' }}>
      {title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>}
      <div style={{ ...muted, marginBottom: 2 }}>Enchères misées · 7 derniers jours</div>
      <div style={{ marginBottom: 4 }}>
        <Legend color={COLORS.max} label="Max" value={model.last.max} />
        <Legend color={COLORS.avg} label="Moy." value={model.last.avg} />
        <Legend color={COLORS.min} label="Min" value={model.last.min} />
      </div>
      {card.samples.length < 2 ? (
        <div style={muted}>Un seul relevé pour l&apos;instant : la courbe apparaît au suivant (30 min).</div>
      ) : (
        <svg
          viewBox={`0 0 ${BOX.width} ${BOX.height}`}
          width="100%"
          role="img"
          aria-label="Évolution du prix maximum, moyen et minimum des enchères misées"
          style={{ display: 'block', maxWidth: 360 }}
        >
          <line x1={BOX.padX} x2={BOX.width - BOX.padX} y1={BOX.height - 1} y2={BOX.height - 1} stroke="rgba(148,163,184,0.35)" />
          <text x={BOX.padX} y={BOX.padY + 2} fill="#9aa7b4" fontSize="11">
            {model.yMax.toLocaleString('fr-FR')}
          </text>
          <text x={BOX.padX} y={BOX.height - 4} fill="#9aa7b4" fontSize="11">
            {model.yMin.toLocaleString('fr-FR')}
          </text>
          {(['max', 'avg', 'min'] as const).map((key) => (
            <path
              key={key}
              d={model[key]}
              fill="none"
              stroke={COLORS[key]}
              strokeWidth={key === 'avg' ? 2 : 1.5}
              strokeDasharray={key === 'avg' ? undefined : '4 3'}
              strokeLinejoin="round"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

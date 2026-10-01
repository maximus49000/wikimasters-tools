import { useState, type CSSProperties } from 'react';
import { buildChart, type ChartModel } from '../core/market/chart-model';
import { seriesFor, type CardHistory, type ChartView } from '../core/market/price-history';

const BOX = { width: 320, height: 150, left: 46, right: 10, top: 8, bottom: 22 };
const GRID = 'rgba(148,163,184,0.22)';
const COLORS = { max: '#f59e0b', avg: '#34d399', min: '#38bdf8' };

const VIEWS: { id: ChartView; label: string; range: string }[] = [
  { id: 'hour', label: 'Heure', range: '6 dernières heures' },
  { id: 'day', label: 'Jour', range: '24 dernières heures' },
  { id: 'week', label: 'Semaine', range: '7 derniers jours' },
  { id: 'month', label: 'Mois', range: '30 derniers jours' },
  { id: 'year', label: 'Année', range: '12 derniers mois' },
];

const muted: CSSProperties = { color: '#9aa7b4', fontSize: 12, lineHeight: '16px' };

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 12 }}>
      <span style={{ width: 10, height: 3, borderRadius: 2, background: color }} />
      {label} <strong style={{ fontWeight: 600 }}>{value.toLocaleString('fr-FR')}</strong>
    </span>
  );
}

function Chart({ model }: { model: ChartModel }) {
  return (
    <svg
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      width="100%"
      role="img"
      aria-label="Évolution du prix maximum, moyen et minimum des enchères misées"
      style={{ display: 'block', maxWidth: 360 }}
    >
      {model.yTicks.map((tick) => (
        <g key={tick.value}>
          <line x1={BOX.left} x2={BOX.width - BOX.right} y1={tick.y} y2={tick.y} stroke={GRID} />
          <text x={BOX.left - 5} y={tick.y + 4} fill="#9aa7b4" fontSize="11" textAnchor="end">
            {tick.value.toLocaleString('fr-FR')}
          </text>
        </g>
      ))}
      <line x1={BOX.left} x2={BOX.left} y1={BOX.top} y2={BOX.height - BOX.bottom} stroke="rgba(148,163,184,0.45)" />
      {model.xTicks.map((tick, i) => (
        <text
          key={i}
          x={tick.x}
          y={BOX.height - 6}
          fill="#9aa7b4"
          fontSize="11"
          textAnchor={i === 0 ? 'start' : i === model.xTicks.length - 1 ? 'end' : 'middle'}
        >
          {tick.label}
        </text>
      ))}
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
  );
}

// Évolution des enchères misées (max, moyenne, min), au choix par jour, semaine, mois ou année.
export function PriceChart({ card, title }: { card: CardHistory; title?: string }) {
  const [view, setView] = useState<ChartView>('week');
  const now = Date.now();
  const series = seriesFor(card, view, now);
  const model = buildChart(series, BOX, now);
  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <div style={{ marginTop: 8, font: '400 13px/18px system-ui, sans-serif', fontFamily: 'inherit' }}>
      {title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>}
      <div style={{ display: 'flex', gap: 4, margin: '0 0 4px' }} role="group" aria-label="Période du graphique">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={v.id === view}
            onClick={() => setView(v.id)}
            style={{
              padding: '2px 8px',
              borderRadius: 6,
              cursor: 'pointer',
              font: '500 12px/16px system-ui, sans-serif',
              fontFamily: 'inherit',
              border: '1px solid rgba(148,163,184,0.45)',
              background: v.id === view ? COLORS.avg : 'transparent',
              color: v.id === view ? '#0d1117' : 'inherit',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div style={{ ...muted, marginBottom: 2 }}>Enchères misées · {current.range}</div>
      {!model ? (
        <div style={muted}>Pas encore de relevé sur cette période.</div>
      ) : (
        <>
          <div style={{ marginBottom: 4 }}>
            <Legend color={COLORS.max} label="Max" value={model.last.max} />
            <Legend color={COLORS.avg} label="Moy." value={model.last.avg} />
            <Legend color={COLORS.min} label="Min" value={model.last.min} />
          </div>
          {series.length < 2 ? (
            <div style={muted}>Un seul point sur cette période : la courbe apparaît au suivant.</div>
          ) : (
            <Chart model={model} />
          )}
        </>
      )}
    </div>
  );
}

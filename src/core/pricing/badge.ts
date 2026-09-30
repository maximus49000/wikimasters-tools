import type { PriceStats } from './stats';

export type BadgeModel = {
  label: string;
  detail: string;
  tone: 'ok' | 'low';
  tooltip: string;
};

const TREND_ARROW = { up: '▲', down: '▼' } as const;

function plural(count: number): string {
  return `${count} ${count === 1 ? 'transaction' : 'transactions'}`;
}

export function toBadgeModel(stats: PriceStats): BadgeModel | null {
  if (stats.reliability === 'none' || stats.median === null) return null;

  const label = `${stats.median} WB`;
  const tooltip =
    `Médiane de vos ${plural(stats.count)} (ventes et achats) sur cette carte. ` +
    'Calcul local, outil non officiel.';

  if (stats.reliability === 'low') {
    return { label, detail: `${plural(stats.count)} · peu de données`, tone: 'low', tooltip };
  }

  const arrow = stats.trend === 'up' || stats.trend === 'down' ? ` ${TREND_ARROW[stats.trend]}` : '';
  return {
    label,
    detail: `${stats.min}–${stats.max} · ${plural(stats.count)}${arrow}`,
    tone: 'ok',
    tooltip,
  };
}

export type PurchaseModel = {
  label: string;
  tooltip: string;
};

export function toPurchaseModel(purchase: { min: number; max: number } | null): PurchaseModel | null {
  if (!purchase) return null;
  const { min, max } = purchase;
  const same = min === max;
  return {
    label: same ? String(min) : `${min}–${max}`,
    tooltip:
      (same ? `Acheté ${min} WB.` : `Acheté entre ${min} et ${max} WB.`) +
      ' Calcul local, outil non officiel.',
  };
}

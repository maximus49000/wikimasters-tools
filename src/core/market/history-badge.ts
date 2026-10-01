import { trendOf, weekAverage, type CardHistory } from './price-history';

export type HistoryBadgeModel = {
  label: string;
  trend: 'up' | 'down' | 'flat' | null;
  rarity: string;
  tooltip: string;
};

// Une carte normale et sa variante shiny ne se distinguent pas sur la page : en cas d'ambiguïté, rien.
export function toHistoryBadge(cards: CardHistory[], now: number): HistoryBadgeModel | null {
  const known = cards.filter((card) => weekAverage(card, now) !== null);
  const [card] = known;
  if (known.length !== 1 || !card) return null;

  const avg = weekAverage(card, now)!;
  const trend = trendOf(card);
  const move = trend === 'up' ? ' Dernier relevé : en hausse.' : trend === 'down' ? ' Dernier relevé : en baisse.' : trend === 'flat' ? ' Dernier relevé : stable.' : '';
  return {
    label: `≈ ${avg.toLocaleString('fr-FR')}`,
    trend,
    rarity: card.rarity,
    tooltip:
      `Moyenne des enchères avec mise relevées ces 7 derniers jours (relevé toutes les 30 min).${move} ` +
      'Calcul local, outil non officiel.',
  };
}

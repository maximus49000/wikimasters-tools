import { formatAge } from './format';
import { lastKnown, trendOf, weekAverage, type CardHistory } from './price-history';

export type HistoryBadgeModel = {
  // average : moyenne des 7 derniers jours ; stale : dernière valeur connue (plus ancienne) ;
  // unknown : aucune enchère observée.
  kind: 'average' | 'stale' | 'unknown';
  label: string;
  trend: 'up' | 'down' | 'flat' | null;
  rarity: string | null;
  tooltip: string;
};

const NOTE = ' Calcul local, outil non officiel.';

// `owned` : la carte est dans la Collection, elle affiche sa case même sans donnée (« ??? »).
// Une carte normale et sa variante shiny ne se distinguent pas sur la page : en cas d'ambiguïté, rien.
export function toHistoryBadge(cards: CardHistory[], now: number, owned = false): HistoryBadgeModel | null {
  const withAverage = cards.filter((card) => weekAverage(card, now) !== null);
  if (withAverage.length > 1) return null;

  const [recent] = withAverage;
  if (recent) {
    const trend = trendOf(recent);
    const move =
      trend === 'up' ? ' Dernier relevé : en hausse.' : trend === 'down' ? ' Dernier relevé : en baisse.' : trend === 'flat' ? ' Dernier relevé : stable.' : '';
    return {
      kind: 'average',
      label: `≈ ${weekAverage(recent, now)!.toLocaleString('fr-FR')}`,
      trend,
      rarity: recent.rarity,
      tooltip: `Moyenne des enchères avec mise relevées ces 7 derniers jours (relevé toutes les 30 min).${move}${NOTE}`,
    };
  }

  const older = cards.filter((card) => lastKnown(card) !== null);
  if (older.length > 1) return null;
  const [only] = older;
  if (only) {
    const known = lastKnown(only)!;
    return {
      kind: 'stale',
      label: `≈ ${known.value.toLocaleString('fr-FR')}`,
      trend: null,
      rarity: only.rarity,
      tooltip: `Dernière valeur connue (${formatAge(now - known.at)}) : aucune enchère avec mise observée depuis.${NOTE}`,
    };
  }

  if (!owned) return null;
  return {
    kind: 'unknown',
    label: '???',
    trend: null,
    rarity: cards[0]?.rarity ?? null,
    tooltip: `Aucune enchère avec mise observée sur cette carte pour l'instant.${NOTE}`,
  };
}

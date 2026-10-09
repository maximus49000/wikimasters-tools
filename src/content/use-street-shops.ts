import { useMemo } from 'react';
import type { CityContext } from '../core/library/city/intensity';
import { cityMetrics } from '../core/library/city/metrics';
import { dayNumber, ymdOfDay } from '../core/library/city/shops/hours';
import { streetOn, type SlotDay } from '../core/library/city/shops/lifecycle';
import { shopFrame, shopSlotsFor, type ShopFrame, type ShopSlot } from '../core/library/city/shops/slots';
import { shopViewAt, type ShopView } from '../core/library/city/shops/view';

// Rue commerçante d'une scène Ville : emplacements et géométrie mémoïsés par (width, height, seed) ; simulation de la rue
// (streetOn rejoue depuis le jour de départ) recalculée seulement au changement de jour ou de noms ; décor de chaque local
// (shopViewAt) recalculé à la minute. Sans `city.shops` : aucune vue (aucun commerce dessiné, les entrées restent au bord).
// `street` (occupants et changement du jour) sert à l'équipe du chantier : ce qu'elle pose et ce qu'elle emporte.
export type StreetShops = { slots: ShopSlot[]; frames: Map<string, ShopFrame>; views: ShopView[]; street: SlotDay[] };

const NONE: SlotDay[] = [];

export function useStreetShops(width: number, height: number, seed: number, city: CityContext | undefined): StreetShops {
  const slots = useMemo(() => shopSlotsFor(width, height, seed), [width, height, seed]);
  const frames = useMemo(() => {
    const { ground } = cityMetrics(height);
    return new Map(slots.map((s) => [s.id, shopFrame(s, ground)]));
  }, [slots, height]);
  const shops = city?.shops;
  const today = city ? dayNumber(city.day.date) : null;
  const street = useMemo(
    () => (shops && today !== null ? streetOn(slots, seed, shops.epochDay, today, shops.names) : NONE),
    [slots, seed, shops?.epochDay, shops?.names, today],
  );
  const minutes = city?.minutes ?? 0;
  const views = useMemo(() => (today === null ? [] : street.map((s) => shopViewAt(s, seed, ymdOfDay(today), minutes))), [street, seed, today, minutes]);
  return { slots, frames, views, street };
}

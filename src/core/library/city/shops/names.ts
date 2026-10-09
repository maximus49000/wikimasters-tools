import { RELAY_BASE } from '../../../documentary/config';
import { SHOP_TYPE_IDS, type ShopTypeId } from './catalog';
import type { NamePool } from './lifecycle';

export const SHOPS_RELAY = `${RELAY_BASE}/shops`;
const MAX = 30;
const LENGTH = 24;

// Réponse du relais → noms par type du catalogue (types inconnus, valeurs non textuelles et noms trop longs écartés).
export function parseShopNames(body: unknown): NamePool | null {
  const names = (body as { ok?: unknown; names?: unknown } | null)?.names;
  if ((body as { ok?: unknown } | null)?.ok !== true || typeof names !== 'object' || names === null || Array.isArray(names)) return null;
  const out: NamePool = {};
  for (const id of SHOP_TYPE_IDS as readonly ShopTypeId[]) {
    const list = (names as Record<string, unknown>)[id];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((n): n is string => typeof n === 'string' && n.trim().length > 0 && n.length <= LENGTH).slice(0, MAX);
    if (kept.length > 0) out[id] = kept;
  }
  return out;
}

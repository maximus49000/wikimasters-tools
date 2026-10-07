// tests/relay/budget.test.ts
import { describe, expect, it } from 'vitest';
import { INDEX_PAGE_COST, reserveUnits, SEARCH_COST, UNIT_CEILING } from '../../relay/src/budget';
import { memoryKv } from './memory-kv';

const day = new Date('2026-10-07T10:00:00Z');

describe('reserveUnits', () => {
  it('compte les unités réservées dans la journée', async () => {
    const kv = memoryKv();
    expect(await reserveUnits(kv, day, SEARCH_COST)).toBe(true);
    expect(await reserveUnits(kv, day, INDEX_PAGE_COST * 20)).toBe(true);
    expect(kv.data.get('units-2026-10-07')).toBe(String(SEARCH_COST + INDEX_PAGE_COST * 20));
  });
  it('refuse ce qui dépasserait le plafond, sans rien écrire', async () => {
    const kv = memoryKv();
    kv.data.set('units-2026-10-07', String(UNIT_CEILING - 50));
    expect(await reserveUnits(kv, day, SEARCH_COST)).toBe(false);
    expect(kv.data.get('units-2026-10-07')).toBe(String(UNIT_CEILING - 50));
  });
  it('repart de zéro le lendemain', async () => {
    const kv = memoryKv();
    kv.data.set('units-2026-10-07', String(UNIT_CEILING));
    expect(await reserveUnits(kv, new Date('2026-10-08T00:30:00Z'), SEARCH_COST)).toBe(true);
  });
});

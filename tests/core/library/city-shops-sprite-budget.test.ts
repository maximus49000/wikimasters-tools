// tests/core/library/city-shops-sprite-budget.test.ts — plafond global des figurants des commerces (vague 1b-iv-b)
import { describe, expect, it } from 'vitest';
import { SHOP_SPRITE_CAP, capFor, spriteBudget, type BudgetSprite } from '../../../src/core/library/city/shops/sprite-budget';

const W = 720;
const C = W / 2;

// Rue bondée : 10 locaux sur 720 px ; chacun 2 employés et 2 clients intérieurs, 6 terrasses de 4 convives, une boîte de nuit
// (2 videurs, file de 6) et un déménagement (camion et 3 porteurs).
function crowded(): BudgetSprite[] {
  const out: BudgetSprite[] = [];
  for (let i = 0; i < 10; i++) {
    const x = 36 + i * 72;
    out.push({ id: `staff-${i}-0`, kind: 'keep', x }, { id: `staff-${i}-1`, kind: 'keep', x });
    out.push({ id: `cust-${i}-0`, kind: 'customer', x: x - 5 }, { id: `cust-${i}-1`, kind: 'customer', x: x + 5 });
    if (i < 6) for (let g = 0; g < 4; g++) out.push({ id: `guest-${i}-${g}`, kind: 'terrace', x: x + g - 2 });
  }
  out.push({ id: 'bouncer-0', kind: 'keep', x: 600 }, { id: 'bouncer-1', kind: 'keep', x: 610 }, { id: 'queue', kind: 'keep', x: 630, weight: 6 });
  out.push({ id: 'truck', kind: 'keep', x: 100 }, ...[0, 1, 2].map((i): BudgetSprite => ({ id: `porter-${i}`, kind: 'keep', x: 110 })));
  return out;
}
const weightOf = (list: BudgetSprite[], drop: Set<string>): number => list.filter((s) => !drop.has(s.id)).reduce((n, s) => n + (s.weight ?? 1), 0);

describe('plafond des figurants (spriteBudget)', () => {
  it('sous le plafond : rien n’est retiré', () => {
    const few = crowded().filter((s) => s.kind !== 'terrace').slice(0, 30);
    expect(spriteBudget(few, C).size).toBe(0);
  });
  it('rue bondée : au plus 40 actifs ; personnel, déménageurs, videurs et file jamais retirés', () => {
    const list = crowded();
    expect(weightOf(list, new Set())).toBeGreaterThan(SHOP_SPRITE_CAP);
    const drop = spriteBudget(list, C);
    expect(weightOf(list, drop)).toBeLessThanOrEqual(SHOP_SPRITE_CAP);
    for (const s of list) if (s.kind === 'keep') expect(drop.has(s.id), s.id).toBe(false);
  });
  it('ordre de retrait : toutes les terrasses avant le premier client, puis les clients les plus éloignés du centre', () => {
    const list = crowded();
    const drop = spriteBudget(list, C);
    const guests = list.filter((s) => s.kind === 'terrace');
    const customers = list.filter((s) => s.kind === 'customer');
    // Ici les 24 convives ne suffisent pas : tous partent, puis des clients.
    expect(guests.every((g) => drop.has(g.id))).toBe(true);
    const gone = customers.filter((c) => drop.has(c.id));
    const kept = customers.filter((c) => !drop.has(c.id));
    expect(gone.length).toBeGreaterThan(0);
    expect(kept.length).toBeGreaterThan(0);
    const far = (s: BudgetSprite): number => Math.abs(s.x - C);
    expect(Math.min(...gone.map(far))).toBeGreaterThanOrEqual(Math.max(...kept.map(far)));
    // Juste ce qu'il faut : remettre le dernier client retiré ferait dépasser.
    expect(weightOf(list, drop) + 1).toBeGreaterThan(SHOP_SPRITE_CAP);
  });
  it('peu de dépassement : seuls les convives les plus éloignés du centre partent', () => {
    const list = crowded().filter((s) => !s.id.startsWith('cust-') || s.id.endsWith('-0')).filter((s) => !s.id.startsWith('porter'));
    const over = weightOf(list, new Set()) - SHOP_SPRITE_CAP;
    expect(over).toBeGreaterThan(0);
    const drop = spriteBudget(list, C);
    expect(drop.size).toBe(over);
    const guests = list.filter((s) => s.kind === 'terrace');
    const gone = guests.filter((g) => drop.has(g.id));
    const kept = guests.filter((g) => !drop.has(g.id));
    expect(gone).toHaveLength(over);
    const far = (s: BudgetSprite): number => Math.abs(s.x - C);
    expect(Math.min(...gone.map(far))).toBeGreaterThanOrEqual(Math.max(...kept.map(far)));
  });
  it('le personnel seul au-dessus du plafond : on retire tout ce qui peut l’être, jamais le personnel', () => {
    const list: BudgetSprite[] = [
      ...Array.from({ length: 45 }, (_, i): BudgetSprite => ({ id: `s${i}`, kind: 'keep', x: i })),
      { id: 'c', kind: 'customer', x: 0 },
      { id: 'g', kind: 'terrace', x: 0 },
    ];
    expect([...spriteBudget(list, C)].sort()).toEqual(['c', 'g']);
  });
  it('plafond par 720 px de scène, jamais moins de 40', () => {
    expect(capFor(360)).toBe(40);
    expect(capFor(720)).toBe(40);
    expect(capFor(1440)).toBe(80);
  });
});

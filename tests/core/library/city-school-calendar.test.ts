import { describe, expect, it, vi } from 'vitest';
import { approximatePeriods, createSchoolCalendar, parseSchoolReply } from '../../../src/core/library/city/school-calendar';

const reply = {
  ok: true,
  zone: 'C',
  periods: [
    { name: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-02' },
    { name: 'Vacances de Noël', start: '2026-12-19', end: '2027-01-04' },
  ],
};

describe('parseSchoolReply', () => {
  it('lit une réponse valide', () => {
    expect(parseSchoolReply(reply)?.periods).toHaveLength(2);
  });
  it('rejette une réponse mal formée', () => {
    expect(parseSchoolReply(null)).toBeNull();
    expect(parseSchoolReply({ ok: false })).toBeNull();
    expect(parseSchoolReply({ ok: true, zone: 'Z', periods: [] })).toBeNull();
    expect(parseSchoolReply({ ok: true, zone: 'A', periods: [{ name: 'x', start: 'bad', end: '2026-01-01' }] })).toBeNull();
    expect(parseSchoolReply({ ok: true, zone: 'A', periods: [{ name: 'x', start: '2026-02-01', end: '2026-01-01' }] })).toBeNull();
  });
});

describe('approximatePeriods', () => {
  it('donne Toussaint, Noël et été pour les années voisines', () => {
    const names = approximatePeriods(2026).map((p) => p.name);
    expect(names.filter((n) => n.includes('Noël'))).toHaveLength(2);
    for (const p of approximatePeriods(2026)) expect(p.end > p.start).toBe(true);
  });
});

function memory() {
  const data = new Map<string, string>();
  return { get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => void data.set(k, v) };
}

describe('createSchoolCalendar', () => {
  it('interroge le relais une fois, puis sert le cache pendant 7 jours', async () => {
    let now = 1_000_000;
    const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(reply), { status: 200 }));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => now, storage: memory() });
    expect((await cal.refresh('C')).map((p) => p.name)).toContain('Vacances de Noël');
    await cal.refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toContain('/school-calendar?zone=C');
    now += 8 * 86_400_000;
    await cal.refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('retombe sur le dernier cache puis sur le relevé approché si le relais échoue', async () => {
    const fetchFn = vi.fn(async () => new Response('x', { status: 502 }));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => Date.UTC(2026, 9, 9), storage: memory() });
    expect(cal.latest('C').length).toBeGreaterThan(0); // approché avant tout appel
    expect((await cal.refresh('C')).length).toBeGreaterThan(0);
  });
  it('ne lève jamais quand fetch lève', async () => {
    const cal = createSchoolCalendar({ fetch: () => Promise.reject(new Error('réseau')), now: () => 0, storage: memory() });
    await expect(cal.refresh('A')).resolves.toBeDefined();
  });
});

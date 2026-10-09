import { describe, expect, it, vi } from 'vitest';
import { approximatePeriods, createSchoolCalendar, parseSchoolReply } from '../../../src/core/library/city/school-calendar';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 9);
const CACHE_KEY = 'wmt:school-calendar:C';
const ATTEMPT_KEY = 'wmt:school-calendar-attempt:C';

const reply = {
  ok: true,
  zone: 'C',
  periods: [
    { name: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-02' },
    { name: 'Vacances de Noël', start: '2026-12-19', end: '2027-01-04' },
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const names = (periods: { name: string }[]) => periods.map((p) => p.name);

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
  it('rejette une liste de périodes vide', () => {
    expect(parseSchoolReply({ ok: true, zone: 'A', periods: [] })).toBeNull();
  });
});

describe('approximatePeriods', () => {
  it('donne Toussaint, Noël et été pour les années voisines', () => {
    const names = approximatePeriods(2026).map((p) => p.name);
    expect(names.filter((n) => n.includes('Noël'))).toHaveLength(2);
    for (const p of approximatePeriods(2026)) expect(p.end > p.start).toBe(true);
  });
});

// Stockage en mémoire ; `data` permet de pré-remplir ou d’inspecter le contenu.
function memory(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  return { get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => void data.set(k, v), data };
}

describe('createSchoolCalendar', () => {
  it('interroge le relais une fois, puis sert le cache pendant 7 jours', async () => {
    let now = 1_000_000;
    const fetchFn = vi.fn(async (_url: string) => json(reply));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => now, storage: memory() });
    expect((await cal.refresh('C')).map((p) => p.name)).toContain('Vacances de Noël');
    await cal.refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toContain('/school-calendar?zone=C');
    now += 8 * DAY;
    await cal.refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retombe sur le dernier cache puis sur le relevé approché si le relais échoue', async () => {
    const fetchFn = vi.fn(async () => new Response('x', { status: 502 }));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => T0, storage: memory() });
    expect(cal.latest('C').length).toBeGreaterThan(0); // approché avant tout appel
    expect((await cal.refresh('C')).length).toBeGreaterThan(0);
  });

  it('ne lève jamais quand fetch lève, et sert le relevé approché', async () => {
    const cal = createSchoolCalendar({ fetch: () => Promise.reject(new Error('réseau')), now: () => T0, storage: memory() });
    await expect(cal.refresh('A')).resolves.toEqual(approximatePeriods(2026));
  });

  it('un appel concurrent partage la requête en vol : un seul fetch', async () => {
    const fetchFn = vi.fn(async () => json(reply));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => T0, storage: memory() });
    const [a, b] = await Promise.all([cal.refresh('C'), cal.refresh('C')]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('après un échec, ne retente pas avant 24 h, puis retente', async () => {
    let now = T0;
    const fetchFn = vi.fn(async () => new Response('x', { status: 502 }));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => now, storage: memory() });
    await cal.refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now = T0 + HOUR;
    await cal.refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now = T0 + 25 * HOUR;
    await cal.refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('le délai de 24 h survit à un rechargement (même stockage, nouvelle instance)', async () => {
    const store = memory();
    const fetchFn = vi.fn(async () => new Response('x', { status: 502 }));
    await createSchoolCalendar({ fetch: fetchFn, now: () => T0, storage: store }).refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(store.data.has(ATTEMPT_KEY)).toBe(true);
    await createSchoolCalendar({ fetch: fetchFn, now: () => T0 + 3 * HOUR, storage: store }).refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('cache périmé (8 j) et relais en échec : sert les périodes du cache', async () => {
    const stale = { at: T0 - 8 * DAY, periods: [{ name: 'Vacances périmées', start: '2026-10-17', end: '2026-11-02' }] };
    const fetchFn = vi.fn(async () => new Response('x', { status: 502 }));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => T0, storage: memory({ [CACHE_KEY]: JSON.stringify(stale) }) });
    expect(names(await cal.refresh('C'))).toEqual(['Vacances périmées']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('sans cache et relais en échec, les noms sont marqués (approché)', async () => {
    const fetchFn = vi.fn(async () => new Response('x', { status: 502 }));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => T0, storage: memory() });
    const periods = await cal.refresh('C');
    expect(periods.length).toBeGreaterThan(0);
    for (const n of names(periods)) expect(n).toContain('(approché)');
  });

  it('un stockage corrompu (JSON invalide ou période invalide) est ignoré : appel du relais', async () => {
    const badPeriod = JSON.stringify({ at: T0, periods: [{ name: 'x', start: 'bad', end: '2026-01-01' }] });
    for (const corrupt of ['pas du json', badPeriod]) {
      const fetchFn = vi.fn(async () => json(reply));
      const cal = createSchoolCalendar({ fetch: fetchFn, now: () => T0, storage: memory({ [CACHE_KEY]: corrupt }) });
      expect(names(await cal.refresh('C'))).toContain('Vacances de Noël');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
  });

  it('un stockage qui refuse l’écriture ne lève pas et renvoie le résultat', async () => {
    const storage = { get: () => null, set: () => { throw new Error('plein'); } };
    const cal = createSchoolCalendar({ fetch: vi.fn(async () => json(reply)), now: () => T0, storage });
    expect(names(await cal.refresh('C'))).toContain('Vacances de Noël');
  });

  it('une réponse mal formée ou d’une autre zone n’est pas mise en cache', async () => {
    const bad = [json({ ok: true, zone: 'C', periods: [] }), json({ ...reply, zone: 'A' })];
    for (const response of bad) {
      const store = memory();
      const cal = createSchoolCalendar({ fetch: vi.fn(async () => response), now: () => T0, storage: store });
      const periods = await cal.refresh('C');
      for (const n of names(periods)) expect(n).toContain('(approché)');
      expect(store.data.has(CACHE_KEY)).toBe(false);
    }
  });

  it('un cache de 6 jours encore frais ne déclenche aucun appel', async () => {
    const fresh = { at: T0 - 6 * DAY, periods: [{ name: 'Vacances fraîches', start: '2026-10-17', end: '2026-11-02' }] };
    const fetchFn = vi.fn(async () => json(reply));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => T0, storage: memory({ [CACHE_KEY]: JSON.stringify(fresh) }) });
    expect(names(await cal.refresh('C'))).toEqual(['Vacances fraîches']);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('un cache daté dans le futur est traité comme périmé', async () => {
    const future = { at: T0 + DAY, periods: [{ name: 'Vacances du futur', start: '2026-10-17', end: '2026-11-02' }] };
    const fetchFn = vi.fn(async () => json(reply));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => T0, storage: memory({ [CACHE_KEY]: JSON.stringify(future) }) });
    expect(names(await cal.refresh('C'))).toContain('Vacances de Noël');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('un relais qui ne répond pas expire après 10 s et vaut échec', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(() => new Promise<Response>(() => {}));
      const store = memory();
      const cal = createSchoolCalendar({ fetch: fetchFn, now: () => T0, storage: store });
      const pending = cal.refresh('C');
      await vi.advanceTimersByTimeAsync(10_000);
      for (const n of names(await pending)) expect(n).toContain('(approché)');
      expect(store.data.has(ATTEMPT_KEY)).toBe(true);
      await cal.refresh('C');
      expect(fetchFn).toHaveBeenCalledTimes(1); // le délai de 24 h s’applique après un délai dépassé
    } finally {
      vi.useRealTimers();
    }
  });
});

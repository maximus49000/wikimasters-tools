import { describe, expect, it, vi } from 'vitest';
import { proxySchoolCalendar } from '../../relay/src/school-calendar';

// Forme réelle de la réponse regroupée (voir l'étape de découverte) : dates en UTC, une ligne par période et population.
const records = {
  results: [
    { description: 'Vacances de la Toussaint', population: '-', start_date: '2026-10-16T22:00:00+00:00', end_date: '2026-11-01T23:00:00+00:00' },
    { description: 'Vacances de Noël', population: '-', start_date: '2026-12-18T23:00:00+00:00', end_date: '2027-01-03T23:00:00+00:00' },
    { description: 'Pont de l’Ascension', population: '-', start_date: '2027-05-06T22:00:00+00:00', end_date: '2027-05-06T22:00:00+00:00' },
    { description: 'Vacances d’été', population: 'Enseignants', start_date: '2027-07-02T22:00:00+00:00', end_date: '2027-08-31T22:00:00+00:00' },
    { description: 'Vacances d’été', population: 'Élèves', start_date: '2027-07-02T22:00:00+00:00', end_date: '2027-09-01T22:00:00+00:00' },
    { description: 'Début des Vacances d’Été', population: '-', start_date: '2028-07-03T22:00:00+00:00', end_date: '2028-07-03T22:00:00+00:00' },
  ],
};
const run = (path: string, status = 200, body: unknown = records) => {
  const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  return { fetchFn, result: proxySchoolCalendar(new URL(`https://relais.test${path}`), { fetch: fetchFn, now: () => Date.UTC(2026, 9, 9) }) };
};

describe('proxySchoolCalendar', () => {
  it('réduit la réponse aux vacances des élèves, en dates de Paris (pont d’un instant = un jour)', async () => {
    const { fetchFn, result } = run('/school-calendar?zone=C');
    const out = await result;
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({
      ok: true,
      zone: 'C',
      periods: [
        { name: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-02' },
        { name: 'Vacances de Noël', start: '2026-12-19', end: '2027-01-04' },
        { name: 'Pont de l’Ascension', start: '2027-05-07', end: '2027-05-08' },
        { name: 'Vacances d’été', start: '2027-07-03', end: '2027-09-02' },
      ],
    });
    const upstream = decodeURIComponent((fetchFn.mock.calls[0]?.[0] ?? '').replaceAll('+', ' '));
    expect(upstream).toContain('Zone C');
    expect(upstream).toContain('group_by=description,population,start_date,end_date');
  });
  it('refuse une zone inconnue sans appeler l’amont', async () => {
    const { fetchFn, result } = run('/school-calendar?zone=Z');
    expect((await result).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('répond 502 si l’amont échoue ou répond mal', async () => {
    expect((await run('/school-calendar?zone=A', 500).result).status).toBe(502);
    expect((await run('/school-calendar?zone=A', 200, { nope: 1 }).result).status).toBe(502);
  });
  it('met en cache une journée par zone', async () => {
    const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(records), { status: 200 }));
    const deps = { fetch: fetchFn, now: () => Date.UTC(2026, 9, 9) };
    await proxySchoolCalendar(new URL('https://relais.test/school-calendar?zone=B'), deps);
    await proxySchoolCalendar(new URL('https://relais.test/school-calendar?zone=B'), deps);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

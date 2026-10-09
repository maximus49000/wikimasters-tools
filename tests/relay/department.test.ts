import { describe, expect, it, vi } from 'vitest';
import { proxyDepartment } from '../../relay/src/department';

const run = (path: string, body: unknown = [{ codeDepartement: '75' }], status = 200) => {
  const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  return { fetchFn, result: proxyDepartment(new URL(`https://relais.test${path}`), { fetch: fetchFn, now: () => 0 }) };
};

describe('proxyDepartment', () => {
  it('renvoie le département et arrondit la position à 0,1°', async () => {
    const { fetchFn, result } = run('/department?lat=48.8566&lon=2.3522');
    expect(JSON.parse((await result).body)).toEqual({ ok: true, dept: '75' });
    const upstream = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream.searchParams.get('lat')).toBe('48.9');
    expect(upstream.searchParams.get('lon')).toBe('2.4');
  });
  it('refuse des coordonnées invalides', async () => {
    for (const path of ['/department', '/department?lat=x&lon=2', '/department?lat=95&lon=2', '/department?lat=1e1&lon=2']) {
      const { fetchFn, result } = run(path);
      expect((await result).status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('répond not-found hors de France (liste vide) et 502 si l’amont échoue', async () => {
    expect(JSON.parse((await run('/department?lat=40&lon=-40', []).result).body)).toEqual({ ok: false, reason: 'not-found' });
    expect((await run('/department?lat=48&lon=2', [], 500).result).status).toBe(502);
  });
});

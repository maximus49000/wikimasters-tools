import { describe, expect, it, vi } from 'vitest';
import { OVERPASS_ENDPOINTS } from '../../relay/src/overpass';
import { proxyBusLines, reduceBusLines } from '../../relay/src/buslines';

const rel = (id: number, tags: Record<string, string>, platforms: number[]) => ({
  type: 'relation',
  id,
  tags: { type: 'route', route: 'bus', ...tags },
  members: platforms.flatMap((p) => [{ type: 'way', ref: 9000 + p, role: '' }, { type: 'node', ref: p, role: 'platform' }]),
});
const stop = (id: number, name: string) => ({ type: 'node', id, tags: { public_transport: 'platform', name } });
const near = (id: number) => ({ type: 'node', id });
const run = (body: unknown, elements: unknown[] = [], status = 200) => {
  const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ elements }), { status }));
  return { fetchFn, result: proxyBusLines(typeof body === 'string' ? body : JSON.stringify(body), { fetch: fetchFn, now: () => 0 }) };
};

describe('reduceBusLines', () => {
  it('garde numéro, départ, terminus, couleur et noms d’arrêts dans l’ordre des membres', () => {
    const out = reduceBusLines([
      rel(1, { ref: '4', from: 'L’Hoirie', to: 'Parc Expo', colour: '#009EE1' }, [1, 2, 3]),
      near(2),
      stop(1, 'L’Hoirie'),
      stop(2, 'Shakespeare'),
      stop(3, 'Parc Expo'),
      { type: 'node', id: 50, tags: { amenity: 'school', name: 'Lycée Mounier' } },
    ]);
    expect(out).toEqual({ school: 'Lycée Mounier', lines: [{ ref: '4', from: 'L’Hoirie', to: 'Parc Expo', colour: '#009ee1', stops: ['L’Hoirie', 'Shakespeare', 'Parc Expo'] }] });
  });
  it('dédoublonne par numéro, classe par arrêts proches desservis, 8 lignes au plus', () => {
    const elements: unknown[] = [stop(1, 'A'), stop(2, 'B'), stop(3, 'C'), near(1), near(2)];
    for (let i = 0; i < 12; i++) elements.push(rel(100 + i, { ref: String(20 + i), from: 'A', to: 'C' }, [3]));
    elements.push(rel(10, { ref: '7', from: 'A', to: 'C' }, [3]), rel(11, { ref: '7', from: 'C', to: 'A' }, [1, 2, 3]));
    const { lines } = reduceBusLines(elements);
    expect(lines).toHaveLength(8);
    expect(lines[0]).toMatchObject({ ref: '7', from: 'C', stops: ['A', 'B', 'C'] });
    expect(lines.slice(1).map((l) => l.ref)).toEqual(['20', '21', '22', '23', '24', '25', '26']);
  });
  it('écarte les lignes sans numéro ou sans terminus, les couleurs invalides et les noms trop longs ; déduit les terminus des arrêts', () => {
    const { lines } = reduceBusLines([
      rel(1, { from: 'A', to: 'B' }, [1]),
      rel(2, { ref: '3', colour: 'red' }, [1, 2]),
      rel(3, { ref: '5' }, []),
      stop(1, 'Départ'),
      stop(2, 'Un nom d’arrêt beaucoup trop long pour une girouette'),
    ]);
    expect(lines).toEqual([{ ref: '3', from: 'Départ', to: 'Départ', colour: null, stops: ['Départ'] }]);
  });
});

describe('proxyBusLines', () => {
  it('lit la position dans le corps, part des arrêts d’un cadre de ±2 km autour de la case arrondie', async () => {
    const { fetchFn, result } = run({ lat: 47.4712, lon: -0.5518 }, [rel(1, { ref: '4', from: 'A', to: 'B' }, [1]), stop(1, 'A')]);
    const res = await result;
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, school: null, lines: [{ ref: '4', from: 'A', to: 'B', colour: null, stops: ['A'] }] });
    const q = decodeURIComponent(String(fetchFn.mock.calls[0]?.[1]?.body ?? ''));
    expect(q).toContain('nwr["public_transport"="platform"](47.482,-0.627,47.518,-0.573)');
    expect(q).toContain('out body 24');
  });
  it('met la réponse en cache par case', async () => {
    await run({ lat: 46.01, lon: 1.01 }, [rel(1, { ref: '9', from: 'A', to: 'B' }, [])]).result;
    const second = run({ lat: 46.04, lon: 1.04 });
    expect(JSON.parse((await second.result).body).lines[0].ref).toBe('9');
    expect(second.fetchFn).not.toHaveBeenCalled();
  });
  it('refuse un corps invalide et répond 502 quand tous les serveurs échouent', async () => {
    expect((await run('pas du json').result).status).toBe(400);
    expect((await run({ lat: 'x', lon: 2 }).result).status).toBe(400);
    expect((await run({ lat: 95, lon: 2 }).result).status).toBe(400);
    const failing = run({ lat: 44, lon: 3 }, [], 504);
    expect((await failing.result).status).toBe(502);
    expect(failing.fetchFn).toHaveBeenCalledTimes(OVERPASS_ENDPOINTS.length);
  });
});

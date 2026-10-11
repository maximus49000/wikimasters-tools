import { describe, expect, it } from 'vitest';
import { directed, fallbackLine, nextStops, parseBusNetwork, sceneStopIndex } from '../../../../../src/core/library/city/traffic/bus-lines';

describe('lignes de bus de repli', () => {
  it('déterministes et plausibles', () => {
    for (let s = 0; s < 200; s++) {
      const l = fallbackLine(s);
      expect(fallbackLine(s)).toEqual(l);
      expect(l.ref).toMatch(/^([1-9]\d?|[A-Z][1-9])$/);
      expect(l.to.length).toBeGreaterThan(2);
      expect(l.from).not.toBe(l.to);
      expect(l.colour).toMatch(/^#[0-9a-f]{6}$/i);
      expect(l.stops[0]).toBe(l.from);
      expect(l.stops[l.stops.length - 1]).toBe(l.to);
      expect(new Set(l.stops).size).toBe(l.stops.length);
      expect(l.stops.length).toBeGreaterThanOrEqual(9);
    }
    expect(new Set(Array.from({ length: 50 }, (_, s) => fallbackLine(s).ref)).size).toBeGreaterThan(20);
    expect(new Set(Array.from({ length: 50 }, (_, s) => fallbackLine(s).to)).size).toBeGreaterThan(5);
  });
});

describe('sens et prochains arrêts', () => {
  const line = { ref: '4', from: 'A', to: 'F', colour: '#123456', stops: ['A', 'B', 'C', 'D', 'E', 'F'] };
  it('vers la gauche : départ et terminus échangés, arrêts inversés', () => {
    expect(directed(line, 1)).toBe(line);
    expect(directed(line, -1)).toEqual({ ...line, from: 'F', to: 'A', stops: ['F', 'E', 'D', 'C', 'B', 'A'] });
  });
  it('à partir de l’arrêt de la scène, après lui une fois desservi, terminus toujours en dernier', () => {
    expect(nextStops(line, 'B', false, 1)).toEqual(['B', 'C', 'D', 'E', 'F']);
    expect(nextStops(line, 'B', true, 1)).toEqual(['C', 'D', 'E', 'F']);
    expect(nextStops(line, 'A', false, 1, 3)).toEqual(['A', 'B', 'F']);
    expect(nextStops(line, 'F', true, 1)).toEqual(['F']);
    // Arrêt absent de la ligne : celui tiré par la graine, jamais un terminus.
    const i = sceneStopIndex(line, 9);
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(5);
    expect(nextStops(line, 'Z', false, 9)[0]).toBe(line.stops[i]);
  });
});

describe('parseBusNetwork', () => {
  it('garde les lignes valides, complète départ/terminus, tire une couleur manquante', () => {
    const n = parseBusNetwork({ ok: true, school: 'Lycée Mounier', lines: [{ ref: '30', from: 'Hôtel de Ville', to: 'Louise Michel', colour: '#E6007E', stops: ['Lutin', 3, 'Louise Michel'] }, { ref: '9', from: 'X', to: 'Y', colour: null, stops: [] }, { ref: '', from: 'a', to: 'b' }, null] });
    expect(n?.school).toBe('Lycée Mounier');
    expect(n?.lines).toHaveLength(2);
    expect(n?.lines[0]).toEqual({ ref: '30', from: 'Hôtel de Ville', to: 'Louise Michel', colour: '#e6007e', stops: ['Hôtel de Ville', 'Lutin', 'Louise Michel'] });
    expect(n?.lines[1]!.colour).toMatch(/^#[0-9a-f]{6}$/);
    expect(n?.lines[1]!.stops).toEqual(['X', 'Y']);
  });
  it('refuse une forme fausse', () => {
    expect(parseBusNetwork({ ok: false })).toBeNull();
    expect(parseBusNetwork({ ok: true, lines: {} })).toBeNull();
    expect(parseBusNetwork(null)).toBeNull();
  });
});

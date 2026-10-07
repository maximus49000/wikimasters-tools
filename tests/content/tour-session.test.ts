import { describe, expect, it } from 'vitest';
import { clearTourSession, loadTourSession, saveTourReturn, saveTourSession, takeTourReturn, type TourSession } from '../../src/content/tour-session';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};
const session: TourSession = { steps: [{ target: '#a', title: 't', text: 'x', scene: { card: 'game' } }], index: 1, origin: '/marketplace?x=1', cardSlug: 'Hades' };

describe('session de visite', () => {
  it('se retrouve telle quelle, sans être consommée', () => {
    const storage = memory();
    saveTourSession(storage, session, 1_000);
    expect(loadTourSession(storage, 2_000)).toEqual(session);
    expect(loadTourSession(storage, 3_000)).toEqual(session);
  });

  it('expire au bout de 10 minutes', () => {
    const storage = memory();
    saveTourSession(storage, session, 0);
    expect(loadTourSession(storage, 600_001)).toBeNull();
  });

  it('ignore une valeur illisible ou de mauvaise forme', () => {
    const storage = memory();
    storage.setItem('wmt:tour', '{pas du json');
    expect(loadTourSession(storage, 0)).toBeNull();
    storage.setItem('wmt:tour', JSON.stringify({ steps: 'non', index: 0, origin: '/', at: 0 }));
    expect(loadTourSession(storage, 0)).toBeNull();
  });

  it('s’efface', () => {
    const storage = memory();
    saveTourSession(storage, session, 0);
    clearTourSession(storage);
    expect(loadTourSession(storage, 1)).toBeNull();
  });

  it('absorbe un stockage qui refuse d’écrire', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('bloqué'); }, removeItem: () => undefined };
    expect(() => saveTourSession(storage, session, 0)).not.toThrow();
  });

  it('garde l’interface de départ (WikiHow ou « Quoi de neuf »), et ignore une valeur invalide', () => {
    const storage = memory();
    saveTourSession(storage, { ...session, from: { kind: 'whatsnew', entries: ['a'], fixes: ['f'] } }, 0);
    expect(loadTourSession(storage, 1)?.from).toEqual({ kind: 'whatsnew', entries: ['a'], fixes: ['f'] });
    saveTourSession(storage, { ...session, from: { kind: 'wikihow' } }, 0);
    expect(loadTourSession(storage, 1)?.from).toEqual({ kind: 'wikihow' });
    storage.setItem('wmt:tour', JSON.stringify({ steps: [], index: 0, origin: '/', from: { kind: 'whatsnew', entries: [1], fixes: [] }, at: 0 }));
    expect(loadTourSession(storage, 1)?.from).toBeUndefined();
    storage.setItem('wmt:tour', JSON.stringify({ steps: [], index: 0, origin: '/', from: { kind: 'autre' }, at: 0 }));
    expect(loadTourSession(storage, 1)?.from).toBeUndefined();
  });

  it('le retour à l’interface de départ se lit une seule fois et expire au bout de 10 minutes', () => {
    const storage = memory();
    saveTourReturn(storage, { kind: 'wikihow' }, 0);
    expect(takeTourReturn(storage, 1)).toEqual({ kind: 'wikihow' });
    expect(takeTourReturn(storage, 2)).toBeNull();
    saveTourReturn(storage, { kind: 'wikihow' }, 0);
    expect(takeTourReturn(storage, 600_001)).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { activeHifi, hifiState, hiddenAtHome } from '../../../src/core/library/hifi';
import type { Layout } from '../../../src/core/library/library-types';

const hifi = (id: string): Layout[number] => ({ id, kind: 'small', item: 'hifi', hostId: 'desk', slot: 0 });
const cd = (id: string, slug: string): Layout[number] => ({ id, kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug } as Layout[number]);
const view = (slug: string | null, playing: boolean) => ({ card: slug ? { slug } : null, track: { playing } });

describe('poste hi-fi', () => {
  it('le premier poste posé sert', () => {
    const l: Layout = [hifi('h1'), hifi('h2')];
    expect(activeHifi(l)?.id).toBe('h1');
  });
  it('carte en lecture rangée : au poste, tourne selon playing', () => {
    const l: Layout = [hifi('h1'), cd('c1', 'a')];
    expect(hifiState(l, view('a', true))).toEqual({ hifiId: 'h1', atHifi: 'c1', spinning: true });
    expect(hifiState(l, view('a', false)).spinning).toBe(false);
    expect([...hiddenAtHome(hifiState(l, view('a', true)))]).toEqual(['c1']);
  });
  it('carte absente de la pièce : rien au poste', () => {
    expect(hifiState([hifi('h1')], view('zz', true))).toEqual({ hifiId: 'h1', atHifi: null, spinning: false });
  });
  it('sans poste : rien caché', () => {
    const s = hifiState([cd('c1', 'a')], view('a', true));
    expect(s).toEqual({ hifiId: null, atHifi: null, spinning: false });
    expect(hiddenAtHome(s).size).toBe(0);
  });
  it('view.card null : rien au poste', () => {
    expect(hifiState([hifi('h1'), cd('c1', 'a')], { card: null, track: null }).atHifi).toBeNull();
  });
});

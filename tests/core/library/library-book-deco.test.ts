import { describe, expect, it } from 'vitest';
import { createInitialState, parseStoredLibraryState } from '../../../src/core/library/library-book';

const withLayout = (layout: unknown[]) => {
  const state = createInitialState();
  return { ...state, rooms: state.rooms.map((r, i) => (i === 0 ? { ...r, layout } : r)) };
};
const clock = { id: 'f1', kind: 'deco', deco: 'wall-clock', col: 2, row: 1, city: { name: 'Tokyo', tz: 'Asia/Tokyo' } };
const panel = { id: 'f2', kind: 'deco', deco: 'panel-neon', col: 6, row: 1, w: 5, h: 2, text: 'Good vibes', neon: 'cyan' };
const shelf = { id: 'f3', kind: 'shelf', col: 0, row: 8 };

describe('sauvegarde des objets décoratifs', () => {
  it('relit une horloge et un panneau à l identique', () => {
    const read = parseStoredLibraryState(withLayout([clock, panel]));
    expect(read?.rooms[0]?.layout).toEqual([clock, panel]);
  });

  it('une pièce sans objet décoratif est inchangée', () => {
    const raw = withLayout([shelf]);
    expect(parseStoredLibraryState(raw)?.rooms[0]?.layout).toEqual([shelf]);
  });

  it('retire seulement l objet abîmé (texte trop long, taille hors bornes, type inconnu)', () => {
    const bad = [
      { ...panel, id: 'b1', text: 'x'.repeat(500) },
      { ...panel, id: 'b2', w: 1, h: 1 },
      { ...clock, id: 'b4', deco: 'cuckoo' },
    ];
    const read = parseStoredLibraryState(withLayout([shelf, ...bad, clock]));
    expect(read).not.toBeNull();
    expect(read!.rooms[0]!.layout.map((p) => p.id)).toEqual(['f3', 'f1']);
  });

  it('retire une horloge dont le fuseau est inconnu, sans toucher aux autres objets', () => {
    const atlantis = { ...clock, id: 'b5', city: { name: 'Atlantide', tz: 'Ocean/Atlantis' } };
    const read = parseStoredLibraryState(withLayout([shelf, atlantis, clock]));
    expect(read).not.toBeNull();
    expect(read!.rooms[0]!.layout.map((p) => p.id)).toEqual(['f3', 'f1']);
  });

  it('retire seulement un réveil de table dont le fuseau est inconnu, la bibliothèque reste lisible', () => {
    const desk = { id: 'd1', kind: 'desk', col: 4, row: 13 };
    const alarm = { id: 's1', kind: 'small', item: 'alarm', hostId: 'd1', x: 6, z: 26.5, city: { name: 'Atlantide', tz: 'Ocean/Atlantis' } };
    const good = { id: 's2', kind: 'small', item: 'clock', hostId: 'd1', x: 38, z: 27, city: { name: 'Tokyo', tz: 'Asia/Tokyo' } };
    const read = parseStoredLibraryState(withLayout([desk, alarm, good, clock]));
    expect(read).not.toBeNull();
    expect(read!.rooms[0]!.layout.map((p) => p.id)).toEqual(['d1', 's2', 'f1']);
  });
});

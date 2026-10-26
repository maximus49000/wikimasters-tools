import { describe, expect, it } from 'vitest';
import { benchLayout } from '../../.superpowers/harness-piece/fixtures';
import { angleOf, canHangRect, canPlace, isStanding, rectOf } from '../../src/core/library/room-grid';

// La pièce du banc G6 (.superpowers/harness-piece) est posée à la main : elle doit respecter les règles de pose du dépôt, sinon les
// captures et les mesures montrent une pièce impossible (meubles l'un dans l'autre, objet caché).

const COLS = 48;
const layout = benchLayout();

describe('pièce du banc G6', () => {
  it('chaque meuble debout passe la fonction de pose (aucun chevauchement interdit)', () => {
    for (const p of layout) {
      if (!isStanding(p)) continue;
      expect({ id: p.id, ...canPlace(layout, COLS, p.kind, p.col, p.row, p.id, angleOf(p)) }).toEqual({ id: p.id, ok: true });
    }
  });

  it('chaque objet accroché tient sur le mur, sur des cases libres', () => {
    for (const p of layout) {
      if (p.kind !== 'wall' && p.kind !== 'deco' && p.kind !== 'window') continue;
      const r = rectOf(p)!;
      expect({ id: p.id, ...canHangRect(layout, COLS, r.w, r.h, r.col, r.row, p.id) }).toEqual({ id: p.id, ok: true });
    }
  });

  it('la lanterne en papier n’est cachée par aucun autre meuble', () => {
    const lantern = rectOf(layout.find((p) => p.id === 'pl')!)!;
    for (const p of layout) {
      if (!isStanding(p) || p.id === 'pl' || p.kind === 'rug') continue;
      const r = rectOf(p)!;
      const overlap = r.col < lantern.col + lantern.w && lantern.col < r.col + r.w && r.row < lantern.row + lantern.h && lantern.row < r.row + r.h;
      expect({ id: p.id, overlap }).toEqual({ id: p.id, overlap: false });
    }
  });
});

import { describe, expect, it } from 'vitest';
import { CATEGORIES, catalogTree, FURNITURE_KINDS, SMALL_ITEM_OF, isSmallKind, isStandingKind, labelOf, layerOf, sizeOf, STEAMPUNK_ONLY, underOf } from '../../../src/core/library/furniture-catalog';
import { DECO_KINDS } from '../../../src/core/library/deco';
import { floorOffsets, poisAt } from '../../../src/core/library/footprint';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { MIN_COLS, ROWS, WALL_ROWS } from '../../../src/core/library/room-grid';

describe('catalogue', () => {
  it('chaque meuble tient dans la pièce', () => {
    for (const kind of STANDING_KINDS) {
      const { w, h } = sizeOf(kind);
      expect(w, kind).toBeLessThanOrEqual(MIN_COLS);
      expect(h, kind).toBeLessThanOrEqual(layerOf(kind) === 'rug' ? ROWS - WALL_ROWS : ROWS);
    }
  });

  it('les points d’intérêt sont dans l’emprise du meuble', () => {
    for (const kind of STANDING_KINDS) {
      const { w, h } = sizeOf(kind);
      for (const poi of poisAt(kind, 0)) {
        expect(poi.dx, kind).toBeGreaterThanOrEqual(0);
        expect(poi.dx, kind).toBeLessThan(w);
        expect(poi.dy, kind).toBeGreaterThanOrEqual(0);
        expect(poi.dy, kind).toBeLessThan(h);
      }
    }
  });

  it('les meubles pour animaux et les assises déclarent leurs points', () => {
    expect(poisAt('sofa', 0).filter((p) => p.type === 'seat')).toHaveLength(3);
    expect(poisAt('basket', 0).map((p) => p.type)).toEqual(['curl']);
    expect(poisAt('bowl', 0).map((p) => p.type)).toEqual(['eat']);
    expect(poisAt('kennel', 0).map((p) => p.type).sort()).toEqual(['enter', 'sleep']);
  });

  it('la station de recharge : catégorie Animaux, un point charge, 2×1 au sol', () => {
    expect(CATEGORIES.find((c) => c.id === 'pets')!.kinds).toContain('charger');
    // Dalle de 40 × 30 cm : dessin de 2 × 2 cases (le dessus remonte d'une case), 2 cases au sol sur la dernière rangée.
    expect(poisAt('charger', 0)).toEqual([{ type: 'charge', dx: 1, dy: 1 }]);
    expect(sizeOf('charger')).toEqual({ w: 2, h: 2 });
    expect(floorOffsets('charger', 0)).toEqual([{ col: 0, row: 1 }, { col: 1, row: 1 }]);
    expect(layerOf('charger')).toBe('floor');
    expect(labelOf('charger')).toBe('Station de recharge');
  });

  it('seul le tapis est sur la couche tapis', () => {
    expect(STANDING_KINDS.filter((k) => layerOf(k) === 'rug')).toEqual(['rug']);
  });

  it('les catégories couvrent chaque type une seule fois', () => {
    const all = [...STANDING_KINDS, 'computer', 'window', 'small-plant', 'small-lamp', 'small-alarm', 'small-clock', 'small-station', ...DECO_KINDS].sort();
    expect([...FURNITURE_KINDS].sort()).toEqual(all);
    expect(CATEGORIES.map((c) => c.id)).toEqual(['storage', 'seats', 'pets', 'deco', 'steampunk']);
  });

  it('chaque type a un libellé et les aides de type répondent', () => {
    for (const kind of FURNITURE_KINDS) expect(labelOf(kind).length).toBeGreaterThan(0);
    expect(isStandingKind('sofa')).toBe(true);
    expect(isStandingKind('computer')).toBe(false);
    expect(isSmallKind('small-lamp')).toBe(true);
    expect(SMALL_ITEM_OF['small-plant']).toBe('plant');
  });
});

describe('catalogTree', () => {
  it('découpe la Déco en Plantes, Lumières, Sol, Horloges et Murs', () => {
    const deco = catalogTree('scandinave').find((n) => n.id === 'deco');
    expect(deco?.subcategories.map((s) => s.id)).toEqual(['plants', 'lights', 'floor', 'clocks', 'walls']);
    expect(deco?.subcategories.find((s) => s.id === 'plants')?.kinds).toEqual(['plant', 'small-plant', 'monstera', 'strelitzia', 'palm', 'cactus', 'pampas']);
    expect(deco?.subcategories.find((s) => s.id === 'lights')?.kinds).toEqual(['lamp', 'small-lamp', 'paper-lantern', 'arc-lamp']);
    expect(deco?.subcategories.find((s) => s.id === 'floor')?.kinds).toEqual(['rug', 'coffee-table', 'side-table']);
    expect(deco?.subcategories.find((s) => s.id === 'walls')?.kinds).toEqual(['window', 'panel-chalk', 'panel-letter', 'panel-neon', 'panel-cork']);
  });

  it('les sous-catégories couvrent exactement les meubles de leur catégorie', () => {
    for (const node of catalogTree('steampunk')) {
      if (node.subcategories.length === 0) continue;
      expect([...node.subcategories.flatMap((s) => s.kinds)].sort()).toEqual([...node.kinds].sort());
    }
  });

  it('ne propose Steampunk que dans une pièce Steampunk', () => {
    expect(catalogTree('scandinave').some((n) => n.id === 'steampunk')).toBe(false);
    expect(catalogTree('steampunk').some((n) => n.id === 'steampunk')).toBe(true);
  });

  it('nomme « Pour animaux » la catégorie des meubles d’animaux (le menu 🐾 s’appelle Animaux)', () => {
    expect(catalogTree('scandinave').find((n) => n.id === 'pets')?.label).toBe('Pour animaux');
  });

  it('seules la Déco et les Assises ont des sous-catégories', () => {
    expect(catalogTree('scandinave').filter((n) => n.subcategories.length > 0).map((n) => n.id)).toEqual(['seats', 'deco']);
  });

  it('découpe les Assises en Chaises et fauteuils, Canapés, Poufs et bancs', () => {
    const seats = catalogTree('scandinave').find((n) => n.id === 'seats');
    expect(seats?.subcategories.map((s) => [s.id, s.label])).toEqual([['chairs', 'Chaises et fauteuils'], ['couches', 'Canapés'], ['poufs', 'Poufs et bancs']]);
    expect(seats?.subcategories.find((s) => s.id === 'chairs')?.kinds).toEqual(['chair', 'armchair', 'rocking-chair', 'egg-chair', 'peacock-chair']);
    expect(seats?.subcategories.find((s) => s.id === 'couches')?.kinds).toEqual(['sofa', 'club-chair', 'loveseat', 'daybed']);
    expect(seats?.subcategories.find((s) => s.id === 'poufs')?.kinds).toEqual(['pouf', 'square-pouf', 'beanbag', 'bench']);
  });

  it('commode en Rangement, arbre à chat dans Pour animaux, guéridon dans Déco > Sol', () => {
    const tree = catalogTree('scandinave');
    expect(tree.find((n) => n.id === 'storage')?.kinds).toEqual(['shelf', 'desk', 'computer', 'dresser']);
    expect(tree.find((n) => n.id === 'pets')?.kinds).toEqual(['basket', 'bowl', 'kennel', 'charger', 'cat-tree']);
    expect(underOf('side-table')).toBe(true);
  });

  it('les nouveaux meubles restent dans toutes les pièces (aucun réservé au Steampunk)', () => {
    expect(STEAMPUNK_ONLY).toEqual(['globe', 'telescope', 'automaton']);
  });

  it('range les horloges, météomètres et panneaux dans Déco', () => {
    const deco = catalogTree('scandinave').find((c) => c.id === 'deco')!;
    // Les kinds small-* s'ajoutent à la tâche 9.
    expect(deco.subcategories.find((s) => s.id === 'clocks')).toMatchObject({ label: 'Horloges et météo', kinds: ['wall-clock', 'digital-clock', 'weather-station', 'barometer', 'small-alarm', 'small-clock', 'small-station'] });
    expect(deco.subcategories.find((s) => s.id === 'walls')!.kinds).toEqual(['window', 'panel-chalk', 'panel-letter', 'panel-neon', 'panel-cork']);
    expect(labelOf('panel-letter')).toBe('Tableau à lettres');
  });
});

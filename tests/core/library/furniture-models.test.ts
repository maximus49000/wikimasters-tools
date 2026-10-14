// tests/core/library/furniture-models.test.ts
import { describe, expect, it } from 'vitest';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { FURNITURE_MODELS, STEAMPUNK_TRIM } from '../../../src/core/library/furniture-models';
import { pieceBounds, renderModel } from '../../../src/core/library/furniture-render3d';

const DIMS: Record<string, [number, number, number]> = {
  shelf: [80, 30, 180], desk: [120, 60, 75], chair: [45, 50, 90], sofa: [200, 90, 85], armchair: [80, 80, 90],
  'coffee-table': [100, 55, 45], lamp: [40, 40, 160], plant: [45, 45, 110], rug: [200, 140, 1], basket: [60, 45, 25],
  bowl: [20, 20, 8], kennel: [70, 90, 75], charger: [40, 30, 10], globe: [50, 50, 100], telescope: [60, 60, 130], automaton: [45, 40, 110],
  'rocking-chair': [65, 95, 104], 'club-chair': [90, 85, 80], loveseat: [150, 88, 82], daybed: [165, 70, 85], 'egg-chair': [100, 100, 195],
  'peacock-chair': [90, 65, 140], pouf: [55, 55, 40], beanbag: [80, 80, 70], bench: [120, 40, 48],
  dresser: [100, 45, 82], 'side-table': [50, 50, 60], 'cat-tree': [62, 50, 150],
  monstera: [85, 70, 120], strelitzia: [60, 60, 170], palm: [100, 100, 190], cactus: [35, 35, 132], pampas: [42, 30, 122],
};

describe('plantes du mobilier divers', () => {
  const leaves = (k: keyof typeof FURNITURE_MODELS) => FURNITURE_MODELS[k].pieces.flatMap((p) => (p.shape === 'foliage' ? p.leaves : []));
  it('monstera en feuilles en cœur, oiseau de paradis en palettes avec une fleur orange', () => {
    expect(leaves('monstera').length).toBeGreaterThanOrEqual(6);
    expect(leaves('monstera').every((l) => l.form === 'heart')).toBe(true);
    expect(leaves('strelitzia').every((l) => l.form === 'paddle')).toBe(true);
    expect(FURNITURE_MODELS.strelitzia.pieces.some((p) => p.color === '#F08A24')).toBe(true);
  });
  it('palmier : au moins 7 palmes de folioles, moins de 500 formes à chaque angle (Android)', () => {
    expect(leaves('palm').length).toBeGreaterThanOrEqual(7 * 10);
    for (const a of [0, 1, 2, 3, 4, 5, 6, 7] as const) expect(renderModel(FURNITURE_MODELS.palm, a).shapes.length).toBeLessThan(500);
  });
  it('cactus fleuri, pampas en 5 plumets', () => {
    expect(FURNITURE_MODELS.cactus.pieces.some((p) => p.color === '#EF6F9C')).toBe(true);
    expect(leaves('pampas')).toHaveLength(5);
  });
});

describe('commode, guéridon, arbre à chat', () => {
  it('perchoirs : plateau de la commode, du guéridon, haut de l’arbre à chat', () => {
    expect(FURNITURE_MODELS.dresser.perch?.y).toBe(82);
    expect(FURNITURE_MODELS['side-table'].perch?.y).toBe(60);
    expect(FURNITURE_MODELS['cat-tree'].perch?.y).toBe(150);
  });
  it('l’arbre à chat a deux poteaux en sisal et une balle rouge', () => {
    const t = FURNITURE_MODELS['cat-tree'];
    expect(t.pieces.filter((p) => p.color === '#D8BE86')).toHaveLength(2);
    expect(t.pieces.some((p) => p.color === '#E0664A')).toBe(true);
  });
  it('la commode a trois tiroirs à deux boutons', () => {
    expect(FURNITURE_MODELS.dresser.pieces.filter((p) => p.shape === 'box' && p.fill === 'desk')).toHaveLength(3);
    expect(FURNITURE_MODELS.dresser.pieces.filter((p) => p.shape === 'rod' && p.fill === 'metal')).toHaveLength(6);
  });
});

const SEATS = ['rocking-chair', 'club-chair', 'loveseat', 'daybed', 'egg-chair', 'peacock-chair', 'pouf', 'beanbag', 'bench'] as const;
describe('assises du mobilier divers', () => {
  const places = (k: keyof typeof FURNITURE_MODELS, t: string) => (FURNITURE_MODELS[k].pois ?? []).filter((p) => p.type === t).length;
  it('places assises et couchages', () => {
    expect([places('rocking-chair', 'seat'), places('club-chair', 'seat'), places('loveseat', 'seat'), places('daybed', 'seat')]).toEqual([1, 1, 2, 1]);
    expect([places('egg-chair', 'seat'), places('peacock-chair', 'seat'), places('pouf', 'seat'), places('bench', 'seat')]).toEqual([1, 1, 1, 2]);
    expect([places('loveseat', 'sleep'), places('daybed', 'sleep'), places('beanbag', 'sleep')]).toEqual([1, 1, 1]);
    expect(places('loveseat', 'hide')).toBe(1);
  });
  it('hauteurs de perchoir de la maquette', () => {
    expect(SEATS.map((k) => FURNITURE_MODELS[k].perch?.y)).toEqual([52, 49, 49, 49, 70, 50, 40, 35, 48]);
  });
  it('perchoirs et places dans la boîte du meuble', () => {
    for (const k of SEATS) {
      const m = FURNITURE_MODELS[k];
      const p = m.perch!;
      expect(p.x >= 0 && p.x + p.w <= m.w && p.z >= 0 && p.z + p.d <= m.d && p.y <= m.h, k).toBe(true);
      for (const q of m.pois ?? []) expect(q.x >= 0 && q.x <= m.w && q.z >= 0 && q.z <= m.d, k).toBe(true);
    }
  });
  it('se dessinent à chaque angle', () => {
    for (const k of SEATS) for (const a of [0, 1, 2, 3, 4, 5, 6, 7] as const) expect(renderModel(FURNITURE_MODELS[k], a).shapes.length, k + ' ' + a).toBeGreaterThanOrEqual(3);
  });
});

describe('modèles', () => {
  it.each(STANDING_KINDS)('%s : dimensions réelles du catalogue', (kind) => {
    const m = FURNITURE_MODELS[kind];
    expect([m.w, m.d, m.h]).toEqual(DIMS[kind]);
  });
  it.each(STANDING_KINDS)('%s : toutes les pièces tiennent dans la boîte du meuble', (kind) => {
    const m = FURNITURE_MODELS[kind];
    for (const p of m.pieces) {
      const [x0, x1, y0, y1, z0, z1] = pieceBounds(p);
      expect(x0).toBeGreaterThanOrEqual(-0.01); expect(x1).toBeLessThanOrEqual(m.w + 0.01);
      expect(y0).toBeGreaterThanOrEqual(-0.01); expect(y1).toBeLessThanOrEqual(m.h + 0.01);
      expect(z0).toBeGreaterThanOrEqual(-0.01); expect(z1).toBeLessThanOrEqual(m.d + 0.01);
    }
  });
  it('tailles de face proches du tableau de la spec (± 1 case)', () => {
    const FACE: Record<string, [number, number]> = { shelf: [4, 9], desk: [6, 4], chair: [2, 4], sofa: [10, 4], armchair: [4, 4], 'coffee-table': [5, 2], lamp: [2, 8], plant: [2, 5], basket: [3, 1], bowl: [1, 1], kennel: [3, 4], charger: [2, 1], globe: [2, 5], telescope: [3, 6], automaton: [2, 5] };
    for (const [kind, [w, h]] of Object.entries(FACE)) {
      const r = renderModel(FURNITURE_MODELS[kind as keyof typeof FURNITURE_MODELS], 0);
      expect(Math.abs(r.cols - w)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.rows - h)).toBeLessThanOrEqual(2); // + la profondeur qui remonte
    }
  });
  it('l’étagère tournée ne grandit pas (± 1 case)', () => {
    const h0 = renderModel(FURNITURE_MODELS.shelf, 0).rows;
    for (const a of [1, 2, 3, 4, 5, 6, 7] as const) expect(Math.abs(renderModel(FURNITURE_MODELS.shelf, a).rows - h0)).toBeLessThanOrEqual(1);
  });
  it('aucune pièce entièrement enfouie dans une autre pièce', () => {
    const bb = (p: Parameters<typeof pieceBounds>[0]): number[] => pieceBounds(p);
    for (const kind of STANDING_KINDS) {
      const boxes = FURNITURE_MODELS[kind].pieces.filter((p) => p.shape === 'box').map(bb);
      FURNITURE_MODELS[kind].pieces.forEach((p, i) => {
        const a = bb(p);
        boxes.forEach((b) => {
          if (b === a || (p.shape === 'box' && b.every((v, k) => v === a[k]))) return;
          const dedans = [0, 2, 4].every((k) => a[k]! >= b[k]! - 1e-6 && a[k + 1]! <= b[k + 1]! + 1e-6);
          expect(dedans, kind + ' pièce ' + i + ' enfouie').toBe(false);
        });
      });
    }
  });
  it('garnitures Steampunk : aucune enfouie ; celles posées à l’intérieur d’une boîte affleurent sa surface (cuir, clous)', () => {
    const bb = (p: Parameters<typeof pieceBounds>[0]): number[] => pieceBounds(p);
    let flush = 0;
    for (const [kind, trim] of Object.entries(STEAMPUNK_TRIM)) {
      const all = [...FURNITURE_MODELS[kind as keyof typeof FURNITURE_MODELS].pieces, ...trim!];
      const boxes = all.filter((p) => p.shape === 'box').map(bb);
      trim!.forEach((p, i) => {
        const a = bb(p);
        boxes.forEach((b) => {
          if (p.shape === 'box' && b.every((v, k) => v === a[k])) return;
          const dedans = [0, 2, 4].every((k) => a[k]! >= b[k]! - 1e-6 && a[k + 1]! <= b[k + 1]! + 1e-6);
          if (!dedans) return;
          // Affleurante : elle partage un plan extérieur de la boîte (dessus, avant, flanc…), donc reste visible.
          const affleure = a.some((v, k) => Math.abs(v - b[k]!) < 1e-6);
          expect(affleure, kind + ' garniture ' + i + ' enfouie').toBe(true);
          flush++;
        });
      });
    }
    // Explicite : le cuir du bureau (dessus du plateau) ; au fauteuil, 12 clous en façade (assise, accoudoirs), 6 au dos du dossier, 6 sur les flancs.
    expect(flush).toBe(1 + 12 + 6 + 6);
  });
  it('les points d’intérêt historiques existent toujours', () => {
    expect(FURNITURE_MODELS.sofa.pois?.filter((p) => p.type === 'seat')).toHaveLength(3);
    expect(FURNITURE_MODELS.sofa.pois?.some((p) => p.type === 'sleep')).toBe(true);
    expect(FURNITURE_MODELS.chair.pois?.[0]?.type).toBe('seat');
    expect(FURNITURE_MODELS.charger.pois?.[0]?.type).toBe('charge');
    expect(FURNITURE_MODELS.kennel.pois?.map((p) => p.type).sort()).toEqual(['enter', 'sleep']);
  });
});

describe('modèles reconnaissables (globe, niche, automate, plante)', () => {
  const ANGLES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
  it('globe : sphère inclinée avec continents, équateur et méridien en laiton, socle rond en bois', () => {
    const g = FURNITURE_MODELS.globe;
    const sphere = g.pieces.find((p) => p.shape === 'ball' && p.marks !== undefined);
    expect(sphere?.shape === 'ball' && Math.abs((sphere.tilt ?? 0) - 23) < 2).toBe(true);
    expect(sphere?.shape === 'ball' && (sphere.marks?.length ?? 0) >= 3 && sphere.rings?.[0]?.fill === 'metal').toBe(true);
    expect(g.pieces.some((p) => p.shape === 'cyl' && p.y === 0 && (p.fill === 'wood' || p.fill === 'woodDark'))).toBe(true);
    for (const a of ANGLES) expect(renderModel(g, a).shapes.some((s) => s.fill === 'leaf'), 'continent visible ' + a).toBe(true);
  });
  it('niche : toit à deux pans qui déborde, porte sombre en façade', () => {
    const k = FURNITURE_MODELS.kennel;
    const roof = k.pieces.filter((p) => p.shape === 'prism' && p.fill === 'door');
    expect(roof.length).toBeGreaterThanOrEqual(2);
    const walls = k.pieces.filter((p) => p.fill === 'wood').map(pieceBounds);
    const roofB = roof.map(pieceBounds);
    expect(Math.min(...roofB.map((b) => b[0]))).toBeLessThan(Math.min(...walls.map((b) => b[0]))); // débord
    expect(k.pieces.some((p) => (p.tone ?? 1) < 0.8)).toBe(true); // ouverture sombre
  });
  it('automate : deux bras, deux yeux clairs, un cadran', () => {
    const a = FURNITURE_MODELS.automaton;
    expect(a.pieces.filter((p) => p.shape === 'rod' && p.fill === 'metal').length).toBeGreaterThanOrEqual(4); // bras et jambes
    expect(a.pieces.filter((p) => p.shape === 'rod' && p.fill === 'shade').length).toBeGreaterThanOrEqual(3); // yeux + cadran
    for (const ang of ANGLES) expect(renderModel(a, ang).shapes.length).toBeGreaterThan(12);
  });
  it('plante : pot en terre avec bord et terreau, au moins 12 feuilles en deux verts', () => {
    const p = FURNITURE_MODELS.plant;
    const fol = p.pieces.find((x) => x.shape === 'foliage');
    expect(fol?.shape === 'foliage' && fol.leaves.length >= 12).toBe(true);
    const fills = new Set(fol?.shape === 'foliage' ? fol.leaves.map((l) => l.fill ?? fol.fill) : []);
    expect(fills.has('leaf') && fills.has('leafDark')).toBe(true);
    expect(p.pieces.filter((x) => x.shape === 'cyl').length).toBeGreaterThanOrEqual(3); // pot, bord, terreau
  });
});

describe('télescope, lampadaire, garnitures Steampunk', () => {
  const ANGLES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
  it('télescope : trépied de trois pieds inclinés, tube incliné d’environ 30° plus large côté objectif, oculaire', () => {
    const t = FURNITURE_MODELS.telescope;
    const legs = t.pieces.filter((p) => p.shape === 'rod' && p.a[1] !== p.b[1] && Math.min(p.a[1], p.b[1]) < 1); // pieds posés au sol
    expect(legs).toHaveLength(3);
    for (const l of legs) if (l.shape === 'rod') expect(Math.abs(l.a[0] - l.b[0]) + Math.abs(l.a[2] - l.b[2])).toBeGreaterThan(10); // inclinés
    const tubes = t.pieces.filter((p) => p.shape === 'rod' && p.fill === 'metal' && p.r >= 4);
    expect(tubes.length).toBeGreaterThanOrEqual(2);
    const main = tubes[0]!;
    if (main.shape !== 'rod') throw new Error('tube');
    const tilt = (Math.atan2(Math.abs(main.b[1] - main.a[1]), Math.hypot(main.b[0] - main.a[0], main.b[2] - main.a[2])) * 180) / Math.PI;
    expect(Math.abs(tilt - 30)).toBeLessThan(6);
    expect(Math.max(...tubes.map((p) => (p.shape === 'rod' ? p.r : 0)))).toBeGreaterThan(main.r);
  });
  it('lampadaire : base ronde lestée, abat-jour évasé, largeur dessinée identique à chaque angle', () => {
    const l = FURNITURE_MODELS.lamp;
    expect(l.round).toBe(true);
    expect(l.pieces.some((p) => p.shape === 'cyl' && p.fill === 'shade' && (p.r2 ?? p.r) < p.r)).toBe(true);
    const cols = new Set(ANGLES.map((a) => renderModel(l, a).cols));
    expect(cols.size).toBe(1);
  });
  it.each(['desk', 'armchair', 'lamp'] as const)('%s Steampunk : garnitures nombreuses et dans la boîte du meuble', (kind) => {
    const m = FURNITURE_MODELS[kind];
    const trim = STEAMPUNK_TRIM[kind] ?? [];
    expect(trim.length).toBeGreaterThanOrEqual(6);
    for (const p of trim) {
      const [x0, x1, y0, y1, z0, z1] = pieceBounds(p);
      expect(x0).toBeGreaterThanOrEqual(-0.01); expect(x1).toBeLessThanOrEqual(m.w + 0.01);
      expect(y0).toBeGreaterThanOrEqual(-0.01); expect(y1).toBeLessThanOrEqual(m.h + 0.01);
      expect(z0).toBeGreaterThanOrEqual(-0.01); expect(z1).toBeLessThanOrEqual(m.d + 0.01);
    }
    const plain = renderModel(m, 0).shapes.length;
    const steam = renderModel({ ...m, pieces: [...m.pieces, ...trim] }, 0).shapes.length;
    expect(steam - plain).toBeGreaterThanOrEqual(10);
  });
});

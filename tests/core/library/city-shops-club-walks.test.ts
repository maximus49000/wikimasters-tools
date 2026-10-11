import { describe, expect, it } from 'vitest';
import { cityMetrics } from '../../../src/core/library/city/metrics';
import { BOUNCER_STAGGER_S, bouncerArriveOf, bouncerLeaveOf, clearAt, clubWalkAt, clubWalkEnd, walkOffOf, type ClubCtx } from '../../../src/core/library/city/shops/club-walks';
import { YAW_LEFT, YAW_RIGHT } from '../../../src/core/library/figure/gait';
import { WORLD_MARGIN } from '../../../src/core/library/scene-world';

const m = cityMetrics(340);
const ctx = (over: Partial<ClubCtx> = {}): ClubCtx => ({ width: 720, doorXs: [], metrics: m, k: 0.55, lineY: m.doorY + 3, ...over });
const door = { x: 395, y: m.doorY - 20, w: 10, h: 20 };

describe('fermeture : la file se défait à pied', () => {
  it('membre : demi-tour sur place, marche jusqu’au bord du monde côté file, puis caché (hors champ)', () => {
    const w = walkOffOf({ id: 'a', outfitKey: 'q', x: 430, y: m.doorY + 3, yaw: YAW_LEFT, speed: 14, away: 1 }, 100, ctx());
    const v0 = clubWalkAt(w, 100)!;
    expect(v0.where).toBe('street');
    expect(v0.where === 'street' && v0.x).toBe(430);
    expect(v0.pose.gait).toBe('step');
    let last = 430;
    let t = 100.5;
    for (; t < clubWalkEnd(w) - 0.01; t += 0.5) {
      const v = clubWalkAt(w, t)!;
      expect(v).not.toBeNull();
      if (v.where === 'street') {
        expect(v.x).toBeGreaterThanOrEqual(last - 1e-9);
        last = v.x;
      }
    }
    expect(last).toBeGreaterThan(720 + WORLD_MARGIN - 8);
    expect(clubWalkAt(w, clubWalkEnd(w) + 0.01)).toBeNull();
    // Vers +x, pas en miroir : tournée à droite pendant la marche.
    expect(clubWalkAt(w, 103)!.pose.yaw).toBe(YAW_RIGHT);
  });

  it('bord trop loin : entre dans l’entrée d’immeuble la plus proche par le seuil (profondeur 0 → 1), jamais caché avant', () => {
    const w = walkOffOf({ id: 'a', outfitKey: 'q', x: 430, y: m.doorY + 3, yaw: YAW_LEFT, speed: 14, away: 1 }, 0, ctx({ width: 4000, doorXs: [700, 900] }));
    const end = clubWalkEnd(w);
    const sill = clubWalkAt(w, end - 0.1)!;
    expect(sill.where).toBe('door');
    expect(sill.where === 'door' && sill.passage.x).toBe(700);
    expect(sill.where === 'door' && sill.passage.depth).toBeGreaterThan(0.85);
    for (let t = 0; t < end - 0.01; t += 0.25) expect(clubWalkAt(w, t)).not.toBeNull();
  });

  it('arrivée qui sortait d’une entrée : y rentre (seuil jusqu’au fond)', () => {
    const w = walkOffOf({ id: 'a', outfitKey: 'q', x: 700, y: m.doorY, yaw: 4, speed: 14, away: 1, atDoor: 0.4 }, 0, ctx());
    expect(clubWalkAt(w, 0)!.where).toBe('door');
    const v = clubWalkAt(w, clubWalkEnd(w) - 0.01)!;
    expect(v.where === 'door' && v.passage.depth).toBeGreaterThan(0.95);
  });
});

describe('videurs : rentrée et sortie par la porte du club', () => {
  const post = (i: number, x: number, yaw: number) => ({ i, x, y: m.doorY + 1, yaw, doorX: 400, doorY: m.doorY, rect: door, k: 0.55 });
  it('rentrée : bras croisés jusqu’au départ, marche jusqu’à la porte, seuil de dos, puis à l’intérieur (caché)', () => {
    const w = bouncerLeaveOf(post(0, 394.5, 2), 10, 20);
    const before = clubWalkAt(w, 15)!;
    expect(before.where === 'street' && before.x).toBe(394.5);
    expect(before.pose.arms).toBe('crossed');
    const end = clubWalkEnd(w);
    const sill = clubWalkAt(w, end - 0.05)!;
    expect(sill.where).toBe('door');
    expect(sill.where === 'door' && sill.passage.depth).toBeGreaterThan(0.9);
    for (let t = 10; t < end - 0.01; t += 0.1) expect(clubWalkAt(w, t)).not.toBeNull();
    expect(clubWalkAt(w, end + 0.01)).toBeNull();
  });
  it('sortie (22 h 30) : sort de la porte de face, gagne son poste, se tourne vers la rue, bras croisés, et y reste', () => {
    const w = bouncerArriveOf(post(1, 405.5, 6), 50);
    const out = clubWalkAt(w, 50)!;
    expect(out.where === 'door' && out.passage.depth).toBe(1);
    const v = clubWalkAt(w, 200)!;
    expect(v.where === 'street' && v.x).toBe(405.5);
    expect(v.pose).toMatchObject({ yaw: 6, gait: 'stand', arms: 'crossed' });
    expect(BOUNCER_STAGGER_S).toBeGreaterThan(1);
  });
});

describe('cordon dégagé', () => {
  it('instant où la dernière personne a passé le cordon', () => {
    const near = walkOffOf({ id: 'a', outfitKey: 'q', x: 410, y: m.doorY + 3, yaw: YAW_LEFT, speed: 10, away: 1 }, 0, ctx());
    const far = walkOffOf({ id: 'b', outfitKey: 'q', x: 450, y: m.doorY + 3, yaw: YAW_LEFT, speed: 10, away: 1 }, 0, ctx());
    // Le premier passe x = 425 après son demi-tour (0,45 s) et 1,5 s de marche ; le second est déjà au-delà.
    expect(clearAt([near, far], 425, 1, 0)).toBeCloseTo(0.45 + 1.5, 6);
    expect(clearAt([far], 425, 1, 3)).toBe(3);
  });
});

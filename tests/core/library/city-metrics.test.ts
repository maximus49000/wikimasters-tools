import { describe, expect, it } from 'vitest';
import { CITY_GROUND, cityMetrics } from '../../../src/core/library/city/metrics';
import { CELL_H, WALL_ROWS } from '../../../src/core/library/room-grid';

describe('cityMetrics', () => {
  it('range sol, trottoir, deux files et trottoir d’en face du haut vers le bas', () => {
    const m = cityMetrics(340);
    expect(CITY_GROUND).toBe(0.7);
    expect(m.ground).toBeCloseTo(340 * 0.7, 5);
    expect(m.walkY).toBeGreaterThan(m.ground);
    expect(m.curb).toBeGreaterThan(m.walkY);
    expect(m.laneY.far).toBeGreaterThan(m.curb);
    expect(m.laneY.near).toBeGreaterThan(m.laneY.far);
    expect(m.farSide).toBeGreaterThan(m.laneY.near);
    expect(m.farSide).toBeLessThan(340);
    expect(m.unit).toBeCloseTo(1, 5);
    expect(cityMetrics(170).unit).toBeCloseTo(0.5, 5);
  });
  it('depuis la plus petite fenêtre posée tout en bas, on voit les deux files', () => {
    const wallH = WALL_ROWS * CELL_H;
    const m = cityMetrics(wallH);
    // Fenêtre de 3 lignes collée au bas du mur ; le verre est en retrait de 7 px dans le cadre.
    const glassTop = (WALL_ROWS - 3) * CELL_H + 7;
    const glassBottom = WALL_ROWS * CELL_H - 7;
    const carHeight = 21 * m.unit;
    expect(m.laneY.far - carHeight).toBeGreaterThanOrEqual(glassTop - 0.5); // voiture ≈ 18 px réels, 21 est une marge
    expect(m.laneY.near).toBeLessThanOrEqual(glassBottom - 10);
  });
});

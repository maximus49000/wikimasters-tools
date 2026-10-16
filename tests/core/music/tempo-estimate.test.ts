import { describe, expect, it } from 'vitest';
import { estimateBpm } from '../../../src/core/music/tempo-estimate';

const RATE = 22050;
const SECONDS = 30;

/** Générateur pseudo-aléatoire déterministe (mulberry32), pour des tests reproductibles. */
const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Bruit de fond faible (amplitude crête `level`). */
const noise = (level: number, seed = 1): Float32Array => {
  const random = rng(seed);
  const out = new Float32Array(RATE * SECONDS);
  for (let i = 0; i < out.length; i += 1) out[i] = (random() * 2 - 1) * level;
  return out;
};

/** Ajoute un clic court (5 ms de bruit décroissant) à l'instant `t` (s). */
const addClick = (out: Float32Array, t: number, gain: number, random: () => number) => {
  const start = Math.round(t * RATE);
  const length = Math.round(0.005 * RATE);
  for (let i = 0; i < length && start + i < out.length; i += 1) {
    const decay = Math.exp(-i / (length / 4));
    out[start + i] = (out[start + i] ?? 0) + (random() * 2 - 1) * gain * decay;
  }
};

/** Clics à tempo fixe sur 30 s ; `accent` = gain d'un temps sur deux (1 = tous égaux). */
const clicks = (bpm: number, accent = 1): Float32Array => {
  const out = noise(0.01);
  const random = rng(7);
  const period = 60 / bpm;
  let beat = 0;
  for (let t = 0.05; t < SECONDS; t += period, beat += 1) addClick(out, t, beat % 2 === 0 ? 0.8 : 0.8 * accent, random);
  return out;
};

const near = (value: number | null, expected: number, tolerance = 0.02) => {
  expect(value).not.toBeNull();
  expect(Math.abs((value as number) - expected) / expected).toBeLessThanOrEqual(tolerance);
};

describe('estimateBpm', () => {
  it.each([90, 120, 150])('trouve des clics à %i BPM (à 2 pour cent près)', (bpm) => {
    near(estimateBpm(clicks(bpm), RATE), bpm);
  });

  it('trouve des clics lents (70 BPM) sans les doubler', () => {
    near(estimateBpm(clicks(70), RATE), 70);
  });

  it('garde 120 BPM quand un temps sur deux est plus faible (accentuation)', () => {
    near(estimateBpm(clicks(120, 0.4), RATE), 120);
  });

  it('rend null pour le silence', () => {
    expect(estimateBpm(new Float32Array(RATE * SECONDS), RATE)).toBeNull();
  });

  it('rend null pour un bruit blanc seul', () => {
    expect(estimateBpm(noise(0.5, 3), RATE)).toBeNull();
  });

  it.each([[0.05, 11], [0.9, 12], [0.2, 13]])('rend null pour un bruit blanc (niveau %f, graine %i)', (level, seed) => {
    expect(estimateBpm(noise(level, seed), RATE)).toBeNull();
  });

  it('départage ×3/2 avec le hint : clics à 120 BPM, hint 178 → 180', () => {
    near(estimateBpm(clicks(120), RATE, 178), 180);
  });

  it('rend null pour un signal trop court', () => {
    expect(estimateBpm(clicks(120).subarray(0, RATE), RATE)).toBeNull();
  });

  it('départage ×2 avec le hint : clics à 140 BPM, hint 70 → 70', () => {
    near(estimateBpm(clicks(140), RATE, 70), 70);
  });

  it('ignore un hint nul ou absent', () => {
    near(estimateBpm(clicks(140), RATE, 0), 140);
    near(estimateBpm(clicks(140), RATE, null), 140);
  });

  it('ignore un hint sans rapport avec le tempo mesuré', () => {
    near(estimateBpm(clicks(140), RATE, 110), 140);
  });

  it('reste dans [60, 200] BPM', () => {
    const value = estimateBpm(clicks(200), RATE);
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThanOrEqual(60);
    expect(value as number).toBeLessThanOrEqual(200);
  });
});

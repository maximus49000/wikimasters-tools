// Visages des habitants 3D : clignement naturel (courbe, rythme), émotion tirée du geste, clé d'état des sprites,
// calque du visage lié à l'os de la tête.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  blendEmotion, blinkAt, blinkLevel, EMOTIONS, emotionFor, faceLayer, faceState, type Emotion,
} from '../../../src/core/citizens/face';
import type { FaceMarks } from '../../../src/core/citizens/manifest';
import { analyse } from '../../../src/core/citizens/wardrobe';
import { makeHumanoid } from './fixtures/humanoid';

// Débuts des clignements d'une graine (pas de 1 ms) : montée depuis 0 → début.
function starts(seed: number, from: number, to: number): number[] {
  const out: number[] = [];
  let prev = blinkAt(from - 1, seed);
  for (let t = from; t < to; t++) {
    const v = blinkAt(t, seed);
    if (prev === 0 && v > 0) out.push(t - 1);
    prev = v;
  }
  return out;
}

describe('blinkAt', () => {
  it('suit la courbe : 0 hors clignement, 1 de 70 à 110 ms, 0 à 240 ms', () => {
    const seed = 7;
    const s = starts(seed, 0, 60_000)[0]!;
    expect(blinkAt(s, seed)).toBe(0);
    expect(blinkAt(s + 35, seed)).toBeGreaterThan(0);
    expect(blinkAt(s + 35, seed)).toBeLessThan(1);
    for (const x of [70, 80, 90, 100, 110]) expect(blinkAt(s + x, seed)).toBe(1);
    expect(blinkAt(s + 175, seed)).toBeGreaterThan(0);
    expect(blinkAt(s + 175, seed)).toBeLessThan(1);
    expect(blinkAt(s + 240, seed)).toBe(0);
    expect(blinkAt(s - 500, seed)).toBe(0);
  });

  it('espace les débuts de 2 à 6 s (hors doubles), avec ~15 % de doubles', () => {
    let doubles = 0, total = 0;
    for (const seed of [1, 2, 3, 42]) {
      const st = starts(seed, 0, 600_000);
      // Doubles : second début collé à la fin du premier (240 ms + 80–120 ms).
      const primaries: number[] = [];
      for (let i = 0; i < st.length; i++) {
        const gap = i > 0 ? st[i]! - st[i - 1]! : Infinity;
        if (gap < 1000) {
          expect(gap).toBeGreaterThanOrEqual(240 + 80 - 1);
          expect(gap).toBeLessThanOrEqual(240 + 120 + 1);
          doubles++;
        } else primaries.push(st[i]!);
      }
      for (let i = 1; i < primaries.length; i++) {
        const d = primaries[i]! - primaries[i - 1]!;
        expect(d).toBeGreaterThanOrEqual(2000 - 1);
        expect(d).toBeLessThanOrEqual(6000 + 1);
      }
      total += primaries.length;
    }
    expect(doubles / total).toBeGreaterThan(0.08);
    expect(doubles / total).toBeLessThan(0.22);
  });

  it('est déterministe par graine et diffère selon la graine', () => {
    expect(starts(5, 0, 30_000)).toEqual(starts(5, 0, 30_000));
    expect(starts(5, 0, 30_000)).not.toEqual(starts(6, 0, 30_000));
  });

  it('reste rapide pour un temps lointain (10 h)', () => {
    const t0 = performance.now();
    let acc = 0;
    for (let i = 0; i < 2000; i++) acc += blinkAt(3.6e7 + i * 17, 9);
    expect(Number.isFinite(acc)).toBe(true);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('emotionFor', () => {
  it('suit la table des gestes', () => {
    expect(emotionFor('toast-1', 'neutre')).toBe('heureux');
    for (const a of ['pay-card', 'pay-cash', 'take', 'give', 'wave'] as const) expect(emotionFor(a, 'triste')).toBe('content');
    for (const a of ['toast-2', 'cheer', 'raise'] as const) expect(emotionFor(a, 'neutre')).toBe('heureux');
    expect(emotionFor('sneeze', 'content')).toBe('surpris');
    for (const a of ['crossed', 'chin'] as const) expect(emotionFor(a, 'neutre')).toBe('inquiet');
    expect(emotionFor('swing', 'fache')).toBe('fache');
  });
});

describe('faceState', () => {
  it('donne une clé courte, vide pour neutre yeux ouverts', () => {
    expect(faceState('neutre', 0)).toBe('');
    expect(faceState('neutre', 0.1)).toBe('');
    expect(faceState('neutre', 1)).not.toBe('');
    expect(faceState('neutre', 0.5)).not.toBe(faceState('neutre', 1));
    const keys = new Set((Object.keys(EMOTIONS) as Emotion[]).map((e) => faceState(e, 0)));
    expect(keys.size).toBe(7);
    // Yeux déjà fermés (heureux) : le clignement ne change rien à l'image.
    expect(faceState('heureux', 1)).toBe(faceState('heureux', 0));
    for (const e of Object.keys(EMOTIONS) as Emotion[]) expect(faceState(e, 1).length).toBeLessThanOrEqual(3);
    expect(blinkLevel(0.1)).toBe(0);
    expect(blinkLevel(0.5)).toBe(0.5);
    expect(blinkLevel(0.9)).toBe(1);
  });
});

describe('blendEmotion', () => {
  it('part de la première émotion et arrive à la seconde', () => {
    expect(blendEmotion('neutre', 'heureux', 0)).toEqual(EMOTIONS.neutre);
    expect(blendEmotion('neutre', 'heureux', 1)).toEqual(EMOTIONS.heureux);
    expect(blendEmotion('heureux', 'neutre', 1)).toEqual(EMOTIONS.neutre);
    const mid = blendEmotion('neutre', 'heureux', 0.5);
    expect(mid.mC).toBeGreaterThan(0);
    expect(mid.mC).toBeLessThan(EMOTIONS.heureux.mC);
    // Les traits redessinés restent affichés pendant la transition.
    expect(mid.on).toBe(1);
    expect(blendEmotion('heureux', 'neutre', 0.9).mOn).toBe(1);
  });
});

describe('faceLayer', () => {
  const marks: FaceMarks = {
    eyes: [{ s: 0.18, u: 0.05, w: 0.12, h: 0.06 }, { s: -0.18, u: 0.05, w: 0.12, h: 0.06 }],
    brows: [{ s: 0.18, u: 0.16, w: 0.14, h: 0.03 }, { s: -0.18, u: 0.16, w: 0.14, h: 0.03 }],
    mouthU: -0.3,
    lidSkin: [[220, 180, 150], [215, 175, 145]],
    browSkin: [[225, 185, 155], [222, 182, 152]],
    mouthSkin: [200, 150, 130],
  };
  const body = makeHumanoid();
  const A = analyse(body);

  it('pose une coque non vide liée à 100 % à l’os de la tête du corps donné', () => {
    const clone = (cloneSkinned(body) as THREE.SkinnedMesh);
    const face = faceLayer(A, marks, '#c08060', '#d8a888', clone);
    expect(face).toBeInstanceOf(THREE.SkinnedMesh);
    expect(face.skeleton).toBe(clone.skeleton);
    const g = face.geometry, SI = g.attributes.skinIndex!, SW = g.attributes.skinWeight!;
    expect(SI.count).toBeGreaterThan(0);
    for (let i = 0; i < SI.count; i++) {
      expect(SI.getX(i)).toBe(A.idx.Head);
      expect(SW.getX(i)).toBe(1);
      expect(SW.getY(i) + SW.getZ(i) + SW.getW(i)).toBe(0);
    }
    expect(g.attributes.bindPos).toBeDefined();
  });

  it('fige l’état demandé dans les uniformes', () => {
    const face = faceLayer(A, marks, '#c08060', '#d8a888');
    const U = face.userData.face as Record<string, { value: number }>;
    expect(U.uLid!.value).toBe(0);
    expect(U.uMOn!.value).toBe(0);
    face.userData.set('heureux', 1);
    expect(U.uLid!.value).toBe(1);
    expect(U.uHappy!.value).toBe(1);
    expect(U.uMC!.value).toBe(EMOTIONS.heureux.mC);
    expect(U.uTeeth!.value).toBe(1);
    expect(U.uMOn!.value).toBe(1);
    face.userData.set('triste', 0.5);
    expect(U.uLid!.value).toBeCloseTo(0.3 + 0.5 * 0.7);
    expect(U.uHappy!.value).toBe(0);
    face.userData.set(blendEmotion('neutre', 'surpris', 0.5), 0);
    expect(U.uMT!.value).toBeGreaterThan(0);
  });

  it('teinte les caches à la peau choisie (rapport à la peau de la base)', () => {
    const same = faceLayer(A, marks, '#d8a888', '#d8a888');
    const dark = faceLayer(A, marks, '#6c5444', '#d8a888');
    const c1 = (same.userData.face as Record<string, { value: THREE.Color }>).uLidL!.value;
    const c2 = (dark.userData.face as Record<string, { value: THREE.Color }>).uLidL!.value;
    expect(c2.r).toBeLessThan(c1.r);
  });
});

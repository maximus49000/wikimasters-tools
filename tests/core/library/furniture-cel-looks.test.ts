import { describe, expect, it } from 'vitest';
import '../../../src/core/library/cel/models/steampunk';
import { ROOM_CAMERA, yawOf } from '../../../src/core/library/cel/camera';
import { REST_LIFE } from '../../../src/core/library/cel/life-state';
import { lookOf, type CelLook } from '../../../src/core/library/cel/looks';
import { CEL_MODELS, CEL_TRIMS, celPartsOf } from '../../../src/core/library/cel/models';
import { renderCel } from '../../../src/core/library/cel/raster';
import { spriteKey } from '../../../src/core/library/cel/sprite-key';
import { tone } from '../../../src/core/library/cel/tone';
import { STEAMPUNK_ONLY } from '../../../src/core/library/furniture-catalog';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { STANDING_KINDS, STYLE_IDS, type StandingKind, type StyleId } from '../../../src/core/library/library-types';
import { hexRgb } from '../../../src/core/library/paint/color';
import { paletteOf } from '../../../src/core/library/styles';
import { boundsOf, checkCelModel, SHADE_FLOOR_STYLE } from './furniture-cel-checks';

// Meubles dont la GÉOMÉTRIE change d'un style à l'autre (pieds, capitons, rivets, plaid, motif, liseré, garnitures) : les contrôles
// complets sont rejoués pour eux dans chaque style où ils changent (les autres ne changent que de couleurs : contrôlés en scandinave).
const LEGGED = ['sofa', 'loveseat', 'armchair', 'club-chair', 'daybed', 'chair', 'desk', 'coffee-table'] as const;
const CHANGED: Record<Exclude<StyleId, 'scandinave'>, readonly StandingKind[]> = {
  moderne: LEGGED,
  industriel: LEGGED,
  japandi: LEGGED,
  boheme: [...LEGGED, 'bench', 'rug'], // tournés + losanges + franges
  retro70: [...LEGGED, 'rug'], // compas + rayures
  neon: [...LEGGED, 'bench', 'square-pouf', 'rug', 'shelf'], // liseré
  steampunk: [...LEGGED, 'bench', 'square-pouf', 'lamp', 'paper-lantern', 'arc-lamp'], // griffes + capitons + rivets + garnitures
};
const STEAMPUNK_TRIMMED = ['desk', 'armchair', 'lamp', 'paper-lantern', 'arc-lamp'] as const;
const dist = (a: string, b: string): number => {
  const [p, q] = [hexRgb(a), hexRgb(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const lum = (c: string): number => {
  const [r, g, b] = hexRgb(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
const view = (angle: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7) => ({ cam: ROOM_CAMERA, yaw: yawOf(angle), side: 'left' as const, px: 1, ss: 1 });
// Garnitures et habillages (rivets, franges, plaid, liseré, garniture Steampunk) : comptés à part de l'encombrement.
const body = (L: CelLook, k: StandingKind) => celPartsOf(k, L, REST_LIFE).filter((P) => !P.trim);

describe('styles cellulo', () => {
  it('huit allures : variantes de la maquette (l. 174-178) et du brief, sol = palette.floor', () => {
    const v = (s: StyleId) => lookOf(s).variant;
    expect(v('scandinave')).toEqual({ legs: 'taper', tufted: false, rivets: false, throw: 'plain', pattern: 'none' });
    expect(v('moderne')).toEqual({ legs: 'straight', tufted: false, rivets: false, throw: 'none', pattern: 'none' });
    expect(v('industriel')).toEqual({ legs: 'hairpin', tufted: false, rivets: false, throw: 'none', pattern: 'none' });
    expect(v('boheme')).toEqual({ legs: 'turned', tufted: false, rivets: false, throw: 'fringed', pattern: 'diamonds' });
    expect(v('retro70')).toEqual({ legs: 'compass', tufted: false, rivets: false, throw: 'none', pattern: 'stripes' });
    expect(v('japandi')).toEqual({ legs: 'block', tufted: false, rivets: false, throw: 'none', pattern: 'none' });
    expect(v('neon')).toEqual({ legs: 'straight', tufted: false, rivets: false, throw: 'none', pattern: 'neon-edge' });
    expect(v('steampunk')).toEqual({ legs: 'claw', tufted: true, rivets: true, throw: 'none', pattern: 'none' });
    for (const s of STYLE_IDS) {
      expect(lookOf(s).floor).toBe(paletteOf(s).floor);
      expect(lookOf(s).style).toBe(s);
      expect(lookOf(s)).toBe(lookOf(s)); // calculée une fois (comparaisons par identité des teintes)
    }
  });

  it('les couleurs viennent de la palette du style', () => {
    expect(lookOf('boheme').tones.fabric.base).toBe(paletteOf('boheme').fabric);
    for (const s of STYLE_IDS) for (const [k, c] of Object.entries(paletteOf(s))) expect((lookOf(s).tones as Record<string, { base: string }>)[k]!.base, `${s} ${k}`).toBe(c);
  });

  it('teintes : l’ombre est toujours plus sombre que l’aplat (même sur les palettes sombres), le rehaut jamais plus sombre', () => {
    for (const s of STYLE_IDS)
      for (const [k, t] of Object.entries(lookOf(s).tones)) {
        expect(lum(t.shade), `${s} ${k} : ombre ${t.shade} vs aplat ${t.base}`).toBeLessThan(lum(t.base) - 0.004);
        expect(lum(t.hi), `${s} ${k} : rehaut`).toBeGreaterThanOrEqual(lum(t.base) - 0.02); // (le blanc n'a pas de rehaut plus clair : crème)
      }
    // Les teintes claires gardent la recette de la maquette (ombre = mélange COOL à 32 %) : le scandinave validé ne bouge pas, sauf sa
    // porte (#6B5B45, luminance 0,37 : l'ombre de la recette n'était plus sombre que de 6 %).
    for (const [k, c] of Object.entries(paletteOf('scandinave'))) if (k !== 'door') expect((lookOf('scandinave').tones as Record<string, unknown>)[k], k).toEqual(tone(c));
    expect(lookOf('scandinave').tones.door).not.toEqual(tone(paletteOf('scandinave').door));
    expect(lookOf('neon').tones.wood).not.toEqual(tone(paletteOf('neon').wood));
  });

  it('clés choisies par style : plaid ≠ tapis, coussin du panier lisible dans la vannerie, pompon lisible sur son plateau', () => {
    for (const s of STYLE_IDS) {
      const L = lookOf(s), p = paletteOf(s);
      if (L.variant.throw !== 'none') {
        expect(dist(p[L.pick.throw], p.rug), `${s} : plaid vs tapis`).toBeGreaterThanOrEqual(55);
        expect(dist(p[L.pick.throw], p.fabricDark), `${s} : plaid vs accoudoir`).toBeGreaterThanOrEqual(55);
      }
      expect(dist(p[L.pick.cushion], p.warm), `${s} : coussin vs vannerie`).toBeGreaterThanOrEqual(55);
      expect(dist(p[L.pick.tassel], p.fabricDark), `${s} : pompon vs plateau`).toBeGreaterThanOrEqual(55);
    }
    // Les pièces lisent ces clés.
    const sk = lookOf('steampunk');
    expect(celPartsOf('basket', sk, REST_LIFE).some((P) => P.col === sk.tones[sk.pick.cushion])).toBe(true);
    expect(celPartsOf('cat-tree', sk, REST_LIFE).some((P) => P.col === sk.tones[sk.pick.tassel])).toBe(true);
    const sc = lookOf('scandinave');
    expect(celPartsOf('sofa', sc, REST_LIFE).some((P) => P.trim && P.col === sc.tones[sc.pick.throw])).toBe(true);
  });

  it('8 styles × 36 meubles : construits sans erreur, même volume à 1 cm près (garnitures comptées à part, dans la boîte à 2 cm près)', () => {
    for (const k of STANDING_KINDS) {
      const ref = boundsOf(body(lookOf('scandinave'), k));
      const m = FURNITURE_MODELS[k];
      for (const s of STYLE_IDS) {
        if (s !== 'steampunk' && STEAMPUNK_ONLY.includes(k)) continue;
        const parts = celPartsOf(k, lookOf(s), REST_LIFE);
        expect(parts.length).toBeGreaterThan(0);
        if (!STEAMPUNK_ONLY.includes(k)) {
          const b = boundsOf(parts.filter((P) => !P.trim));
          b.forEach((v, i) => expect(Math.abs(v - ref[i]!), `${k} ${s} : cadre[${i}] ${v} vs ${ref[i]}`).toBeLessThanOrEqual(1));
        }
        const [x0, x1, y0, y1, z0, z1] = boundsOf(parts);
        expect(x0, `${k} ${s}`).toBeGreaterThanOrEqual(-m.w / 2 - 2);
        expect(x1, `${k} ${s}`).toBeLessThanOrEqual(m.w / 2 + 2);
        expect(y0, `${k} ${s}`).toBeGreaterThanOrEqual(-2);
        expect(y1, `${k} ${s}`).toBeLessThanOrEqual(m.h + 2);
        expect(z0, `${k} ${s}`).toBeGreaterThanOrEqual(-m.d / 2 - 2);
        expect(z1, `${k} ${s}`).toBeLessThanOrEqual(m.d / 2 + 2);
        // Toutes les teintes viennent de la palette du style (le papier de la lanterne : voir lights-pets).
        if (k !== 'paper-lantern') {
          const palette = new Set(Object.values(lookOf(s).tones));
          for (const P of parts) expect(palette.has(P.col), `${k} ${s} : teinte hors palette`).toBe(true);
        }
      }
    }
  });

  it('les variantes se voient : à l’angle 0, le canapé n’a pas la même image dans deux styles aux variantes différentes', () => {
    const img = (s: StyleId) => renderCel(celPartsOf('sofa', lookOf(s), REST_LIFE), view(0)).rgba;
    const a = img('moderne'), b = img('steampunk'), c = img('boheme'), d = img('retro70'), e = img('neon');
    expect(a).not.toEqual(b);
    expect(c).not.toEqual(d);
    expect(d).not.toEqual(e);
    // Steampunk : rivets (ton metal) saillants sur la face avant de l'assise et sur les flancs des accoudoirs (hors du volume).
    const sk = lookOf('steampunk');
    const rivets = celPartsOf('sofa', sk, REST_LIFE).filter((P) => P.trim && P.col === sk.tones.metal);
    expect(rivets.length).toBeGreaterThan(10);
    const [, bx1, , , , bz1] = boundsOf(body(sk, 'sofa'));
    expect(Math.max(...rivets.flatMap((P) => P.m.v.map((v) => v[0])))).toBeGreaterThan(bx1 + 0.3);
    expect(Math.max(...rivets.flatMap((P) => P.m.v.map((v) => v[2])))).toBeGreaterThan(bz1 + 0.3);
    // Capitons : boutons sombres (door) devant les coussins de dos, et l'image change par rapport à une allure sans capitons.
    const buttons = celPartsOf('sofa', sk, REST_LIFE).filter((P) => P.trim && P.col === sk.tones.door);
    expect(buttons.length).toBeGreaterThanOrEqual(6);
    const noTuft: CelLook = { ...sk, variant: { ...sk.variant, tufted: false } };
    expect(renderCel(celPartsOf('sofa', noTuft, REST_LIFE), view(0)).rgba).not.toEqual(img('steampunk'));
    // Néon : des pièces lumineuses au ton `edge`.
    const ne = lookOf('neon');
    expect(celPartsOf('sofa', ne, REST_LIFE).some((P) => P.glow && P.col === ne.tones.edge)).toBe(true);
    expect(celPartsOf('rug', ne, REST_LIFE).some((P) => P.glow && P.col === ne.tones.edge)).toBe(true);
    // Rétro 70 : des rayures (ton warm) sur les coussins de dos.
    const r7 = lookOf('retro70');
    expect(celPartsOf('sofa', r7, REST_LIFE).filter((P) => P.trim && P.col === r7.tones.warm).length).toBeGreaterThanOrEqual(3);
  });

  it('globe, télescope, automate : dessin propre, contrôles complets du modèle', () => {
    for (const k of ['globe', 'telescope', 'automaton'] as const) {
      expect(CEL_MODELS[k], k).toBeDefined();
      checkCelModel(k, lookOf('steampunk'));
    }
  });

  it('garnitures cellulo Steampunk : dessinées pour les cinq meubles garnis, marquées à part, absentes des autres styles', () => {
    for (const k of STEAMPUNK_TRIMMED) {
      expect(CEL_TRIMS[k], k).toBeDefined();
      const sk = celPartsOf(k, lookOf('steampunk'), REST_LIFE), sc = celPartsOf(k, lookOf('scandinave'), REST_LIFE);
      expect(sk.filter((P) => P.trim).length, k).toBeGreaterThanOrEqual(3);
      expect(sk.length).toBeGreaterThan(sc.length);
      // Même corps de meuble (les garnitures s'ajoutent, rien n'est retiré ni déplacé).
      expect(sk.filter((P) => !P.trim).length).toBe(sc.filter((P) => !P.trim).length);
    }
  });

  for (const [s, kinds] of Object.entries(CHANGED) as [StyleId, readonly StandingKind[]][])
    it(`${s} : les meubles dont la géométrie change passent les contrôles complets (encombrement, dessus, ombre, encre) aux 8 angles`, () => {
      for (const k of kinds) checkCelModel(k, lookOf(s));
    }, 180_000);

  it('planchers d’ombre par style : seulement les pieds épingle de l’Industriel (mesures dans furniture-cel-checks)', () => {
    expect(SHADE_FLOOR_STYLE).toEqual({ industriel: { 'coffee-table': 0.03, chair: 0.06, desk: 0.06 }, boheme: { rug: 0.002 } });
  });

  it('clé de sprite : version 16 du dessin', () => {
    expect(spriteKey({ kind: 'sofa', angle: 0, style: 'neon', side: 'left', cam: 'room', res: 3, lit: false, life: '' })).toMatch(/^cel16\|/);
  });
});

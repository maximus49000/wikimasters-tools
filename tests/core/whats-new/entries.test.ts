import { describe, expect, it } from 'vitest';
import { ENTRIES } from '../../../src/core/whats-new/entries';
import { THEMES } from '../../../src/core/whats-new/types';

describe('catalogue des fiches', () => {
  it('a des identifiants uniques et des champs renseignés', () => {
    const ids = ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const themes = new Set(THEMES.map((t) => t.id));
    for (const e of ENTRIES) {
      expect(e.title.trim(), e.id).not.toBe('');
      expect(e.summary.trim(), e.id).not.toBe('');
      expect(e.glyph.trim(), e.id).not.toBe('');
      expect(themes.has(e.theme), e.id).toBe(true);
      expect(e.steps.length, e.id).toBeGreaterThan(0);
      for (const s of e.steps) {
        expect(s.title.trim(), e.id).not.toBe('');
        expect(s.text.trim(), e.id).not.toBe('');
        if (s.target !== null) expect(s.target.trim(), e.id).not.toBe('');
      }
    }
  });

  it('une seule fiche est annoncée au premier lancement (celle de WikiHow)', () => {
    expect(ENTRIES.filter((e) => e.fresh).map((e) => e.id)).toEqual(['wikihow']);
  });

  it('est didactique : chaque étape explique à quoi sert l’élément et donne au moins deux paragraphes titrés', () => {
    for (const e of ENTRIES) {
      for (const s of e.steps) {
        expect(s.text.length, `${e.id} / ${s.title}`).toBeGreaterThan(60);
        expect(s.details?.length ?? 0, `${e.id} / ${s.title}`).toBeGreaterThanOrEqual(2);
        for (const d of s.details ?? []) {
          expect(d.label.trim(), e.id).not.toBe('');
          expect(d.text.trim().length, `${e.id} / ${d.label}`).toBeGreaterThan(20);
        }
      }
    }
  });

  it('a des scènes cohérentes : une scène suppose une cible, une page commence par « / »', () => {
    for (const e of ENTRIES) {
      for (const s of e.steps) {
        if (!s.scene) continue;
        expect(s.target, `${e.id} / ${s.title}`).not.toBeNull();
        if (s.scene.page) expect(s.scene.page.startsWith('/'), e.id).toBe(true);
        for (const item of s.scene.reveal ?? []) expect(typeof item === 'string' ? item.trim() : item.text.trim(), e.id).not.toBe('');
      }
    }
  });

  it('couvre les interfaces : pages du site, menu Plus et fiches de carte de chaque nature', () => {
    const scenes = ENTRIES.flatMap((e) => e.steps.map((s) => s.scene).filter((x) => x !== undefined));
    expect(scenes.some((x) => x.page === '/collection')).toBe(true);
    expect(scenes.some((x) => x.page === '/marketplace')).toBe(true);
    expect(scenes.some((x) => x.reveal?.some((r) => typeof r !== 'string' && r.text === 'Plus'))).toBe(true);
    for (const kind of ['any', 'music', 'screen', 'game']) expect(scenes.some((x) => x.card === kind), kind).toBe(true);
  });

  it('montre chaque geste : un clic fait seul par la visite (reveal) est précédé d’une étape qui le montre avec un geste', () => {
    for (const e of ENTRIES) {
      e.steps.forEach((step, i) => {
        for (const item of step.scene?.reveal ?? []) {
          const wanted = typeof item === 'string' ? item : `text=${item.text}`;
          const shown = e.steps.slice(0, i).some((earlier) => earlier.target === wanted && earlier.gesture !== undefined);
          expect(shown, `${e.id} / ${step.title} : aucun geste montré pour « ${wanted} »`).toBe(true);
        }
      });
    }
  });

  it('une étape facultative a une cible, et une étape à geste explique la consigne dans ses paragraphes', () => {
    for (const e of ENTRIES) {
      for (const step of e.steps) {
        if (step.optional) expect(step.target, `${e.id} / ${step.title}`).not.toBeNull();
        if (step.gesture) expect(step.details?.some((d) => d.label === 'Comment faire'), `${e.id} / ${step.title}`).toBe(true);
      }
    }
  });
});

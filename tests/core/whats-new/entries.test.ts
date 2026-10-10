/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { ENTRIES, SPOTIFY_KEY_GUIDE } from '../../../src/core/whats-new/entries';
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

  it('explique comment utiliser sa propre clé Spotify (fiche écoute à jour, ancien id retiré)', () => {
    expect(ENTRIES.some((e) => e.id === 'ecouter')).toBe(false);
    const entry = ENTRIES.find((e) => e.id === 'ecouter-v2');
    const step = entry?.steps.find((s) => s.title === 'Utiliser sa propre clé Spotify');
    expect(step).toBe(SPOTIFY_KEY_GUIDE);
    expect(step?.target).toBeNull();
    expect(step?.scene).toBeUndefined();
    const all = (step?.details ?? []).map((d) => d.text).join(' ') + ' ' + (step?.text ?? '');
    for (const word of ['developer.spotify.com', 'Redirect URI', 'Client ID', 'User Management', '25']) expect(all, word).toContain(word);
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

  it('chaque repère data-wmt-* visé par une étape existe dans le code (pas de cible morte)', () => {
    // Toutes les sources de l'extension, lues en texte, sauf le catalogue lui-même (il cite les repères qu'il vise).
    const sources = import.meta.glob('../../../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const source = Object.entries(sources)
      .filter(([path]) => !path.endsWith('whats-new/entries.ts'))
      .map(([, text]) => text)
      .join(' ');
    const selectors = ENTRIES.flatMap((e) => e.steps.flatMap((step) => [step.target, ...(step.scene?.reveal ?? []).filter((r): r is string => typeof r === 'string')])).filter((t): t is string => t !== null);
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    for (const selector of selectors) {
      for (const match of selector.matchAll(/data-wmt-[a-z-]+/g)) expect(source.includes(match[0]), `repère introuvable : ${match[0]} (cible ${selector})`).toBe(true);
    }
  });

  it('les fiches qui montrent un chemin d’interface éclairent chacune de leurs étapes : Publicité d’achat et La visite guidée', () => {
    for (const e of ENTRIES.filter((x) => x.id.startsWith('publicite-achat') || x.id.startsWith('visite-guidee'))) {
      for (const step of e.steps) expect(step.target, `${e.id} / ${step.title}`).not.toBeNull();
    }
  });

  it('la fiche bibliotheque-v11 présente le robot, sa station et ses limites', () => {
    const entry = ENTRIES.find((e) => e.id === 'bibliotheque-v11');
    expect(entry).toBeDefined();
    const text = entry!.steps.map((s) => `${s.title} ${s.text} ${(s.details ?? []).map((d) => `${d.label} ${d.text}`).join(' ')}`).join(' ');
    for (const word of ['robot', 'Station de recharge', 'veille', 'Limites', 'Trois animaux']) expect(text, word).toContain(word);
    expect(entry!.steps.some((s) => s.target === '[data-wmt-library] [data-action="adopt-robot"]')).toBe(true);
    expect(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v11')).toBeGreaterThan(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v10'));
  });

  it('la fiche bibliotheque-v17 présente les ombres des animaux et leurs limites', () => {
    const entry = ENTRIES.find((e) => e.id === 'bibliotheque-v17');
    expect(entry).toBeDefined();
    const text = entry!.steps.map((s) => `${s.title} ${s.text} ${(s.details ?? []).map((d) => `${d.label} ${d.text}`).join(' ')}`).join(' ');
    for (const word of ['ombre', 'chat', 'chien', 'robot', 'Limites']) expect(text, word).toContain(word);
    expect(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v17')).toBeGreaterThan(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v15'));
  });

  it('la fiche bibliotheque-v18 présente les réactions au contexte et leurs limites', () => {
    const entry = ENTRIES.find((e) => e.id === 'bibliotheque-v18');
    expect(entry).toBeDefined();
    expect(entry!.steps.length).toBe(4);
    expect(entry!.steps.map((s) => s.title).join(' ')).toMatch(/nuit/i);
    expect(entry!.steps.flatMap((s) => s.details ?? []).some((d) => d.label === 'Limites')).toBe(true);
    expect(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v18')).toBeGreaterThan(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v17'));
  });

  it('la fiche bibliotheque-v24 présente le personnel, les gestes, les terrasses, la boîte de nuit, le déménagement et leurs limites', () => {
    const entry = ENTRIES.find((e) => e.id === 'bibliotheque-v24');
    expect(entry).toBeDefined();
    expect(entry!.steps).toHaveLength(5);
    const text = entry!.steps.map((s) => `${s.title} ${s.text} ${(s.details ?? []).map((d) => `${d.label} ${d.text}`).join(' ')}`).join(' ');
    for (const word of ['rideau', 'relais', 'gestes', 'terrasse', 'parasols', 'videurs', 'file', 'camion', 'déménageurs', '22 h à 7 h', '4 pixels', 'Limites']) expect(text, word).toContain(word);
    for (const step of entry!.steps) expect(step.details?.some((d) => d.label === 'Limites'), step.title).toBe(true);
    // La fiche précédente reste telle quelle, la nouvelle vient après.
    expect(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v24')).toBeGreaterThan(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v23'));
    expect(ENTRIES.find((e) => e.id === 'bibliotheque-v23')!.title).toBe('La rue commerçante');
  });

  it('la fiche bibliotheque-v25 présente les fêtes, le père Noël, les feux d’artifice et leurs limites', () => {
    const entry = ENTRIES.find((e) => e.id === 'bibliotheque-v25');
    expect(entry).toBeDefined();
    expect(entry!.steps).toHaveLength(3);
    const text = entry!.steps.map((s) => `${s.title} ${s.text} ${(s.details ?? []).map((d) => `${d.label} ${d.text}`).join(' ')}`).join(' ');
    for (const word of ['24 décembre', 'traîneau', '15 minutes', 'cheminée', '31 décembre', '14 juillet', 'pluie', 'Limites']) expect(text, word).toContain(word);
    for (const step of entry!.steps) expect(step.details?.some((d) => d.label === 'Limites'), step.title).toBe(true);
    expect(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v25')).toBeGreaterThan(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v24'));
  });
});

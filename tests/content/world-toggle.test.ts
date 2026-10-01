// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findRarityFilterAnchor } from '../../src/content/collection-dom';
import { readView, writeView } from '../../src/content/collection-view';
import { ensureViewSwitch } from '../../src/content/world-toggle';

function makeSelect(): HTMLButtonElement {
  document.body.innerHTML =
    '<div id="bar"><button type="button" class="px-3 rounded-lg">Sélectionner</button></div>';
  return document.querySelector('button') as HTMLButtonElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('readView / writeView', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
  };

  it("vaut « homemade » quand aucune vue n'est mémorisée, et relit ce qui a été écrit", () => {
    const storage = memory();
    expect(readView(storage)).toBe('homemade');
    writeView(storage, 'world');
    expect(readView(storage)).toBe('world');
    writeView(storage, 'list');
    expect(readView(storage)).toBe('list');
    writeView(storage, 'timeline');
    expect(readView(storage)).toBe('timeline');
  });

  it("ignore une valeur inconnue", () => {
    const storage = memory();
    storage.setItem('wmt:collectionView', 'autre');
    expect(readView(storage)).toBe('homemade');
  });

  it("absorbe les erreurs de stockage", () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
    };
    expect(readView(broken)).toBe('homemade');
    expect(() => writeView(broken, 'world')).not.toThrow();
  });
});

describe('ensureViewSwitch', () => {
  const NAMES = ['Homemade', 'Monde', 'Chronologique', 'Grille'];

  it("insère quatre boutons en glyphes juste après l'ancre, Homemade en tête et la Grille à droite", () => {
    const select = makeSelect();
    const group = ensureViewSwitch(select, select, 'homemade', () => undefined);

    expect(select.nextElementSibling).toBe(group);
    const buttons = [...group.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('data-wmt-view'))).toEqual(['homemade', 'world', 'timeline', 'list']);
    expect(buttons.map((b) => b.getAttribute('aria-label')?.split(' ')[0])).toEqual(NAMES.map((name) => name.split(' ')[0]));
    expect(buttons.every((b) => b.textContent === '')).toBe(true);
    expect(buttons.every((b) => b.querySelector('svg') !== null)).toBe(true);
    expect(buttons.every((b) => b.className === select.className)).toBe(true);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
  });

  it("est idempotent et met à jour la vue active", () => {
    const select = makeSelect();
    const first = ensureViewSwitch(select, select, 'homemade', () => undefined);
    const second = ensureViewSwitch(select, select, 'timeline', () => undefined);

    expect(second).toBe(first);
    expect(document.querySelectorAll('[data-wmt-view-switch]')).toHaveLength(1);
    expect([...second.querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false']);
  });

  it("ne copie ni id, ni disabled, ni l'aria-label du bouton modèle", () => {
    document.body.innerHTML = '<div><button type="button" id="sel" disabled aria-label="x" class="a">Sélectionner</button></div>';
    const select = document.querySelector('button') as HTMLButtonElement;
    const group = ensureViewSwitch(select, select, 'homemade', () => undefined);

    for (const button of group.querySelectorAll('button')) {
      expect(button.hasAttribute('id')).toBe(false);
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-label')).not.toBe('x');
      expect(button.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it("appelle le dernier gestionnaire fourni avec la vue cliquée", () => {
    const select = makeSelect();
    const oldHandler = vi.fn();
    const newHandler = vi.fn();
    ensureViewSwitch(select, select, 'homemade', oldHandler);
    const group = ensureViewSwitch(select, select, 'homemade', newHandler);
    (group.querySelector('[data-wmt-view="timeline"]') as HTMLButtonElement).click();

    expect(oldHandler).not.toHaveBeenCalled();
    expect(newHandler).toHaveBeenCalledWith('timeline');
  });
});

describe('findRarityFilterAnchor', () => {
  const pills = '<button>L</button><button>UR</button><button>SR</button><button>R</button><button>PC</button><button>C</button>';

  it("trouve la dernière pastille de rareté", () => {
    document.body.innerHTML = `<div id="g">${pills}</div>`;
    expect(findRarityFilterAnchor(document)?.textContent).toBe('C');
  });

  it("ignore notre propre sélecteur déjà inséré dans la rangée", () => {
    document.body.innerHTML = `<div id="g">${pills}</div>`;
    const anchor = findRarityFilterAnchor(document) as HTMLButtonElement;
    ensureViewSwitch(anchor, anchor, 'list', () => undefined);
    expect(findRarityFilterAnchor(document)).toBe(anchor);
  });

  it("renvoie null sans groupe de rareté", () => {
    document.body.innerHTML = '<div><button>Sélectionner</button><button>Trier</button></div>';
    expect(findRarityFilterAnchor(document)).toBeNull();
  });
});

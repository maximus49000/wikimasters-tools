// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readView, writeView } from '../../src/content/collection-view';
import { ensureWorldToggle } from '../../src/content/world-toggle';

function makeSelect(): HTMLButtonElement {
  document.body.innerHTML =
    '<div id="bar"><button type="button" class="px-3 rounded-lg">Sélectionner</button></div>';
  return document.querySelector('button') as HTMLButtonElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('readView / writeView', () => {
  it("vaut « list » par défaut et relit ce qui a été écrit", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
    expect(readView(storage)).toBe('list');
    writeView(storage, 'world');
    expect(readView(storage)).toBe('world');
    writeView(storage, 'list');
    expect(readView(storage)).toBe('list');
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
    expect(readView(broken)).toBe('list');
    expect(() => writeView(broken, 'world')).not.toThrow();
  });
});

describe('ensureWorldToggle', () => {
  it("insère un bouton « Monde » juste après « Sélectionner », avec son style", () => {
    const select = makeSelect();
    const toggle = ensureWorldToggle(select, 'list', () => undefined);

    expect(select.nextElementSibling).toBe(toggle);
    expect(toggle.className).toBe(select.className);
    expect(toggle.textContent).toBe('Monde');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it("est idempotent et met à jour l'état affiché", () => {
    const select = makeSelect();
    const first = ensureWorldToggle(select, 'list', () => undefined);
    const second = ensureWorldToggle(select, 'world', () => undefined);

    expect(second).toBe(first);
    expect(document.querySelectorAll('[data-wmt-world-toggle]')).toHaveLength(1);
    expect(second.getAttribute('aria-pressed')).toBe('true');
  });

  it("appelle le dernier gestionnaire fourni au clic", () => {
    const select = makeSelect();
    const oldHandler = vi.fn();
    const newHandler = vi.fn();
    ensureWorldToggle(select, 'list', oldHandler);
    ensureWorldToggle(select, 'list', newHandler).click();

    expect(oldHandler).not.toHaveBeenCalled();
    expect(newHandler).toHaveBeenCalledTimes(1);
  });
});

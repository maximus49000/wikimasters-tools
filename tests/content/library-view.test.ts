// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readView, writeView } from '../../src/content/collection-view';
import { ensureViewSwitch } from '../../src/content/world-toggle';

describe('vue library', () => {
  it('est écrite puis relue', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    writeView(storage, 'library');
    expect(readView(storage)).toBe('library');
  });

  it('retombe sur homemade quand le stockage est bloqué', () => {
    expect(readView({ getItem: () => { throw new Error('bloqué'); } })).toBe('homemade');
  });

  it('apparaît dans le sélecteur et se choisit', () => {
    document.body.innerHTML = '<div><button id="anchor">Sélectionner</button></div>';
    const anchor = document.getElementById('anchor') as HTMLButtonElement;
    const onSelect = vi.fn();
    const group = ensureViewSwitch(anchor, anchor, 'library', onSelect);
    const button = group.querySelector<HTMLButtonElement>('[data-wmt-view="library"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.getAttribute('aria-label')).toContain('Bibliothèque');
    button?.click();
    expect(onSelect).toHaveBeenCalledWith('library');
  });
});

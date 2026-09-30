// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fillInput, findSearchControls, runSearch } from '../../src/content/market-search';

const CONTROLS = `
  <div id="bar">
    <div class="relative">
      <input placeholder="Rechercher une carte…" type="search" value="">
      <button type="button" aria-label="Effacer">×</button>
    </div>
    <button type="button" id="go" class="disabled:opacity-40"><span><svg></svg>Rechercher</span></button>
  </div>`;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('findSearchControls', () => {
  it('repère le champ par son placeholder et le bouton « Rechercher » voisin', () => {
    document.body.innerHTML = `<button>Rechercher</button>` + CONTROLS;
    const controls = findSearchControls(document);
    expect(controls?.input.placeholder).toContain('Rechercher une carte');
    expect(controls?.button.id).toBe('go');
  });

  it('renvoie null si le champ ou le bouton manque', () => {
    expect(findSearchControls(document)).toBeNull();
    document.body.innerHTML = '<input type="search" placeholder="Rechercher une carte…">';
    expect(findSearchControls(document)).toBeNull();
  });
});

describe('fillInput', () => {
  it('écrit la valeur comme une saisie et prévient le site (champ contrôlé)', () => {
    document.body.innerHTML = CONTROLS;
    const input = document.querySelector('input')!;
    const seen: string[] = [];
    input.addEventListener('input', () => seen.push(input.value));
    fillInput(input, 'Ted Lasso');
    expect(input.value).toBe('Ted Lasso');
    expect(seen).toEqual(['Ted Lasso']);
  });
});

describe('runSearch', () => {
  it('remplit le champ puis clique sur le bouton une fois activé', async () => {
    document.body.innerHTML = CONTROLS;
    const input = document.querySelector('input')!;
    const button = document.querySelector<HTMLButtonElement>('#go')!;
    button.disabled = true;
    // Le site active le bouton après avoir traité la saisie, de façon asynchrone.
    input.addEventListener('input', () => setTimeout(() => (button.disabled = false), 40));
    const onClick = vi.fn();
    button.addEventListener('click', onClick);

    expect(await runSearch(document, 'Ted Lasso', { timeoutMs: 500 })).toBe('started');
    expect(input.value).toBe('Ted Lasso');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('attend l’apparition des contrôles (page qui se charge)', async () => {
    setTimeout(() => (document.body.innerHTML = CONTROLS), 60);
    expect(await runSearch(document, 'Ted Lasso', { timeoutMs: 500 })).toBe('started');
  });

  it('renvoie no-controls si le champ n’apparaît jamais', async () => {
    expect(await runSearch(document, 'Ted Lasso', { timeoutMs: 80 })).toBe('no-controls');
  });

  it('ne clique pas si le bouton reste désactivé', async () => {
    document.body.innerHTML = CONTROLS;
    const button = document.querySelector<HTMLButtonElement>('#go')!;
    button.disabled = true;
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    expect(await runSearch(document, 'Ted Lasso', { timeoutMs: 100, enableTimeoutMs: 80 })).toBe(
      'no-controls',
    );
    expect(onClick).not.toHaveBeenCalled();
  });
});

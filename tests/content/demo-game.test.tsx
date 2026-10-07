// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoCard } from '../../src/content/DemoCard';
import { createDemoGameService, DEMO_GAME_SLUG, DEMO_GAME_TITLE } from '../../src/content/demo-game';
import { getGameService, setGameService } from '../../src/content/game-registry';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('service de démonstration des jeux', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn(() => {
      throw new Error('aucune requête réseau attendue');
    });
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('rend un jeu fictif sans aucune requête réseau', async () => {
    const view = await createDemoGameService().view(DEMO_GAME_SLUG, DEMO_GAME_TITLE);
    expect(view.status).toBe('detail');
    if (view.status === 'detail') expect(view.detail.title).toBe(DEMO_GAME_TITLE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('un choix fait dans la démo n’écrit dans aucun stockage', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const service = createDemoGameService();
    await service.chooseNone(DEMO_GAME_SLUG);
    expect((await service.view(DEMO_GAME_SLUG, DEMO_GAME_TITLE)).status).toBe('empty');
    expect(local).not.toHaveBeenCalled();
    local.mockRestore();
    // Une autre démo repart de zéro : le choix ne survit pas.
    expect((await createDemoGameService().view(DEMO_GAME_SLUG, DEMO_GAME_TITLE)).status).toBe('detail');
  });
});

describe('DemoCard', () => {
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => act(() => root.unmount()));

  it('montre le bandeau Illustration et la section jeu vidéo, puis rétablit le service d’origine', async () => {
    const original = createDemoGameService();
    setGameService(original);
    await act(async () => root.render(<DemoCard card="game" />));
    await act(async () => undefined);
    expect(getGameService()).not.toBe(original);
    expect(container.textContent).toContain('Illustration');
    expect(container.querySelector('[data-wmt-game]')).not.toBeNull();
    expect(container.textContent).toContain('Jeu vidéo');
    await act(async () => root.render(<div />));
    expect(getGameService()).toBe(original);
    setGameService(null);
  });

  it.each(['music', 'screen', 'any'] as const)('pour %s : illustration indisponible, aucun élément visé', async (card) => {
    await act(async () => root.render(<DemoCard card={card} />));
    expect(container.textContent).toContain('Illustration indisponible');
    expect(container.querySelector('[data-wmt-game]')).toBeNull();
  });
});

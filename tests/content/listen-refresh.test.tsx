// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListenSection } from '../../src/content/ListenSection';
import { setMusicService } from '../../src/content/music-registry';
import type { ListenView, MusicService } from '../../src/content/music-service';
import type { MusicKind } from '../../src/core/music/music-kinds';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABEL = 'Actualiser les meilleurs titres';
const LIMITED = 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.';

const ready = (kind: MusicKind, ...titles: string[]): ListenView => ({
  status: 'ready',
  listen: { kind, items: titles.map((title) => ({ uri: `spotify:track:${title}`, title, artist: 'The Beatles' })) },
});

let container: HTMLDivElement;
let root: Root;

function serve(view: ListenView, refresh: ReturnType<typeof vi.fn> = vi.fn()) {
  setMusicService({ view: vi.fn(async () => view), refresh, subscribe: () => () => undefined, play: vi.fn(), link: vi.fn(), unlink: vi.fn() } as unknown as MusicService);
  return refresh;
}

async function render(slug = 'The_Beatles') {
  await act(async () => {
    root.render(<ListenSection slug={slug} title={slug} />);
  });
}

const button = () => container.querySelector<HTMLButtonElement>(`button[aria-label="${LABEL}"]`);
const text = () => container.textContent ?? '';
const click = () =>
  act(async () => {
    button()?.click();
  });

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMusicService(null);
});

describe('ListenSection, actualisation des meilleurs titres', () => {
  it("propose le bouton pour un artiste, pas pour un album ni un morceau", async () => {
    serve(ready('artist', 'Yesterday'));
    await render();
    expect(button()).not.toBeNull();

    for (const kind of ['album', 'track'] as const) {
      serve(ready(kind, 'Yesterday'));
      await render(`${kind}_card`);
      expect(button()).toBeNull();
    }
  });

  it('affiche la liste renvoyée par le service à la place de l’ancienne', async () => {
    const refresh = serve(ready('artist', 'Yesterday'), vi.fn(async () => ready('artist', 'Help!', 'Something')));
    await render();
    expect(text()).toContain('Yesterday');
    await click();
    expect(refresh).toHaveBeenCalledWith('The_Beatles', 'The_Beatles');
    expect(text()).toContain('Help!');
    expect(text()).toContain('Something');
    expect(text()).not.toContain('Yesterday');
  });

  it("garde la liste affichée et montre le message quand Spotify ne répond pas", async () => {
    serve(ready('artist', 'Yesterday'), vi.fn(async (): Promise<ListenView> => ({ status: 'error', message: LIMITED, retryAfterMs: 3_000 })));
    await render();
    await click();
    expect(text()).toContain('Yesterday');
    expect(text()).toContain(LIMITED);
    // L'utilisateur peut réessayer : la fiche ne relance pas toute seule une actualisation qu'il a demandée.
    expect(button()?.disabled).toBe(false);
  });

  it("n'envoie qu'une demande à la fois : le bouton est inactif pendant l'actualisation", async () => {
    let answer: (view: ListenView) => void = () => undefined;
    const refresh = serve(ready('artist', 'Yesterday'), vi.fn(() => new Promise<ListenView>((resolve) => (answer = resolve))));
    await render();
    await click();
    expect(button()?.disabled).toBe(true);
    await click();
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => answer(ready('artist', 'Help!')));
    expect(button()?.disabled).toBe(false);
  });

  it("ignore la réponse arrivée après un changement de carte", async () => {
    let answer: (view: ListenView) => void = () => undefined;
    serve(ready('artist', 'Yesterday'), vi.fn(() => new Promise<ListenView>((resolve) => (answer = resolve))));
    await render();
    await click();
    await render('Les_Rolling_Stones');
    await act(async () => answer(ready('artist', 'Help!')));
    // La fiche affiche la nouvelle carte (son propre chargement), pas la réponse de l'ancienne.
    expect(text()).not.toContain('Help!');
  });
});

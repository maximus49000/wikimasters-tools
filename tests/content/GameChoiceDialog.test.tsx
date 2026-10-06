// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameChoiceDialog } from '../../src/content/GameChoiceDialog';
import type { GameService } from '../../src/content/game-service';
import type { GameCandidate, GameDetail } from '../../src/core/game/game-detail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const cand = (source: 'steam' | 'igdb', id: number, title: string): GameCandidate => ({ source, id, title, platforms: ['PC'], popularity: 0 });
const detail: GameDetail = { source: 'steam', id: 1245620, title: 'ELDEN RING', genres: [], platforms: [], developers: [], rating: { kind: 'positive', value: 93, count: 10, verdict: 'Très positives' }, pageUrl: 'x' };

function service(over: Record<string, unknown> = {}) {
  return {
    igdbEnabled: true,
    candidates: vi.fn(async () => ({ steam: [cand('steam', 1245620, 'ELDEN RING')], igdb: [cand('igdb', 7, 'Elden Ring')] })),
    preview: vi.fn(async () => ({ detail })),
    fromLink: vi.fn(async () => ({ detail })),
    choose: vi.fn(async () => undefined),
    chooseNone: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
    ...over,
  };
}

// La fenêtre vit dans un shadow DOM posé sur le <body>.
const dialog = (): ParentNode => Array.from(document.body.children).find((child) => child.shadowRoot)?.shadowRoot ?? document.createDocumentFragment();
const byLabel = (label: string) => dialog().querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const click = (element: HTMLElement) => act(async () => element.click());

async function show(svc: ReturnType<typeof service>, onChanged = vi.fn(), onClose = vi.fn()) {
  await act(async () =>
    root.render(<GameChoiceDialog service={svc as unknown as GameService} slug="Elden_Ring" title="Elden Ring" current={null} onChanged={onChanged} onClose={onClose} />),
  );
  return { onChanged, onClose };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('GameChoiceDialog', () => {
  it('lance la recherche avec le titre de la carte et regroupe Steam puis IGDB', async () => {
    const svc = service();
    await show(svc);
    expect(svc.candidates).toHaveBeenCalledWith('Elden Ring');
    const text = dialog().textContent ?? '';
    expect(text.indexOf('Steam')).toBeLessThan(text.indexOf('IGDB'));
    expect(text).toContain('ELDEN RING');
  });

  it('sélectionner un résultat affiche un aperçu ; « Utiliser ce jeu » garde le choix puis ferme', async () => {
    const svc = service();
    const { onChanged, onClose } = await show(svc);
    await click(byLabel('Choisir ELDEN RING (Steam)'));
    expect(svc.preview).toHaveBeenCalledWith({ source: 'steam', id: 1245620 });
    expect(dialog().textContent).toContain('93');
    await click(byLabel('Utiliser ce jeu'));
    expect(svc.choose).toHaveBeenCalledWith('Elden_Ring', { source: 'steam', id: 1245620 });
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('« Aucun jeu » et « Revenir au choix automatique »', async () => {
    const svc = service();
    const { onChanged } = await show(svc);
    await click(byLabel('Aucun jeu'));
    expect(svc.chooseNone).toHaveBeenCalledWith('Elden_Ring');
    await click(byLabel('Revenir au choix automatique'));
    expect(svc.reset).toHaveBeenCalledWith('Elden_Ring');
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('onglet « Coller un lien » : aperçu d’une adresse, message sinon', async () => {
    const svc = service({ fromLink: vi.fn(async (text: string) => (text.includes('steampowered') ? { detail } : { message: 'Adresse non reconnue.' })) });
    await show(svc);
    await click(byLabel('Coller un lien'));
    const input = byLabel('Adresse du jeu') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'n’importe quoi');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(byLabel('Vérifier le lien'));
    expect(dialog().textContent).toContain('Adresse non reconnue.');
  });
});

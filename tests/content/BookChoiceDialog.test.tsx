// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookChoiceDialog } from '../../src/content/BookChoiceDialog';
import type { BookService } from '../../src/content/book-service';
import type { OlWork } from '../../src/core/book/openlibrary-api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const etranger: OlWork = { id: 'OL1230613W', title: 'L’étranger', author: 'Albert Camus', year: 1942, coverId: 13151269, popularity: 468 };
const autre: OlWork = { id: 'OL9W', title: 'L’étranger au village', popularity: 3 };

function service(over: Record<string, unknown> = {}) {
  return {
    candidates: vi.fn(async () => ({ works: [etranger, autre] })),
    preview: vi.fn(async () => ({ work: { ...etranger, publisher: 'Gallimard', pages: 186 } })),
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

async function show(svc: ReturnType<typeof service>, currentId: string | null = null, onChanged = vi.fn(), onClose = vi.fn()) {
  await act(async () =>
    root.render(<BookChoiceDialog service={svc as unknown as BookService} slug="L'Étranger" title="L’Étranger" currentId={currentId} onChanged={onChanged} onClose={onClose} />),
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

describe('BookChoiceDialog', () => {
  it('lance la recherche avec le titre de la carte et liste les œuvres (titre, auteur, année)', async () => {
    const svc = service();
    await show(svc);
    expect(svc.candidates).toHaveBeenCalledWith('L’Étranger');
    expect(byLabel('Changer de livre').getAttribute('role')).toBe('dialog');
    const text = dialog().textContent ?? '';
    expect(text).toContain('L’étranger');
    expect(text).toContain('Albert Camus');
    expect(text).toContain('1942');
    expect(byLabel('Choisir L’étranger (Albert Camus)')).toBeTruthy();
    expect(byLabel('Choisir L’étranger au village (auteur inconnu)')).toBeTruthy();
  });

  it('une nouvelle recherche utilise le texte saisi', async () => {
    const svc = service();
    await show(svc);
    const input = byLabel('Titre à chercher') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'La peste');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(byLabel('Chercher'));
    expect(svc.candidates).toHaveBeenLastCalledWith('La peste');
  });

  it('sélectionner un résultat affiche un aperçu ; « Utiliser ce livre » garde le choix, prévient puis ferme', async () => {
    const svc = service();
    const { onChanged, onClose } = await show(svc);
    await click(byLabel('Choisir L’étranger (Albert Camus)'));
    expect(svc.preview).toHaveBeenCalledWith('OL1230613W');
    expect(dialog().textContent).toContain('Gallimard');
    await click(byLabel('Utiliser ce livre'));
    expect(svc.choose).toHaveBeenCalledWith("L'Étranger", 'OL1230613W');
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('le livre actuel est grisé et ne peut pas être rechoisi', async () => {
    const svc = service();
    await show(svc, 'OL1230613W');
    expect((byLabel('Choisir L’étranger (Albert Camus)') as HTMLButtonElement).disabled).toBe(true);
    expect(dialog().textContent).toContain('livre actuel');
  });

  it('« Aucun livre » et « Revenir au choix automatique »', async () => {
    const svc = service();
    const { onChanged } = await show(svc);
    await click(byLabel('Aucun livre'));
    expect(svc.chooseNone).toHaveBeenCalledWith("L'Étranger");
    await click(byLabel('Revenir au choix automatique'));
    expect(svc.reset).toHaveBeenCalledWith("L'Étranger");
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('une recherche sans résultat, un échec de recherche et un aperçu impossible restent lisibles', async () => {
    const empty = service({ candidates: vi.fn(async () => ({ works: [] })) });
    await show(empty);
    expect(dialog().textContent).toContain('Aucun résultat.');
    await act(async () => root.unmount());
    root = createRoot(container);
    const failing = service({ candidates: vi.fn(async () => ({ works: [], message: 'Open Library est indisponible pour le moment.' })), preview: vi.fn(async () => ({ message: 'Ce livre est introuvable.' })) });
    await show(failing);
    expect(dialog().querySelector('[role="status"]')?.textContent).toContain('indisponible');
    await act(async () => root.unmount());
    root = createRoot(container);
    const noPreview = service({ candidates: vi.fn(async () => ({ works: [etranger] })), preview: vi.fn(async () => ({ message: 'Ce livre est introuvable.' })) });
    await show(noPreview);
    await click(byLabel('Choisir L’étranger (Albert Camus)'));
    expect(dialog().querySelector('[role="status"]')?.textContent).toContain('Ce livre est introuvable.');
    expect(byLabel('Utiliser ce livre')).toBeNull();
  });

  it('un changement qui échoue garde la fenêtre ouverte avec un message', async () => {
    const svc = service({ chooseNone: vi.fn(async () => Promise.reject(new Error('x'))) });
    const { onClose, onChanged } = await show(svc);
    await click(byLabel('Aucun livre'));
    expect(onClose).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="status"]')?.textContent).toContain('réessaie');
  });

  it('le bouton de fermeture ferme la fenêtre', async () => {
    const { onClose } = await show(service());
    await click(byLabel('Fermer'));
    expect(onClose).toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameVersionDialog } from '../../src/content/GameVersionDialog';
import type { GameBoxService } from '../../src/content/game-box-service';
import type { TgdbVersion } from '../../src/core/game/tgdb-api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const version = (id: number, platformName: string, over: Partial<TgdbVersion> = {}): TgdbVersion => ({
  id,
  title: 'Red Dead Redemption 2',
  platformId: id,
  platformName,
  format: 'bluray',
  style: { plastic: '#1b1b1b', band: null },
  year: 2018,
  front: `boxart/front/${id}-1.jpg`,
  ...over,
});
const list = [version(1, 'PlayStation 4', { back: 'boxart/back/1-1.jpg' }), version(2, 'Xbox One'), version(3, 'PC', { front: undefined, year: undefined })];

function service(over: Record<string, unknown> = {}) {
  return {
    chooseVersion: vi.fn(async () => undefined),
    resetVersion: vi.fn(async () => undefined),
    ...over,
  };
}

// La fenêtre vit dans un shadow DOM posé sur le <body>.
const dialog = (): ParentNode => Array.from(document.body.children).find((child) => child.shadowRoot)?.shadowRoot ?? document.createDocumentFragment();
const byLabel = (label: string) => dialog().querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const click = (element: HTMLElement) => act(async () => element.click());

async function show(svc: ReturnType<typeof service>, versions: TgdbVersion[] = list, activeId: number | undefined = 2, onClose = vi.fn()) {
  await act(async () => root.render(<GameVersionDialog service={svc as unknown as GameBoxService} slug="Red_Dead_Redemption_2" title="Red Dead Redemption 2" versions={versions} activeId={activeId} onClose={onClose} />));
  return { onClose };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.querySelectorAll('body > div').forEach((node) => node.remove());
});

describe('GameVersionDialog', () => {
  it('liste Automatique puis chaque version : console, année, vignette, dos', async () => {
    await show(service());
    const text = dialog().textContent ?? '';
    expect(byLabel('Changer de version')).not.toBeNull();
    expect(byLabel('Version automatique')).not.toBeNull();
    expect(text).toContain('PlayStation 4');
    expect(text).toContain('Xbox One');
    expect(text).toContain('2018');
    expect(dialog().querySelector('img[src$="boxart/front/1-1.jpg"]')?.getAttribute('src')).toContain('/medium/');
    expect(byLabel('Choisir PlayStation 4').querySelector('[aria-label="Dos de la boîte connu"]')).not.toBeNull();
    expect(byLabel('Choisir Xbox One').querySelector('[aria-label="Dos de la boîte connu"]')).toBeNull();
  });

  it('la version active est cochée', async () => {
    await show(service(), list, 2);
    expect(byLabel('Choisir Xbox One').getAttribute('aria-pressed')).toBe('true');
    expect(byLabel('Choisir PlayStation 4').getAttribute('aria-pressed')).toBe('false');
    expect(byLabel('Version automatique').getAttribute('aria-pressed')).toBe('false');
  });

  it('cliquer une version appelle chooseVersion puis ferme', async () => {
    const svc = service();
    const { onClose } = await show(svc);
    await click(byLabel('Choisir PlayStation 4'));
    expect(svc.chooseVersion).toHaveBeenCalledWith('Red_Dead_Redemption_2', 1);
    expect(onClose).toHaveBeenCalled();
  });

  it('Automatique appelle resetVersion puis ferme', async () => {
    const svc = service();
    const { onClose } = await show(svc);
    await click(byLabel('Version automatique'));
    expect(svc.resetVersion).toHaveBeenCalledWith('Red_Dead_Redemption_2');
    expect(onClose).toHaveBeenCalled();
  });

  it('liste vide : message', async () => {
    await show(service(), []);
    expect(dialog().textContent).toContain('Aucune autre version connue');
  });

  it('un échec garde la fenêtre ouverte avec un message', async () => {
    const svc = service({ chooseVersion: vi.fn(async () => Promise.reject(new Error('x'))) });
    const { onClose } = await show(svc);
    await click(byLabel('Choisir Xbox One'));
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="status"]')).not.toBeNull();
  });
});

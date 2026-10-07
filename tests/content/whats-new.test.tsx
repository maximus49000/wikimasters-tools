// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createWhatsNewRepo } from '../../src/core/whats-new/seen';
import { stepsOf } from '../../src/core/whats-new/pages';
import type { Entry } from '../../src/core/whats-new/types';
import { WhatsNewDialog } from '../../src/content/WhatsNewDialog';
import { WikiHowDialog } from '../../src/content/WikiHowDialog';
import { showPendingWhatsNew } from '../../src/content/whats-new-flow';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (id: string, steps = 1): Entry => ({
  id,
  theme: 'collection',
  glyph: 'g',
  title: `Titre ${id}`,
  summary: `Résumé ${id}`,
  steps: Array.from({ length: steps }, (_, i) => ({ target: null, title: `${id}-${i}`, text: 't' })),
});

describe('composants', () => {
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => act(() => root.unmount()));
  const button = (label: string | RegExp) =>
    [...container.querySelectorAll('button')].find((b) => (typeof label === 'string' ? b.textContent === label : label.test(b.textContent ?? '')))!;

  it('WhatsNewDialog : compteurs, switch, consultation grisée et visite', () => {
    const onConsult = vi.fn();
    const onTour = vi.fn();
    act(() => root.render(<WhatsNewDialog entries={[entry('a'), entry('b')]} fixes={[{ id: 'f1', title: 'Correction un' }]} consulted={['b']} onConsult={onConsult} onTour={onTour} onClose={() => undefined} />));
    expect(button(/Nouveautés/).textContent).toContain('1');
    expect(button(/Corrections/).textContent).toContain('1');
    expect(container.querySelector('[data-consulted]')?.textContent).toContain('Titre b');
    act(() => button(/Titre a/).click());
    expect(onConsult).toHaveBeenCalledWith('a');
    expect(onTour).toHaveBeenCalledWith(stepsOf(entry('a')));
    expect(button(/Nouveautés/).textContent).toContain('0');
    act(() => button(/Corrections/).click());
    expect(container.textContent).toContain('Correction un');
    act(() => button(/Correction un/).click());
    expect(onConsult).toHaveBeenCalledWith('f1');
    expect(onTour).toHaveBeenCalledTimes(1);
  });

  it('WhatsNewDialog : « Tout visiter » enchaîne les étapes des fiches non consultées', () => {
    const onTour = vi.fn();
    act(() => root.render(<WhatsNewDialog entries={[entry('a', 2), entry('b'), entry('c')]} fixes={[]} consulted={['c']} onConsult={() => undefined} onTour={onTour} onClose={() => undefined} />));
    act(() => button('Tout visiter').click());
    const steps = onTour.mock.calls[0]![0] as { title: string }[];
    expect(steps.map((s) => s.title)).toEqual(['Titre a · a-0', 'Titre a · a-1', 'Titre b · b-0']);
  });

  it('WhatsNewDialog : s’ouvre sur Corrections quand il n’y a que des corrections', () => {
    act(() => root.render(<WhatsNewDialog entries={[]} fixes={[{ id: 'f1', title: 'Seule correction' }]} consulted={[]} onConsult={() => undefined} onTour={() => undefined} onClose={() => undefined} />));
    expect(container.textContent).toContain('Seule correction');
  });

  it('WikiHowDialog : tout le catalogue par thème, « Revoir » sur les fiches consultées', () => {
    const onTour = vi.fn();
    act(() => root.render(<WikiHowDialog entries={[entry('a'), entry('b')]} consulted={['a']} onConsult={() => undefined} onTour={onTour} onClose={() => undefined} />));
    expect(container.textContent).toContain('Collection');
    expect(container.textContent).toContain('Revoir');
    act(() => button(/Titre b/).click());
    expect(onTour).toHaveBeenCalledWith(stepsOf(entry('b')));
  });
});

describe('showPendingWhatsNew', () => {
  it('ouvre la fenêtre avec les nouveautés et les marque annoncées (une seule fois)', async () => {
    const repo = createWhatsNewRepo(createMemoryStore());
    await repo.pending([entry('a')], []);
    const open = vi.fn();
    await showPendingWhatsNew(repo, [entry('a'), entry('b')], [{ id: 'f1', title: 'x' }], open);
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0]![0].entries.map((e: Entry) => e.id)).toEqual(['b']);
    expect(open.mock.calls[0]![0].fixes).toEqual([{ id: 'f1', title: 'x' }]);
    await showPendingWhatsNew(repo, [entry('a'), entry('b')], [{ id: 'f1', title: 'x' }], open);
    expect(open).toHaveBeenCalledOnce();
  });

  it('transmet la consultation au dépôt', async () => {
    const repo = createWhatsNewRepo(createMemoryStore());
    await repo.pending([], []);
    const open = vi.fn();
    await showPendingWhatsNew(repo, [entry('a')], [], open);
    open.mock.calls[0]![0].onConsult('a');
    await vi.waitFor(async () => expect((await repo.consulted()).has('a')).toBe(true));
  });

  it('n’ouvre rien au premier lancement sans fiche « fresh »', async () => {
    const open = vi.fn();
    await showPendingWhatsNew(createWhatsNewRepo(createMemoryStore()), [entry('a')], [{ id: 'f1', title: 'x' }], open);
    expect(open).not.toHaveBeenCalled();
  });
});

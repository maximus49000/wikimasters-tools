// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDocumentaryService } from '../../src/content/documentary-registry';
import type { DocView, DocumentaryService } from '../../src/content/documentary-service';
import { DocumentarySection } from '../../src/content/DocumentarySection';
import type { DocCandidate, DocSubject } from '../../src/core/documentary/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cand = (id: string, title: string): DocCandidate => ({ source: 'youtube', id, title, channel: 'Chaîne', durationSec: 3000, language: 'fr', description: '', url: `https://www.youtube.com/watch?v=${id}` });
const subject: DocSubject = { qid: 'Q618856', kind: 'event', names: ['Tenture de l’Apocalypse'], startYear: 1377, endYear: null };

describe('DocumentarySection : vidéos proposées et possibles', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setDocumentaryService(null);
  });

  const mount = async (view: DocView) => {
    const service = { view: vi.fn().mockResolvedValue(view), propose: vi.fn(), flag: vi.fn().mockResolvedValue(undefined) } as unknown as DocumentaryService;
    setDocumentaryService(service);
    await act(async () => root.render(<DocumentarySection slug="Tenture_de_l'Apocalypse" title="Tenture de l'Apocalypse" />));
    return service;
  };
  const click = async (selector: string) => {
    const element = container.querySelector<HTMLElement>(selector);
    expect(element, selector).not.toBeNull();
    await act(async () => element!.click());
  };
  const text = () => container.textContent ?? '';

  it('propose d’abord la meilleure vidéo, sans pastille, avec le lien et son compteur', async () => {
    await mount({ status: 'detail', subject, candidates: [cand('BON', 'Au cœur de l’Histoire')], possible: [cand('PEUT1', 'Fragments retrouvés'), cand('PEUT2', 'Autre')] });
    expect(text()).toContain('Au cœur de l’Histoire');
    expect(text()).not.toContain('Pertinence moins sûre');
    const link = container.querySelector('[data-wmt-documentary-possible]')!;
    expect(link.textContent).toContain('2');
    expect(container.querySelector('[aria-label="Autre documentaire"]')).toBeNull();
  });

  it('le lien ouvre les vidéos possibles dans le même lecteur, avec ⇄, pastille et avertissement', async () => {
    await mount({ status: 'detail', subject, candidates: [cand('BON', 'Au cœur de l’Histoire')], possible: [cand('PEUT1', 'Fragments retrouvés')] });
    await click('[data-wmt-documentary-possible]');
    expect(text()).toContain('1 / 2');
    await click('[aria-label="Autre documentaire"]');
    expect(text()).toContain('Fragments retrouvés');
    expect(text()).toContain('Pertinence moins sûre');
    expect(text()).toContain('peut ne pas traiter exactement ce sujet');
    await click('[data-wmt-documentary-possible]');
    expect(text()).toContain('Au cœur de l’Histoire');
    expect(text()).not.toContain('Pertinence moins sûre');
  });

  it('sans vidéo proposée : les recherches guidées et le lien vers les possibles', async () => {
    await mount({ status: 'empty', subject, busy: false, possible: [cand('PEUT1', 'Prêtres réfractaires')] });
    expect(text()).toContain('1 vidéo possible');
    expect(container.querySelectorAll('a[href*="search"], a[href*="recherche"]').length).toBeGreaterThanOrEqual(3);
    await click('[data-wmt-documentary-possible]');
    expect(text()).toContain('Prêtres réfractaires');
    expect(text()).toContain('Pertinence moins sûre');
  });

  it('rien du tout : pas de lien, seulement les recherches guidées et la proposition', async () => {
    await mount({ status: 'empty', subject, busy: false, possible: [] });
    expect(container.querySelector('[data-wmt-documentary-possible]')).toBeNull();
    expect(container.querySelector('[aria-label="Proposer un documentaire"]')).not.toBeNull();
  });

  it('ne montre rien pour une carte sans rapport', async () => {
    await mount({ status: 'none' });
    expect(container.innerHTML).toBe('');
  });
});

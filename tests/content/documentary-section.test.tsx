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
const BON = cand('BON', 'Au cœur de l’Histoire');
const PEUT1 = cand('PEUT1', 'Fragments retrouvés');
const PEUT2 = cand('PEUT2', 'Autre vidéo');

describe('DocumentarySection : liste, choix retenu, vidéos possibles', () => {
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

  // `views` : la première vue, puis celles rendues après chaque rechargement (choix, retour au choix automatique, masquage).
  const mount = async (...views: DocView[]) => {
    const view = vi.fn();
    views.forEach((entry, i) => (i === views.length - 1 ? view.mockResolvedValue(entry) : view.mockResolvedValueOnce(entry)));
    const service = { view, propose: vi.fn(), flag: vi.fn().mockResolvedValue(undefined), choose: vi.fn().mockResolvedValue(undefined), clearChoice: vi.fn().mockResolvedValue(undefined) } as unknown as DocumentaryService;
    setDocumentaryService(service);
    await act(async () => root.render(<DocumentarySection slug="Tenture_de_l'Apocalypse" title="Tenture de l'Apocalypse" />));
    return service;
  };
  const click = async (selector: string, index = 0) => {
    const element = container.querySelectorAll<HTMLElement>(selector)[index];
    expect(element, selector).toBeDefined();
    await act(async () => element!.click());
  };
  const text = () => container.textContent ?? '';
  const detail = (candidates: DocCandidate[], possible: DocCandidate[], chosenId: string | null = null): DocView => ({ status: 'detail', subject, candidates, possible, chosenId });

  it('propose d’abord la meilleure vidéo, sans pastille, avec le bouton de liste et le total des vidéos', async () => {
    await mount(detail([BON], [PEUT1, PEUT2]));
    expect(text()).toContain('Au cœur de l’Histoire');
    expect(text()).not.toContain('Pertinence moins sûre');
    expect(text()).not.toContain('Votre choix');
    expect(container.querySelector('[data-wmt-documentary-list]')!.textContent).toContain('3');
    expect(container.querySelector('[data-wmt-documentary-item]')).toBeNull();
  });

  it('⇄ passe à la vidéo suivante, jusqu’aux moins sûres, avec pastille et avertissement', async () => {
    await mount(detail([BON], [PEUT1]));
    await click('[aria-label="Autre documentaire"]');
    expect(text()).toContain('Fragments retrouvés');
    expect(text()).toContain('Pertinence moins sûre');
    expect(text()).toContain('peut ne pas traiter exactement ce sujet');
  });

  it('la liste montre toutes les vidéos en deux rubriques', async () => {
    await mount(detail([BON], [PEUT1, PEUT2]));
    await click('[data-wmt-documentary-list]');
    expect(container.querySelectorAll('[data-wmt-documentary-item]')).toHaveLength(3);
    expect(text()).toContain('Proposées');
    expect(text()).toContain('Pertinence moins sûre');
    await click('[data-wmt-documentary-list]');
    expect(container.querySelector('[data-wmt-documentary-item]')).toBeNull();
  });

  it('toucher une vidéo de la liste la retient pour la carte et la met en tête', async () => {
    const service = await mount(detail([BON], [PEUT1]), detail([PEUT1, BON], [], 'PEUT1'));
    await click('[data-wmt-documentary-list]');
    await click('[data-wmt-documentary-item]', 1);
    expect(service.choose).toHaveBeenCalledWith("Tenture_de_l'Apocalypse", PEUT1);
    expect(text()).toContain('Fragments retrouvés');
    expect(text()).toContain('★ Votre choix');
    expect(text()).not.toContain('Pertinence moins sûre');
    expect(container.querySelector('[data-wmt-documentary-item]')).toBeNull();
  });

  it('« revenir au choix automatique » oublie le choix', async () => {
    const service = await mount(detail([PEUT1, BON], [], 'PEUT1'), detail([BON], [PEUT1]));
    expect(container.querySelector('[data-wmt-documentary-reset]')).not.toBeNull();
    await click('[data-wmt-documentary-reset]');
    expect(service.clearChoice).toHaveBeenCalledWith("Tenture_de_l'Apocalypse");
    expect(text()).toContain('Au cœur de l’Histoire');
    expect(container.querySelector('[data-wmt-documentary-reset]')).toBeNull();
  });

  it('sans choix, le lien de retour n’existe pas', async () => {
    await mount(detail([BON], []));
    expect(container.querySelector('[data-wmt-documentary-reset]')).toBeNull();
  });

  it('sans vidéo proposée : rien ne se lance, les possibles se choisissent dans la liste', async () => {
    const service = await mount({ status: 'empty', subject, busy: false, possible: [PEUT1] }, detail([PEUT1], [], 'PEUT1'));
    expect(text()).toContain('1 vidéo possible');
    expect(container.querySelector('iframe, video, [aria-label="Lire le documentaire"]')).toBeNull();
    expect(container.querySelectorAll('a[href*="search"], a[href*="recherche"]').length).toBeGreaterThanOrEqual(3);
    await click('[data-wmt-documentary-list]');
    await click('[data-wmt-documentary-item]');
    expect(service.choose).toHaveBeenCalledWith("Tenture_de_l'Apocalypse", PEUT1);
    expect(text()).toContain('★ Votre choix');
    expect(container.querySelector('[aria-label="Lire le documentaire"]')).not.toBeNull();
  });

  it('rien du tout : pas de liste, seulement les recherches guidées et la proposition', async () => {
    await mount({ status: 'empty', subject, busy: false, possible: [] });
    expect(container.querySelector('[data-wmt-documentary-list]')).toBeNull();
    expect(container.querySelector('[aria-label="Proposer un documentaire"]')).not.toBeNull();
  });

  it('une seule vidéo : ni ⇄ ni liste', async () => {
    await mount(detail([BON], []));
    expect(container.querySelector('[aria-label="Autre documentaire"]')).toBeNull();
    expect(container.querySelector('[data-wmt-documentary-list]')).toBeNull();
  });

  it('ne montre rien pour une carte sans rapport', async () => {
    await mount({ status: 'none' });
    expect(container.innerHTML).toBe('');
  });
});

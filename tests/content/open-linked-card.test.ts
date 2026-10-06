// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { openLinkedCard } from '../../src/content/open-linked-card';

describe('openLinkedCard', () => {
  it('ferme la fiche actuelle, puis ouvre celle de la carte liée', async () => {
    document.body.innerHTML = '<div id="fiche"><button aria-label="Fermer"></button><div id="bloc"></div></div>';
    const bloc = document.getElementById('bloc') as HTMLElement;
    const order: string[] = [];
    document.querySelector('button')?.addEventListener('click', () => {
      order.push('fermée');
      document.getElementById('fiche')?.remove();
    });
    const open = vi.fn((slug: string) => void order.push(`ouvre ${slug}`));
    await openLinkedCard(bloc, 'Seine', open);
    expect(order).toEqual(['fermée', 'ouvre Seine']);
  });
});

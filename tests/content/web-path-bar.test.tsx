// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LinksRepo } from '../../src/core/links/links-repo';
import { WebPathBar } from '../../src/content/WebPathBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('WebPathBar : cartes déjà choisies', () => {
  it('remplit les champs A et B et lance la recherche tout de suite', async () => {
    const readNow = vi.fn(async () => ({}));
    const links = { readNow, citers: async () => ({}) } as unknown as LinksRepo;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <WebPathBar
          cards={[]}
          links={links}
          onPath={vi.fn()}
          initial={{ from: { slug: 'Ted_Lasso', title: 'Ted Lasso' }, to: { slug: 'Ovide', title: 'Ovide' } }}
        />,
      );
    });
    const fields = [...container.querySelectorAll<HTMLInputElement>('input')].map((input) => input.value);
    expect(fields).toEqual(['Ted Lasso', 'Ovide']);
    expect(readNow).toHaveBeenCalled();
  });
});

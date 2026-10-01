// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  decorateLoading,
  LOADING_HOST_ATTRIBUTE,
  type MountLoading,
} from '../../src/content/decorate-loading';

const mount: MountLoading = (frame) => {
  const host = document.createElement('div');
  host.setAttribute(LOADING_HOST_ATTRIBUTE, '');
  frame.appendChild(host);
  return { unmount: () => host.remove() };
};

const hosts = () => document.querySelectorAll(`[${LOADING_HOST_ATTRIBUTE}]`).length;

describe('decorateLoading', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main><h1>Collection</h1><div class="grid">
        <div class="card"><div class="frame" style="position:relative"><img alt="x"><div style="position:absolute">UR</div></div><h3>Mad Max</h3></div>
        <div class="card"><div class="frame" style="position:relative"><img alt="y"><div style="position:absolute">SR</div></div><h3>Ted Lasso</h3></div>
      </div></main>`;
  });

  it('pose un glyphe seulement sur les cartes en attente', () => {
    decorateLoading(document, new Set(['Mad_Max']), mount);
    expect(hosts()).toBe(1);
    expect(document.querySelector('.card:first-child [data-wmt-loading]')).not.toBeNull();
  });

  it('ne pose rien quand aucune carte n’est en attente', () => {
    decorateLoading(document, new Set(), mount);
    expect(hosts()).toBe(0);
  });

  it('ne pose pas deux glyphes sur la même carte', () => {
    decorateLoading(document, new Set(['Mad_Max']), mount);
    decorateLoading(document, new Set(['Mad_Max']), mount);
    expect(hosts()).toBe(1);
  });

  it('retire le glyphe d’une carte dès qu’elle n’est plus en attente, sans toucher aux autres', () => {
    decorateLoading(document, new Set(['Mad_Max', 'Ted_Lasso']), mount);
    expect(hosts()).toBe(2);
    decorateLoading(document, new Set(['Ted_Lasso']), mount);
    expect(hosts()).toBe(1);
    expect(document.querySelector('.card:last-child [data-wmt-loading]')).not.toBeNull();
    decorateLoading(document, new Set(), mount);
    expect(hosts()).toBe(0);
  });

  it('retire aussi le glyphe d’une carte qui n’est plus dans la page', () => {
    decorateLoading(document, new Set(['Mad_Max']), mount);
    document.querySelector('.card:first-child h3')!.textContent = 'Autre carte';
    decorateLoading(document, new Set(['Mad_Max']), mount);
    expect(hosts()).toBe(0);
  });
});

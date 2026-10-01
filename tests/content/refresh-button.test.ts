// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ensureRefreshButton,
  refreshLabel,
  REFRESH_HOST_ATTRIBUTE,
  type MountRefresh,
} from '../../src/content/refresh-button';

const PAGE = `
  <main>
    <header><h1>Collection</h1><button>Sélectionner</button></header>
    <div class="scope">
      <div class="grid">
        <div class="card"><div style="position:relative"><img alt="x"><div style="position:absolute">UR</div></div><h3>Mad Max</h3></div>
        <div class="card"><div style="position:relative"><img alt="y"><div style="position:absolute">SR</div></div><h3>Ted Lasso</h3></div>
      </div>
    </div>
  </main>`;

let mounts = 0;
const mount: MountRefresh = (grid) => {
  mounts += 1;
  const host = document.createElement('div');
  host.setAttribute(REFRESH_HOST_ATTRIBUTE, '');
  grid.insertAdjacentElement('afterend', host);
  return { unmount: () => host.remove() };
};
const hosts = () => document.querySelectorAll(`[${REFRESH_HOST_ATTRIBUTE}]`);

describe('refreshLabel', () => {
  it('au repos : invite à recharger', () => {
    expect(refreshLabel({ remaining: 0, total: 0 })).toEqual({ text: 'Recharger les prix de cette page', busy: false });
  });

  it('en cours : avancement n / total, bouton occupé', () => {
    expect(refreshLabel({ remaining: 27, total: 50 })).toEqual({ text: 'Rechargement… 23 / 50', busy: true });
    expect(refreshLabel({ remaining: 1, total: 1 })).toEqual({ text: 'Rechargement… 0 / 1', busy: true });
  });
});

describe('ensureRefreshButton', () => {
  beforeEach(() => {
    document.body.innerHTML = PAGE;
    mounts = 0;
  });

  it('pose le bouton juste après la grille des cartes', () => {
    expect(ensureRefreshButton(document, mount)).toBe(true);
    expect(hosts()).toHaveLength(1);
    expect(document.querySelector('.grid')!.nextElementSibling).toBe(hosts()[0]);
  });

  it('est idempotent : un seul bouton, monté une seule fois', () => {
    ensureRefreshButton(document, mount);
    ensureRefreshButton(document, mount);
    expect(hosts()).toHaveLength(1);
    expect(mounts).toBe(1);
  });

  it('ne pose rien sans cartes ni bouton Sélectionner (autre page)', () => {
    document.body.innerHTML = '<main><h1>Marché</h1></main>';
    expect(ensureRefreshButton(document, mount)).toBe(false);
    expect(hosts()).toHaveLength(0);
  });

  it('retire le bouton quand la grille est masquée (vue Monde)', () => {
    ensureRefreshButton(document, mount);
    (document.querySelector('.grid') as HTMLElement).style.display = 'none';
    expect(ensureRefreshButton(document, mount)).toBe(false);
    expect(hosts()).toHaveLength(0);
  });

  it('suit la grille quand le site la remplace', () => {
    ensureRefreshButton(document, mount);
    const old = document.querySelector('.grid')!;
    const fresh = old.cloneNode(true) as HTMLElement;
    old.replaceWith(fresh);
    expect(ensureRefreshButton(document, mount)).toBe(true);
    expect(hosts()).toHaveLength(1);
    expect(fresh.nextElementSibling).toBe(hosts()[0]);
  });
});

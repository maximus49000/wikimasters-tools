// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { snapshot } from '../../src/content/tour-snapshot';

describe('snapshot (copie réduite d’un élément)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('copie le texte et la mise en forme calculée, sans identifiant ni lien actif', () => {
    document.body.innerHTML = '<a id="x" href="/settings" data-wmt-anomaly-setting style="color: rgb(255, 0, 0); padding: 4px"><span>Paramètres</span></a>';
    const copy = snapshot(document.getElementById('x')!)!;
    expect(copy.textContent).toBe('Paramètres');
    expect(copy.style.color).toBe('rgb(255, 0, 0)');
    expect(copy.hasAttribute('id')).toBe(false);
    expect(copy.hasAttribute('href')).toBe(false);
    expect(copy.hasAttribute('data-wmt-anomaly-setting')).toBe(false);
    expect(copy.style.pointerEvents).toBe('none');
  });

  it('ne modifie pas l’élément d’origine', () => {
    document.body.innerHTML = '<div id="x" style="color: rgb(0, 0, 255)"><b>a</b></div>';
    const original = document.getElementById('x')!;
    snapshot(original);
    expect(original.id).toBe('x');
    expect(original.style.pointerEvents).toBe('');
  });

  it('renonce (null) à un élément trop gros ou qui contient un canvas ou une vidéo', () => {
    document.body.innerHTML = `<div id="big">${'<i></i>'.repeat(200)}</div><div id="c"><canvas></canvas></div><div id="v"><video></video></div>`;
    expect(snapshot(document.getElementById('big')!)).toBeNull();
    expect(snapshot(document.getElementById('c')!)).toBeNull();
    expect(snapshot(document.getElementById('v')!)).toBeNull();
  });
});

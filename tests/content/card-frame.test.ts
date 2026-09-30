// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { findCardFrame } from '../../src/content/card-frame';

function setup(html: string): HTMLElement {
  document.body.innerHTML = `<div id="container">${html}</div>`;
  return document.getElementById('container') as HTMLElement;
}

describe('findCardFrame', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('retrouve le cadre à partir de la pastille de rareté', () => {
    const container = setup(
      '<div id="frame" style="position:relative"><div style="position:absolute">SR</div></div>',
    );
    expect(findCardFrame(container, 'SR')?.id).toBe('frame');
  });

  it('renvoie null sans pastille de rareté', () => {
    const container = setup('<div style="position:relative"><span>Mad Max</span></div>');
    expect(findCardFrame(container, 'SR')).toBeNull();
  });

  it('renvoie null quand le texte de la pastille diffère', () => {
    const container = setup('<div style="position:relative"><div style="position:absolute">UR</div></div>');
    expect(findCardFrame(container, 'SR')).toBeNull();
  });

  it("renvoie null quand la pastille n'est pas en position absolute", () => {
    const container = setup('<div style="position:relative"><div>SR</div></div>');
    expect(findCardFrame(container, 'SR')).toBeNull();
  });

  it('renvoie null quand le parent est en position static', () => {
    const container = setup('<div><div style="position:absolute">SR</div></div>');
    expect(findCardFrame(container, 'SR')).toBeNull();
  });

  it('ignore nos propres badges', () => {
    const container = setup(
      '<div style="position:relative"><div data-wmt-purchase><div style="position:absolute">SR</div></div></div>',
    );
    expect(findCardFrame(container, 'SR')).toBeNull();
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decorateExtensionSetting } from '../../src/content/extension-setting-menu';
import { decorateWikiHowSetting } from '../../src/content/wikihow-menu';
import { decorateUpdateSetting, UPDATE_SETTING_ATTRIBUTE } from '../../src/content/update-setting-menu';

const MENU = '<div><a class="row" href="/settings"><span><svg><path d="M0 0"/></svg></span>Paramètres</a><a href="/x">Autre</a></div>';

describe('decorateUpdateSetting', () => {
  beforeEach(() => {
    document.body.innerHTML = MENU;
  });

  it('se pose après les autres réglages de la surcouche, une seule fois', () => {
    decorateExtensionSetting(document, () => undefined);
    decorateWikiHowSetting(document, () => undefined);
    expect(decorateUpdateSetting(document, () => undefined)).toBe(1);
    expect(decorateUpdateSetting(document, () => undefined)).toBe(0);
    const entry = document.querySelector(`[${UPDATE_SETTING_ATTRIBUTE}]`);
    expect(entry?.textContent).toBe('Vérifier la mise à jour');
    expect(entry?.previousElementSibling?.textContent).toBe('WikiHow');
    expect(entry?.nextElementSibling?.getAttribute('href')).toBe('/x');
  });
  it('reste unique si les autres réglages arrivent après lui', () => {
    expect(decorateUpdateSetting(document, () => undefined)).toBe(1);
    decorateExtensionSetting(document, () => undefined);
    expect(decorateUpdateSetting(document, () => undefined)).toBe(0);
    expect(document.querySelectorAll(`[${UPDATE_SETTING_ATTRIBUTE}]`)).toHaveLength(1);
  });
  it('lance la vérification au clic', () => {
    const open = vi.fn();
    decorateUpdateSetting(document, open);
    document.querySelector(`[${UPDATE_SETTING_ATTRIBUTE}]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});

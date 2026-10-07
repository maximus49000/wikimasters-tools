// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decorateExtensionSetting, EXTENSION_SETTING_ATTRIBUTE } from '../../src/content/extension-setting-menu';

const MENU = '<div><a href="/profile">Profil</a><a class="row" href="/settings"><span><svg><path d="M0 0"/></svg></span>Paramètres</a></div>';

describe('decorateExtensionSetting', () => {
  beforeEach(() => {
    document.body.innerHTML = MENU;
  });

  it('ajoute « Paramètre d’extension » sous « Paramètres », une seule fois, avec le style de la ligne', () => {
    expect(decorateExtensionSetting(document, () => undefined)).toBe(1);
    expect(decorateExtensionSetting(document, () => undefined)).toBe(0);
    const entry = document.querySelector(`[${EXTENSION_SETTING_ATTRIBUTE}]`);
    expect(entry?.previousElementSibling?.getAttribute('href')).toBe('/settings');
    expect(entry?.textContent).toBe('Paramètre d’extension');
    expect(entry?.className).toBe('row');
    expect(entry?.hasAttribute('href')).toBe(false);
  });
  it('ouvre le réglage au clic sans suivre le lien', () => {
    const open = vi.fn();
    decorateExtensionSetting(document, open);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector(`[${EXTENSION_SETTING_ATTRIBUTE}]`)?.dispatchEvent(click);
    expect(open).toHaveBeenCalledTimes(1);
    expect(click.defaultPrevented).toBe(true);
  });
  it('ne reprend pas la surbrillance de « Paramètres » quand il est ouvert', () => {
    document.body.innerHTML =
      '<div><a class="row" href="/profile">Profil</a><a class="row active" aria-current="page" href="/settings"><svg></svg>Paramètres</a></div>';
    decorateExtensionSetting(document, () => undefined);
    const entry = document.querySelector(`[${EXTENSION_SETTING_ATTRIBUTE}]`);
    expect(entry?.className).toBe('row');
    expect(entry?.hasAttribute('aria-current')).toBe(false);
  });
  it('ne fait rien sans lien « Paramètres »', () => {
    document.body.innerHTML = '<div></div>';
    expect(decorateExtensionSetting(document, () => undefined)).toBe(0);
  });
});

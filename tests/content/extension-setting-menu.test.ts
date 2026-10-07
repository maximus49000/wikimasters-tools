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
  it('suit la surbrillance de « Paramètres » quand le site la change', async () => {
    decorateExtensionSetting(document, () => undefined);
    const link = document.querySelector('a[href="/settings"]') as HTMLElement;
    const entry = document.querySelector(`[${EXTENSION_SETTING_ATTRIBUTE}]`) as HTMLElement;
    link.className = 'row active';
    link.setAttribute('aria-current', 'page');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(entry.className).toBe('row active');
    expect(entry.getAttribute('aria-current')).toBe('page');
    link.className = 'row';
    link.removeAttribute('aria-current');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(entry.className).toBe('row');
    expect(entry.hasAttribute('aria-current')).toBe(false);
  });
  it('ne fait rien sans lien « Paramètres »', () => {
    document.body.innerHTML = '<div></div>';
    expect(decorateExtensionSetting(document, () => undefined)).toBe(0);
  });
});

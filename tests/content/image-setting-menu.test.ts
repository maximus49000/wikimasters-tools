// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decorateImageSetting, IMAGE_SETTING_ATTRIBUTE } from '../../src/content/image-setting-menu';

const MENU = '<div><a href="/profile">Profil</a><a class="row" href="/settings"><span><svg><path d="M0 0"/></svg></span>Paramètres</a></div>';

describe('decorateImageSetting', () => {
  beforeEach(() => {
    document.body.innerHTML = MENU;
  });

  it('ajoute « Paramètre d’image » sous « Paramètres », une seule fois, avec le style de la ligne', () => {
    expect(decorateImageSetting(document, () => undefined)).toBe(1);
    expect(decorateImageSetting(document, () => undefined)).toBe(0);
    const entry = document.querySelector(`[${IMAGE_SETTING_ATTRIBUTE}]`);
    expect(entry?.previousElementSibling?.getAttribute('href')).toBe('/settings');
    expect(entry?.textContent).toBe('Paramètre d’image');
    expect(entry?.className).toBe('row');
    expect(entry?.hasAttribute('href')).toBe(false);
  });
  it('ouvre le réglage au clic sans suivre le lien', () => {
    const open = vi.fn();
    decorateImageSetting(document, open);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector(`[${IMAGE_SETTING_ATTRIBUTE}]`)?.dispatchEvent(click);
    expect(open).toHaveBeenCalledTimes(1);
    expect(click.defaultPrevented).toBe(true);
  });
  it('suit la surbrillance de « Paramètres » quand le site la change', async () => {
    decorateImageSetting(document, () => undefined);
    const link = document.querySelector('a[href="/settings"]') as HTMLElement;
    const entry = document.querySelector(`[${IMAGE_SETTING_ATTRIBUTE}]`) as HTMLElement;
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
    expect(decorateImageSetting(document, () => undefined)).toBe(0);
  });
});

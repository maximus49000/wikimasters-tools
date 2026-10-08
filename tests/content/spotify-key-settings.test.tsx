// tests/content/spotify-key-settings.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerSettings } from '../../src/content/PlayerSettings';
import { setMusicService, setPlatformChoice, setSpotifyKey, type SpotifyKeyControl } from '../../src/content/music-registry';
import type { MusicService } from '../../src/content/music-service';
import type { PlayerSource, PlayerView } from '../../src/content/player-source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = '30d88341188741668651e8ab170849cb';
let container: HTMLDivElement;
let root: Root;

function makeSource(linked: boolean) {
  const view: PlayerView = { linked, track: null, hidden: false, enabled: true, card: null };
  return { current: () => view, subscribe: () => () => undefined, setEnabled: vi.fn() } as unknown as PlayerSource;
}

function serve(initial: string | null) {
  let key = initial;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const control = {
    clientId: vi.fn(async () => key),
    setClientId: vi.fn(async (value: string) => {
      key = value;
      notify();
      return 'saved' as const;
    }),
    clearClientId: vi.fn(async () => {
      key = null;
      notify();
    }),
    redirectUris: vi.fn(async () => ['https://abc.chromiumapp.org/spotify', 'wikimasterstools://spotify']),
    openGuide: vi.fn(),
    subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
  };
  setSpotifyKey(control as unknown as SpotifyKeyControl);
  const link = vi.fn(async () => null);
  setMusicService({ link, unlink: vi.fn(async () => undefined), isLinked: vi.fn(async () => false), view: vi.fn(), play: vi.fn(), subscribe: () => () => undefined } as unknown as MusicService);
  return { control, link };
}

const render = async (linked: boolean) => {
  await act(async () => {
    root.render(<PlayerSettings source={makeSource(linked)} onClose={() => undefined} />);
  });
};
const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const field = () => container.querySelector<HTMLInputElement>('input[aria-label="Clé Spotify (Client ID)"]');
const text = () => container.textContent ?? '';
const press = (button: HTMLButtonElement | null) => act(async () => void button?.click());
const type = (value: string) =>
  act(async () => {
    const input = field()!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMusicService(null);
  setPlatformChoice(null);
  setSpotifyKey(null);
});

describe('clé Spotify dans le Lecteur', () => {
  it('sans clé : champ, adresses à déclarer, lien vers le mode d’emploi ; Lier explique au lieu de lier', async () => {
    const { link, control } = serve(null);
    await render(false);
    expect(field()).not.toBeNull();
    expect(text()).toContain('wikimasterstools://spotify');
    await press(byLabel('Ouvrir le mode d’emploi'));
    expect(control.openGuide).toHaveBeenCalledTimes(1);
    await press(byLabel('Lier Spotify'));
    expect(link).not.toHaveBeenCalled();
    expect(text()).toContain('Ajoutez d’abord votre clé');
  });

  it('refuse une clé invalide, enregistre une clé valide', async () => {
    const { control } = serve(null);
    await render(false);
    await type('trop court');
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(control.setClientId).not.toHaveBeenCalled();
    expect(text()).toContain('Clé invalide');
    await type(KEY);
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(control.setClientId).toHaveBeenCalledWith(KEY);
    expect(field()).toBeNull();
    expect(byLabel('Remplacer ma clé Spotify')).not.toBeNull();
  });

  it('clé enregistrée : affichée tronquée, Lier fonctionne', async () => {
    const { link } = serve(KEY);
    await render(false);
    expect(text()).toContain('30d88341…70849cb');
    await press(byLabel('Lier Spotify'));
    expect(link).toHaveBeenCalledTimes(1);
  });

  it('le mode d’emploi reste accessible pendant un remplacement de clé', async () => {
    const { control } = serve(KEY);
    await render(false);
    expect(byLabel('Ouvrir le mode d’emploi')).toBeNull();
    await press(byLabel('Remplacer ma clé Spotify'));
    await press(byLabel('Ouvrir le mode d’emploi'));
    expect(control.openGuide).toHaveBeenCalledTimes(1);
  });

  it('compte non lié : remplacer et effacer s’appliquent tout de suite', async () => {
    const { control } = serve(KEY);
    await render(false);
    await press(byLabel('Remplacer ma clé Spotify'));
    await type('a'.repeat(32));
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(control.setClientId).toHaveBeenCalledWith('a'.repeat(32));
    await press(byLabel('Effacer ma clé Spotify'));
    expect(control.clearClientId).toHaveBeenCalledTimes(1);
  });

  it('compte lié : remplacer et effacer demandent confirmation, annuler ne change rien', async () => {
    const { control } = serve(KEY);
    await render(true);
    await press(byLabel('Remplacer ma clé Spotify'));
    await type('a'.repeat(32));
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(control.setClientId).not.toHaveBeenCalled();
    expect(text()).toContain('délie votre compte');
    await press(byLabel('Annuler'));
    expect(control.setClientId).not.toHaveBeenCalled();

    await press(byLabel('Effacer ma clé Spotify'));
    expect(control.clearClientId).not.toHaveBeenCalled();
    await press(byLabel('Effacer et délier'));
    expect(control.clearClientId).toHaveBeenCalledTimes(1);
  });

  it('compte lié : confirmer le remplacement enregistre la nouvelle clé', async () => {
    const { control } = serve(KEY);
    await render(true);
    await press(byLabel('Remplacer ma clé Spotify'));
    await type('a'.repeat(32));
    await press(byLabel('Enregistrer ma clé Spotify'));
    await press(byLabel('Remplacer et délier'));
    expect(control.setClientId).toHaveBeenCalledWith('a'.repeat(32));
  });

  it('sans contrôle (plateforme sans clé) : rien n’est affiché et Lier marche comme avant', async () => {
    setSpotifyKey(null);
    const link = vi.fn(async () => null);
    setMusicService({ link, unlink: vi.fn(), isLinked: vi.fn(async () => false), view: vi.fn(), play: vi.fn(), subscribe: () => () => undefined } as unknown as MusicService);
    await render(false);
    expect(field()).toBeNull();
    await press(byLabel('Lier Spotify'));
    expect(link).toHaveBeenCalledTimes(1);
  });
});

describe('corrections de revue', () => {
  it('Annuler efface le message « Clé invalide »', async () => {
    serve(KEY);
    await render(false);
    await press(byLabel('Remplacer ma clé Spotify'));
    await type('trop court');
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(text()).toContain('Clé invalide');
    await press(byLabel('Annuler'));
    expect(text()).not.toContain('Clé invalide');
  });

  it('le rappel « Ajoutez d’abord » disparaît une fois la clé enregistrée, puis Lier lie', async () => {
    const { link } = serve(null);
    await render(false);
    await press(byLabel('Lier Spotify'));
    expect(text()).toContain('Ajoutez d’abord votre clé');
    await type(KEY);
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(text()).not.toContain('Ajoutez d’abord votre clé');
    await press(byLabel('Lier Spotify'));
    expect(link).toHaveBeenCalledTimes(1);
  });

  it('la saisie est désactivée pendant la confirmation du remplacement', async () => {
    serve(KEY);
    await render(true);
    await press(byLabel('Remplacer ma clé Spotify'));
    await type('a'.repeat(32));
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(field()!.disabled).toBe(true);
    await press(byLabel('Annuler'));
    expect(field()).toBeNull();
  });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotifyRemoteSettings } from '../../src/content/SpotifyRemoteSettings';
import type { RemoteControl } from '../../src/content/music-registry';
import type { RemoteStatus } from '../../src/core/spotify/remote-playback';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function control(initial: RemoteStatus) {
  let status = initial;
  const listeners = new Set<() => void>();
  const remote: RemoteControl = {
    status: vi.fn(async () => status),
    packageName: () => 'io.github.maximus49000.wikimasterstools',
    fingerprint: () => 'C2:21:A4:37:FA:93:03:8C:31:B1:61:D1:B5:49:68:A9:C1:26:F3:9E',
    reset: vi.fn(async () => {
      status = 'untried';
      listeners.forEach((l) => l());
    }),
    subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
  };
  return remote;
}

const render = async (remote: RemoteControl) => {
  await act(async () => {
    root.render(<SpotifyRemoteSettings remote={remote} />);
  });
};
const text = () => container.textContent ?? '';
const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SpotifyRemoteSettings', () => {
  it.each([
    ['ok', 'Lecture directe par l’appli Spotify : active.'],
    ['untried', 'Lecture directe par l’appli Spotify : sera essayée à la prochaine lecture.'],
    ['not-configured', 'Ta clé Spotify n’autorise pas encore ce téléphone : ajoute les deux lignes ci-dessous dans ta clé (Android packages). En attendant, la lecture passe par l’ancienne méthode.'],
    ['not-installed', 'Installe l’appli Spotify pour la lecture directe.'],
    ['outdated', 'Mets à jour l’appli Spotify.'],
  ] as const)('statut %s : la bonne ligne d’état', async (status, line) => {
    await render(control(status));
    expect(text()).toContain(line);
  });

  it('montre le paquet et l’empreinte, chacun avec un bouton copier', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await render(control('ok'));
    expect(text()).toContain('À déclarer chez Spotify (Android packages)');
    expect(text()).toContain('io.github.maximus49000.wikimasterstools');
    expect(text()).toContain('C2:21:A4:37:FA:93:03:8C:31:B1:61:D1:B5:49:68:A9:C1:26:F3:9E');
    await act(async () => byLabel('Copier le nom du paquet')?.click());
    await act(async () => byLabel('Copier l’empreinte SHA-1')?.click());
    expect(writeText).toHaveBeenNthCalledWith(1, 'io.github.maximus49000.wikimasterstools');
    expect(writeText).toHaveBeenNthCalledWith(2, 'C2:21:A4:37:FA:93:03:8C:31:B1:61:D1:B5:49:68:A9:C1:26:F3:9E');
  });

  it('« Réessayer la lecture directe » seulement quand le SDK est écarté ; remet le statut à zéro', async () => {
    await render(control('ok'));
    expect(byLabel('Réessayer la lecture directe')).toBeNull();
    const remote = control('not-configured');
    await render(remote);
    expect(byLabel('Réessayer la lecture directe')?.textContent).toContain('Réessayer la lecture directe');
    await act(async () => byLabel('Réessayer la lecture directe')?.click());
    expect(remote.reset).toHaveBeenCalled();
    expect(text()).toContain('sera essayée à la prochaine lecture');
  });
});

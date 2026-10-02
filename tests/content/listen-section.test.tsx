// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListenSection } from '../../src/content/ListenSection';
import { setMusicService, setPlatformChoice } from '../../src/content/music-registry';
import type { ListenView, MusicService } from '../../src/content/music-service';
import { createPlatformSetting } from '../../src/core/music/platform';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIMITED = 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.';
const limited = (retryAfterMs?: number): ListenView => ({ status: 'error', message: LIMITED, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) });
const ready = (title: string): ListenView => ({
  status: 'ready',
  listen: { kind: 'album', items: [{ uri: `spotify:track:${title}`, title, artist: 'The Beatles' }], albumUri: 'spotify:album:A' },
});

let container: HTMLDivElement;
let root: Root;
// Auditeurs du service (liaison ou déliaison de Spotify) : `relink()` simule l'événement.
let listeners: Set<() => void>;
const relink = () => act(async () => listeners.forEach((listener) => listener()));

const serviceOf = (view: ReturnType<typeof vi.fn>) => {
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  setMusicService({ view, subscribe, play: vi.fn(), link: vi.fn(), unlink: vi.fn() } as unknown as MusicService);
  return view;
};

async function render(slug = 'Abbey_Road') {
  await act(async () => {
    root.render(<ListenSection slug={slug} title={slug} />);
  });
}

// Fait avancer l'horloge simulée par pas, chacun dans son `act` : React ne rend qu'à la sortie d'un `act`, et la fiche
// doit pouvoir réarmer son minuteur entre deux échéances.
const wait = async (ms: number, step = 1_000) => {
  for (let left = ms; left > 0; left -= step) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(step, left));
    });
  }
};

const text = () => container.textContent ?? '';

beforeEach(() => {
  vi.useFakeTimers();
  listeners = new Set();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMusicService(null);
  setPlatformChoice(null);
  vi.useRealTimers();
});

describe('ListenSection, relance après une limite Spotify', () => {
  it('recharge une fois le délai passé (plus une seconde de marge) et affiche alors les titres', async () => {
    const view = serviceOf(vi.fn().mockResolvedValueOnce(limited(3_000)).mockResolvedValue(ready('Come Together')));
    await render();
    expect(text()).toContain(LIMITED);

    await wait(3_999);
    expect(view).toHaveBeenCalledTimes(1);
    await wait(1);
    expect(view).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Come Together');
    expect(text()).not.toContain(LIMITED);
  });

  it("garde le message affiché pendant une nouvelle tentative : la fiche ne disparaît pas puis ne revient pas à chaque essai", async () => {
    let answer: (view: ListenView) => void = () => undefined;
    const view = serviceOf(
      vi
        .fn()
        .mockResolvedValueOnce(limited(3_000))
        .mockImplementationOnce(() => new Promise<ListenView>((resolve) => (answer = resolve)))
        .mockResolvedValue(limited(3_000)),
    );
    await render();
    await wait(4_000);
    // La relance est partie et Spotify n'a pas encore répondu : le message est toujours là.
    expect(view).toHaveBeenCalledTimes(2);
    expect(text()).toContain(LIMITED);
    await act(async () => answer(limited(3_000)));
    expect(text()).toContain(LIMITED);
  });

  it("vide la fiche de la carte précédente dès qu'on change de carte, même si la nouvelle tarde à répondre", async () => {
    serviceOf(vi.fn((slug: string) => (slug === 'Abbey_Road' ? Promise.resolve(limited(10_000)) : new Promise<ListenView>(() => undefined))));
    await render();
    expect(text()).toContain(LIMITED);
    await render('Revolver');
    expect(text()).toBe('');
  });

  it("réarme avec le nouveau délai si la limite revient, mais s'arrête après 5 tentatives automatiques d'affilée", async () => {
    const view = serviceOf(vi.fn(async () => limited(1_000)));
    await render();
    await wait(60_000);
    expect(view).toHaveBeenCalledTimes(6);
    // Plus de relance : le message reste.
    expect(text()).toContain(LIMITED);
    await wait(3_600_000, 600_000);
    expect(view).toHaveBeenCalledTimes(6);
  });

  it("remet le compteur d'essais à zéro quand le chargement réussit : une nouvelle limite retrouve ses 5 tentatives", async () => {
    const view = serviceOf(
      vi
        .fn()
        .mockResolvedValueOnce(limited(1_000))
        .mockResolvedValueOnce(ready('Come Together'))
        .mockResolvedValue(limited(1_000)),
    );
    await render();
    await wait(2_000);
    expect(text()).toContain('Come Together');
    // Même fiche, rechargée (liaison de Spotify) : la limite revient, avec son budget d'essais entier.
    await relink();
    await wait(60_000);
    expect(view).toHaveBeenCalledTimes(2 + 1 + 5);
  });

  it("compte les essais par carte : une autre carte retrouve ses 5 tentatives", async () => {
    const view = serviceOf(vi.fn(async () => limited(1_000)));
    await render();
    await wait(60_000);
    await render('Revolver');
    await wait(60_000);
    expect(view).toHaveBeenCalledTimes(6 + 6);
  });

  it("ne relance pas une autre erreur, ni une limite sans délai connu", async () => {
    const other = serviceOf(vi.fn(async (): Promise<ListenView> => ({ status: 'error', message: 'Spotify est indisponible pour le moment.' })));
    await render();
    await wait(3_600_000, 600_000);
    expect(other).toHaveBeenCalledTimes(1);

    const unknownDelay = serviceOf(vi.fn(async () => limited()));
    await render('Revolver');
    await wait(3_600_000, 600_000);
    expect(unknownDelay).toHaveBeenCalledTimes(1);
  });

  it("abandonne la relance en attente quand on change de carte", async () => {
    const view = serviceOf(vi.fn(async (slug: string) => (slug === 'Abbey_Road' ? limited(10_000) : ready('Taxman'))));
    await render();
    await render('Revolver');
    expect(text()).toContain('Taxman');
    await wait(60_000);
    // Une fois pour Abbey Road, une fois pour Revolver : aucun rechargement de la carte quittée.
    expect(view.mock.calls.map(([slug]) => slug)).toEqual(['Abbey_Road', 'Revolver']);
  });

  it("borne le délai à la limite des minuteurs : un très long délai ne déclenche pas une relance immédiate", async () => {
    const view = serviceOf(vi.fn(async () => limited(10_000_000_000)));
    await render();
    await wait(5_000);
    expect(view).toHaveBeenCalledTimes(1);
  });

  it("n'a plus rien à relancer une fois la fiche fermée", async () => {
    const view = serviceOf(vi.fn(async () => limited(2_000)));
    await render();
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => root.render(<div />));
    // Le minuteur en attente est annulé avec la fiche.
    expect(vi.getTimerCount()).toBe(0);
    await wait(60_000);
    expect(view).toHaveBeenCalledTimes(1);
  });

  it("n'offre aucun bouton pour réessayer à la main : un nouvel essai pendant la pause ne servirait à rien", async () => {
    serviceOf(vi.fn(async () => limited(30_000)));
    await render();
    expect(text()).toContain(LIMITED);
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('ListenSection, déliaison', () => {
  const labels = () => [...container.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'));

  it('ne propose jamais de délier le compte (réservé à Plus, Lecteur)', async () => {
    serviceOf(vi.fn().mockResolvedValue(ready('Come Together')));
    await render();
    expect(labels()).toContain('Lire Come Together');
    expect(labels()).not.toContain('Délier Spotify');
  });

  it("garde « Lier » quand le compte n'est pas lié", async () => {
    serviceOf(vi.fn().mockResolvedValue({ status: 'unlinked' }));
    await render();
    expect(labels()).toContain('Lier Spotify pour écouter');
  });
});

describe('ListenSection, Tidal', () => {
  const memory = (initial: string) => {
    const data = new Map<string, string>([['wmt:musicPlatform', initial]]);
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  };
  const tidalReady = (): ListenView => ({
    status: 'ready',
    listen: { kind: 'album', items: [{ uri: 'tidal:track:11564034', title: 'Love Me Do', artist: 'The Beatles' }], albumUri: 'tidal:album:11564033' },
  });
  const useTidal = () => setPlatformChoice({ available: ['spotify', 'tidal'], setting: createPlatformSetting(memory('tidal')) });

  it('propose un lien vers Tidal par piste (pas de lecture), et la mention Tidal', async () => {
    useTidal();
    serviceOf(vi.fn().mockResolvedValue(tidalReady()));
    await render();
    const link = container.querySelector<HTMLAnchorElement>('a[aria-label="Ouvrir Love Me Do dans Tidal"]');
    expect(link?.getAttribute('href')).toBe('https://tidal.com/browse/track/11564034');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(container.querySelector('button[aria-label="Lire Love Me Do"]')).toBeNull();
    const brand = [...container.querySelectorAll('a')].find((anchor) => anchor.textContent === 'Écoute sur TIDAL');
    expect(brand?.getAttribute('href')).toBe('https://tidal.com');
  });

  it("nomme Tidal quand le compte n'est pas lié ou que la carte est introuvable", async () => {
    useTidal();
    serviceOf(vi.fn().mockResolvedValue({ status: 'unlinked' }));
    await render();
    expect(container.querySelector('button[aria-label="Lier Tidal pour écouter"]')).not.toBeNull();
    serviceOf(vi.fn().mockResolvedValue({ status: 'notfound' }));
    await relink();
    expect(text()).toContain('Introuvable sur Tidal.');
  });

  it("avec Spotify, la section reste celle d'avant : ▶ et aucune mention Tidal", async () => {
    serviceOf(vi.fn().mockResolvedValue(ready('Come Together')));
    await render();
    expect(container.querySelector('button[aria-label="Lire Come Together"]')).not.toBeNull();
    expect(text()).not.toContain('TIDAL');
  });
});

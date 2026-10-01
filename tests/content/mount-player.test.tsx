// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mountSpotifyPlayer, PLAYER_HOST_ATTRIBUTE } from '../../src/content/mount-player';
import type { PlayerSource } from '../../src/content/player-source';

const view = { linked: false, track: null, hidden: false, enabled: true };
const source = {
  current: () => view,
  subscribe: () => () => undefined,
} as unknown as PlayerSource;

const hosts = () => document.querySelectorAll(`[${PLAYER_HOST_ATTRIBUTE}]`);

describe('mountSpotifyPlayer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('ne monte qu’un lecteur, même appelé plusieurs fois', () => {
    mountSpotifyPlayer(source);
    mountSpotifyPlayer(source);
    expect(hosts()).toHaveLength(1);
  });

  it('se remet dans la page quand le site a vidé <body> (hydratation tardive)', () => {
    mountSpotifyPlayer(source);
    document.body.innerHTML = '<main>page</main>';
    expect(hosts()).toHaveLength(0);
    mountSpotifyPlayer(source);
    expect(hosts()).toHaveLength(1);
    mountSpotifyPlayer(source);
    expect(hosts()).toHaveLength(1);
  });
});

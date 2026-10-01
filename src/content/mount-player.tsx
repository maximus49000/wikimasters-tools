import { createRoot } from 'react-dom/client';
import { SpotifyPlayer } from './SpotifyPlayer';
import type { PlayerSource } from './player-source';

const PLAYER_HOST_ATTRIBUTE = 'data-wmt-spotify-player';

// Mini-lecteur monté une fois sur la page, hors du DOM du jeu (shadow DOM) ; il s'efface seul sans lecture.
export function mountSpotifyPlayer(source: PlayerSource): void {
  if (document.querySelector(`[${PLAYER_HOST_ATTRIBUTE}]`)) return;
  const host = document.createElement('div');
  host.setAttribute(PLAYER_HOST_ATTRIBUTE, '');
  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);
  document.body.appendChild(host);
  createRoot(mountPoint).render(<SpotifyPlayer source={source} />);
}

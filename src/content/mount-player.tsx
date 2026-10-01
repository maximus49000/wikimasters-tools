import { createRoot } from 'react-dom/client';
import { SpotifyPlayer } from './SpotifyPlayer';
import type { PlayerSource } from './player-source';

export const PLAYER_HOST_ATTRIBUTE = 'data-wmt-spotify-player';

let host: HTMLElement | null = null;

// Mini-lecteur monté une fois, hors du DOM du jeu (shadow DOM) ; il s'efface seul sans lecture.
// Le site peut remplacer le contenu de <body> après notre montage (hydratation tardive, surtout sur téléphone) :
// rappelé, on remet le même lecteur dans la page au lieu d'en créer un second.
// `openCard` : le bouton « Carte » du lecteur ouvre la fiche de la carte dont vient la lecture.
export function mountSpotifyPlayer(source: PlayerSource, openCard: (slug: string) => void): void {
  if (host) {
    if (!host.isConnected) document.body.appendChild(host);
    return;
  }
  const created = document.createElement('div');
  created.setAttribute(PLAYER_HOST_ATTRIBUTE, '');
  const shadow = created.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);
  document.body.appendChild(created);
  createRoot(mountPoint).render(<SpotifyPlayer source={source} openCard={openCard} />);
  host = created;
}

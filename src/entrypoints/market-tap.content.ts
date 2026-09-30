import { installMarketTap, type TapWindow } from '../content/market-tap';

// Monde MAIN : c'est le seul endroit où l'on peut observer le fetch de la page elle-même.
export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installMarketTap(window as unknown as TapWindow);
  },
});

import { startOverlay } from '../app/overlay';
import { createLocalStorageStore } from '../core/cache/store';
import { installMarketTap, type TapWindow } from '../content/market-tap';

// Application Android : une seule WebView, donc un seul monde JavaScript (pas de MAIN/ISOLATED comme dans l'extension).
// Le script est injecté dès le début du document : l'observation du marché doit précéder les premiers fetch de la page.
const flagged = window as unknown as { __wikimastersTools?: boolean };
if (!flagged.__wikimastersTools) {
  flagged.__wikimastersTools = true;
  installMarketTap(window as unknown as TapWindow);
  // La surcouche attend la fin du chargement (comme l'extension, à `document_idle`) pour ne pas gêner l'hydratation du site.
  const start = () => void startOverlay(createLocalStorageStore());
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

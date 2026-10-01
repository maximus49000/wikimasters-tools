import { createChromeLocalStore } from '../core/cache/store';
import { startOverlay } from '../app/overlay';
import { createChromeSpotifyEnv } from '../app/extension-spotify';

export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  async main() {
    await startOverlay(createChromeLocalStore(), createChromeSpotifyEnv());
  },
});

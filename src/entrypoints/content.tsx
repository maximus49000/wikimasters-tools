import { createChromeLocalStore } from '../core/cache/store';
import { startOverlay } from '../app/overlay';

export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  async main() {
    await startOverlay(createChromeLocalStore());
  },
});

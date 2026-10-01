import { handleSpotifyMessage } from '../core/spotify/transport';

// Seul le service worker peut lancer `identity.launchWebAuthFlow` ; il fait aussi les appels à Spotify (hors des règles CSP du site).
export default defineBackground(() => {
  // Utile pour déclarer l'adresse de retour dans le tableau de bord Spotify (surtout sous Firefox).
  console.info('[wikimasters-tools]', 'adresse de retour Spotify :', browser.identity.getRedirectURL());

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const reply = handleSpotifyMessage(message, {
      launchWebAuthFlow: async (url) => {
        const returned = await browser.identity.launchWebAuthFlow({ url, interactive: true });
        if (!returned) throw new Error('liaison annulée');
        return returned;
      },
      getRedirectUrl: () => browser.identity.getRedirectURL(),
      fetch: (url, init) => fetch(url, init),
    });
    if (!reply) return false;
    void reply.then(sendResponse);
    // Réponse asynchrone.
    return true;
  });
});

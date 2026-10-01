import { handleSpotifyMessage } from '../core/spotify/transport';

// Seul le service worker peut lancer `identity.launchWebAuthFlow` ; il fait aussi les appels à Spotify (hors des règles CSP du site).
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const reply = handleSpotifyMessage(message, {
      launchWebAuthFlow: async (url) => {
        const returned = await browser.identity.launchWebAuthFlow({ url, interactive: true });
        if (!returned) throw new Error('liaison annulée');
        return returned;
      },
      getRedirectUrl: () => {
        // `identity` peut manquer (Firefox Android).
        const url = browser.identity?.getRedirectURL?.();
        if (!url) throw new Error('identity indisponible');
        return url;
      },
      // Pas de redirection suivie : les jetons et l'en-tête d'autorisation ne quittent pas Spotify.
      // Réponses toujours fraîches : un 429 resservi par un cache prolongerait à tort une pause enregistrée.
      fetch: (url, init) => fetch(url, { ...init, redirect: 'error', cache: 'no-store' }),
    });
    if (!reply) return false;
    void reply.then(sendResponse);
    // Réponse asynchrone.
    return true;
  });

  // Utile pour déclarer l'adresse de retour dans le tableau de bord Spotify (surtout sous Firefox).
  console.info('[wikimasters-tools]', 'adresse de retour Spotify :', browser.identity?.getRedirectURL?.());
});

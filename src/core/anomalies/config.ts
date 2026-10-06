// Jeton GitHub limité aux issues de ce dépôt, injecté à la compilation depuis `.env.local` ; vide : « Remonter une anomalie » est absent.
// Il voyage dans l'extension publique : il ne sert qu'à créer des issues (aucun droit sur le code).
export const GITHUB_ISSUES_TOKEN: string = import.meta.env.WXT_GITHUB_ISSUES_TOKEN ?? '';
export const ANOMALY_REPO = 'maximus49000/wikimasters-tools';
export const ANOMALY_API_PREFIX = `https://api.github.com/repos/${ANOMALY_REPO}/`;

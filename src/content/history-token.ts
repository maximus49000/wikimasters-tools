// Jeton propre à chaque ouverture d'un zoom ou d'une couche : une entrée d'historique plus ancienne portant la même clé
// (page rechargée pendant l'ouverture, entrée orpheline) ne doit pas être prise pour la nôtre.
export const historyToken = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

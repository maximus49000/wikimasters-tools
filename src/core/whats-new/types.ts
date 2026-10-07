export type Theme = 'app' | 'collection' | 'fiche' | 'ecoute';

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'app', label: 'Application' },
  { id: 'collection', label: 'Collection' },
  { id: 'fiche', label: 'Fiche d’une carte' },
  { id: 'ecoute', label: 'Écoute et médias' },
];

// `target` : sélecteur CSS de l'élément à éclairer (cherché aussi dans les shadow DOM ouverts) ; null = étape de texte seul.
export type TourStep = { target: string | null; title: string; text: string };

// `fresh` : annoncée même au tout premier lancement (réservé à la fiche qui présente WikiHow).
export type Entry = { id: string; theme: Theme; glyph: string; title: string; summary: string; steps: TourStep[]; fresh?: boolean };

export type Fix = { id: string; title: string };

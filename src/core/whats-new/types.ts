export type Theme = 'app' | 'collection' | 'fiche' | 'ecoute';

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'app', label: 'Application' },
  { id: 'collection', label: 'Collection' },
  { id: 'fiche', label: 'Fiche d’une carte' },
  { id: 'ecoute', label: 'Écoute et médias' },
];

export type CardKind = 'game' | 'music' | 'screen' | 'any';
export type RevealItem = string | { text: string };
// Où et comment l'élément visé apparaît : page du site, éléments à toucher pour le faire apparaître, nature de carte dont il faut ouvrir la fiche.
export type Scene = { page?: string; card?: CardKind; reveal?: RevealItem[] };

// `target` : sélecteur CSS de l'élément à éclairer (cherché aussi dans les shadow DOM ouverts) ; null = étape de texte seul.
// `text` : à quoi sert l'élément. `details` : tout ce qui aide à le comprendre et à s'en servir, en paragraphes titrés
// (d'où viennent les données, comment s'en servir, limites…).
export type StepDetail = { label: string; text: string };
// `glyph` : celui de la fiche, posé au lancement de la visite ; l'encart de l'interface le montre quand l'élément n'est pas à l'écran.
export type TourStep = { target: string | null; title: string; text: string; details?: StepDetail[]; scene?: Scene; glyph?: string };

// `fresh` : annoncée même au tout premier lancement (réservé à la fiche qui présente WikiHow).
export type Entry = { id: string; theme: Theme; glyph: string; title: string; summary: string; steps: TourStep[]; fresh?: boolean };

export type Fix = { id: string; title: string };

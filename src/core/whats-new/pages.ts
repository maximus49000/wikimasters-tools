import type { Entry, TourStep } from './types';

export type StepPage = { label: string; text: string; encart: boolean };

// Une étape se lit en pages courtes : « à quoi ça sert » (avec l'encart de l'interface), puis un paragraphe titré par page.
export function pagesOf(step: TourStep): StepPage[] {
  return [
    { label: 'À quoi ça sert', text: step.text, encart: true },
    ...(step.details ?? []).map((detail) => ({ label: detail.label, text: detail.text, encart: false })),
  ];
}

// Les étapes d'une fiche, avec son glyphe : l'encart de l'interface s'en sert quand l'élément n'est pas à l'écran.
export const stepsOf = (entry: Entry): TourStep[] => entry.steps.map((step) => ({ ...step, glyph: entry.glyph }));

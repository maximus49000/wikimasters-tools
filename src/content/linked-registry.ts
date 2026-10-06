import type { LinkedSource } from './linked-source';

// Les cartes liées sont créées une fois par la surcouche ; le bloc de la fiche native les lit ici.
export type LinkedService = {
  source: LinkedSource;
  // Ouvre la fiche d'une carte liée : `from` est le bloc de la fiche actuelle, qui est refermée d'abord.
  open(from: Element, slug: string): void;
};

let service: LinkedService | null = null;

export const setLinkedService = (next: LinkedService | null): void => {
  service = next;
};
export const getLinkedService = (): LinkedService | null => service;

// src/content/documentary-registry.ts
import type { DocumentaryService } from './documentary-service';

// Le service est créé une fois par la surcouche ; les fiches de carte le lisent ici.
let service: DocumentaryService | null = null;

export const setDocumentaryService = (next: DocumentaryService | null): void => {
  service = next;
};
export const getDocumentaryService = (): DocumentaryService | null => service;

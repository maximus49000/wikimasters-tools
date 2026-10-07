// src/content/book-registry.ts
import type { BookService } from './book-service';

// Le service est créé une fois par la surcouche ; les fiches de carte le lisent ici.
let service: BookService | null = null;

export const setBookService = (next: BookService | null): void => {
  service = next;
};
export const getBookService = (): BookService | null => service;

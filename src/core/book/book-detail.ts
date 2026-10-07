export type BookFetch = (url: string) => Promise<Response>;

// Un livre tel que la fiche l'affiche. `id` : identifiant Open Library de l'œuvre (OL…W).
export type BookDetail = {
  id: string;
  title: string;
  author?: string;
  year?: number;
  publisher?: string;
  pages?: number;
  // ISBN-13 d'une édition (sert aux liens d'achat, plan suivant).
  isbn?: string;
  genres: string[];
  synopsis?: { text: string; url: string; source: 'wikipedia' | 'openlibrary' };
  coverUrl?: string;
  pageUrl: string;
};

export type ReadingSource = 'wikisource' | 'gutenberg' | 'archive';

// Une source de lecture gratuite : « Lire gratuitement » ouvre cette adresse dans un onglet.
export type ReadingLink = { source: ReadingSource; label: string; url: string };

// Les trois sources connues d'un livre (une adresse chacune au plus).
export type ReadingSources = { wikisource?: string; gutenberg?: string; archive?: string };

const LABELS: Record<ReadingSource, string> = { wikisource: 'Wikisource', gutenberg: 'Projet Gutenberg', archive: 'Internet Archive' };

// Titre de page Wikisource FR → adresse (les espaces deviennent des soulignés, le reste est encodé).
export const wikisourceUrl = (title: string): string => `https://fr.wikisource.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
export const gutenbergUrl = (id: string): string => `https://www.gutenberg.org/ebooks/${encodeURIComponent(id)}`;
export const archiveUrl = (identifier: string): string => `https://archive.org/details/${encodeURIComponent(identifier)}`;

// Dans l'ordre de lisibilité : Wikisource (texte mis en forme), Gutenberg, Internet Archive (scans).
export function readingLinks(sources: ReadingSources): ReadingLink[] {
  return (['wikisource', 'gutenberg', 'archive'] as const).flatMap((source) => {
    const url = sources[source];
    return url ? [{ source, label: LABELS[source], url }] : [];
  });
}

// Droit français : l'œuvre est protégée 70 ans après la mort de l'auteur (jusqu'à la fin de cette année-là).
export const protectedUntil = (deathYear: number): number => deathYear + 70;

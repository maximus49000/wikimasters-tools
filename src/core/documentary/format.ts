// src/core/documentary/format.ts
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

// Repli quand aucune vidéo n'est assez pertinente : recherche « nom + documentaire » chez trois diffuseurs.
export function searchLinks(name: string): { label: string; url: string }[] {
  const query = encodeURIComponent(`${name} documentaire`);
  const plain = encodeURIComponent(name);
  return [
    { label: 'YouTube', url: `https://www.youtube.com/results?search_query=${query}` },
    { label: 'Arte', url: `https://www.arte.tv/fr/search/?q=${plain}` },
    { label: 'INA', url: `https://www.ina.fr/recherche?q=${plain}` },
  ];
}

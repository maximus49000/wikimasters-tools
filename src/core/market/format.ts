const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function formatAge(ms: number): string {
  if (ms < MIN) return 'à l’instant';
  if (ms < HOUR) return `il y a ${Math.floor(ms / MIN)} min`;
  if (ms < DAY) return `il y a ${Math.floor(ms / HOUR)} h`;
  return `il y a ${Math.floor(ms / DAY)} j`;
}

export function formatRemaining(ms: number): string {
  if (ms < MIN) return 'moins d’1 min';
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min`;
  const minutes = Math.floor((ms % HOUR) / MIN);
  return `${Math.floor(ms / HOUR)} h ${String(minutes).padStart(2, '0')}`;
}

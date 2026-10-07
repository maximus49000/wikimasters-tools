// Glyphes en ligne (trait, héritent la couleur du texte) : le texte tient mal sur mobile.
const PATHS = {
  play: <polygon points="7,4 20,12 7,20" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" />
    </>
  ),
  'chevron-down': <polyline points="6,9 12,15 18,9" />,
  'chevron-up': <polyline points="6,15 12,9 18,15" />,
  note: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  unlink: (
    <>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  star: <polygon points="12,3 14.8,9 21,9.8 16.4,14.2 17.6,21 12,17.8 6.4,21 7.6,14.2 3,9.8 9.2,9" />,
  back: (
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12,5 5,12 12,19" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="7" y1="4" x2="7" y2="20" />
      <line x1="17" y1="4" x2="17" y2="20" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <polyline points="21,3 21,8 16,8" />
      <polyline points="3,21 3,16 8,16" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </>
  ),
  card: (
    <>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <rect x="8" y="5" width="8" height="7" rx="1" />
      <path d="M8 15h8" />
      <path d="M8 18h5" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" />
      <line x1="14" y1="5" x2="14" y2="7" />
      <line x1="14" y1="11" x2="14" y2="13" />
      <line x1="14" y1="17" x2="14" y2="19" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M3 4h2l2.4 11h11l2-8H6.2" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <line x1="20" y1="4" x2="11" y2="13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  playlist: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="10" y2="18" />
      <path d="M17 18v-5l4-1" />
      <circle cx="15.5" cy="18" r="1.5" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  swap: (
    <>
      <polyline points="16,3 20,7 16,11" />
      <line x1="4" y1="7" x2="20" y2="7" />
      <polyline points="8,21 4,17 8,13" />
      <line x1="20" y1="17" x2="4" y2="17" />
    </>
  ),
  gamepad: (
    <>
      <rect x="2" y="7" width="20" height="11" rx="5" />
      <line x1="7" y1="10.5" x2="7" y2="14.5" />
      <line x1="5" y1="12.5" x2="9" y2="12.5" />
      <circle cx="15.5" cy="11.5" r="1" />
      <circle cx="18" cy="13.5" r="1" />
    </>
  ),
  book: (
    <>
      <path d="M12 7c-1.7-1.3-4-2-7-2v13c3 0 5.3.7 7 2" />
      <path d="M12 7c1.7-1.3 4-2 7-2v13c-3 0-5.3.7-7 2" />
      <line x1="12" y1="7" x2="12" y2="20" />
    </>
  ),
} as const;

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, size = 18 }: { name: GlyphName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

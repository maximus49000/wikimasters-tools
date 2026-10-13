import type { ReactElement, ReactNode } from 'react';

// Briques d'interface de Ma Pièce : glyphe, bouton à glyphe et jeu de glyphes (viewBox 24, trait).
export function Icon({ paths }: { paths: readonly string[] }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export const ICONS = {
  cat: ['M5 9L4 3l5 3', 'M19 9l1-6-5 3', 'M5 9c0 6 2 11 7 11s7-5 7-11c-2-2-5-3-7-3S7 7 5 9z', 'M9 12h.01', 'M15 12h.01', 'M11 15l1 1 1-1'],
  robot: ['M12 3v3', 'M12 3h.01', 'M5 8h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', 'M9 13h.01', 'M15 13h.01', 'M9.5 16.5h5', 'M2 12v3', 'M22 12v3'],
  dog: ['M4 8l2-4 4 3', 'M20 8l-2-4-4 3', 'M5 8c0 7 2 12 7 12s7-5 7-12c-2-2-4-3-7-3S7 6 5 8z', 'M9 11h.01', 'M15 11h.01', 'M10 15h4l-2 2z'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9c.4.4.5.8.5 1.1V16h6v-1c0-.3.1-.7.5-1.1A6 6 0 0 0 12 3z'],
  check: ['M5 12l5 5L20 7'],
  door: ['M5 21V3h10v18', 'M15 4l5 2v15h-5', 'M3 21h18', 'M12 12.5h.01'],
  house: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  // Avancer descend le meuble d'une ligne (flèche vers le bas), Reculer le remonte.
  depthFront: ['M5 20h14', 'M12 4v11', 'M7 11l5 5 5-5'],
  depthBack: ['M5 4h14', 'M12 20V9', 'M7 13l5-5 5 5'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M5 12h14', 'M12 5v14'],
  card: ['M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M12 9v6', 'M9 12h6'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', 'm15 5 4 4'],
  star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  landscape: ['M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z'],
  portrait: ['M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z'],
  move: ['M5 9l-3 3 3 3', 'M9 5l3-3 3 3', 'M15 19l-3 3-3-3', 'M19 9l3 3-3 3', 'M2 12h20', 'M12 2v20'],
  extendLeft: ['M4 4v16', 'M9 12h10', 'M14 7v10'],
  extendRight: ['M20 4v16', 'M5 12h10', 'M10 7v10'],
  shrinkLeft: ['M4 4v16', 'M9 12h10'],
  shrinkRight: ['M20 4v16', 'M5 12h10'],
  fullscreen: ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'],
  sun: ['M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z'],
  clock: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  sliders: ['M4 6h10', 'M18 6h2', 'M4 12h2', 'M10 12h10', 'M4 18h12', 'M20 18h0', 'M14 4v4', 'M6 10v4', 'M16 16v4'],
  widthMinus: ['M3 12h6', 'M21 12h-6', 'M9 8l-4 4 4 4', 'M15 8l4 4-4 4'],
  widthPlus: ['M9 12H3', 'M15 12h6', 'M5 8l4 4-4 4', 'M19 8l-4 4 4 4'],
  heightMinus: ['M12 3v6', 'M12 21v-6', 'M8 9l4-4 4 4', 'M8 15l4 4 4-4'],
  dice: ['M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8.5 8.5h.01', 'M15.5 8.5h.01', 'M12 12h.01', 'M8.5 15.5h.01', 'M15.5 15.5h.01'],
  globe: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c3.5 3.2 3.5 14.8 0 18', 'M12 3c-3.5 3.2-3.5 14.8 0 18'],
  wxCloudy: ['M7 18a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z'],
  wxDrizzle: ['M7 14a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z', 'M9 18l-.7 1.6', 'M14 18l-.7 1.6'],
  wxRain: ['M7 14a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z', 'M8 17l-1 3', 'M12 17l-1 3', 'M16 17l-1 3'],
  wxStorm: ['M7 13a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z', 'M12.5 12l-3 5h4l-2 4'],
  wxSnow: ['M12 3v18', 'M4.2 7.5l15.6 9', 'M19.8 7.5l-15.6 9', 'M9.5 4.5L12 7l2.5-2.5', 'M9.5 19.5L12 17l2.5 2.5'],
  wxFog: ['M4 9h16', 'M6 13h12', 'M4 17h16'],
  heightPlus: ['M12 9V3', 'M12 15v6', 'M8 5l4 4 4-4', 'M8 19l4-4 4 4'],
  widthFull: ['M3 5v14', 'M21 5v14', 'M7 12h10', 'M10 9l-3 3 3 3', 'M14 9l3 3-3 3'],
  heightFull: ['M5 3h14', 'M5 21h14', 'M12 7v10', 'M9 10l3-3 3 3', 'M9 14l3 3 3-3'],
  cloud: ['M7 18a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z'],
  paw: ['M12 13c-3 0-5 3-5 5a2 2 0 0 0 2 2c1.2 0 2-.6 3-.6s1.8.6 3 .6a2 2 0 0 0 2-2c0-2-2-5-5-5z', 'M6 9.5h.01', 'M9.5 6h.01', 'M14.5 6h.01', 'M18 9.5h.01'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronUp: ['M6 15l6-6 6 6'],
  sofaTab: ['M4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6H4z', 'M2 12v5h2', 'M22 12v5h-2', 'M6 17v3', 'M18 17v3'],
  frame: ['M4 4h16v16H4z', 'M8 15l3-4 3 3 2-2 2 3'],
  bricks: ['M3 5h18v14H3z', 'M3 10h18', 'M3 15h18', 'M9 5v5', 'M15 10v5', 'M9 15v4'],
  plants: ['M12 21v-8', 'M12 13c-4 0-6-3-6-7 4 0 6 3 6 7z', 'M12 15c4 0 6-3 6-7-4 0-6 3-6 7z'],
  lights: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9c.4.4.5.8.5 1.1V16h6v-1c0-.3.1-.7.5-1.1A6 6 0 0 0 12 3z'],
  floor: ['M3 8h18v8H3z', 'M6 11h12'],
  walls: ['M4 3h16v18H4z', 'M12 3v18', 'M4 12h16'],
} as const;

export function Btn({ label, pressed, disabled, onClick, data, children, className }: { label: string; pressed?: boolean; disabled?: boolean; onClick: () => void; data?: Record<string, string>; children: ReactNode; className?: string }): ReactElement {
  const attrs = Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value]));
  return (
    <button type="button" className={className ? `wmt-lib-btn ${className}` : 'wmt-lib-btn'} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} {...attrs}>
      {children}
    </button>
  );
}

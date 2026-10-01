import type { CSSProperties } from 'react';

const badge: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: 'rgba(13, 17, 23, 0.85)',
  border: '1px solid rgba(148, 163, 184, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// Le keyframe vit dans le shadow DOM : il ne dépend d'aucune feuille de style du jeu.
const SPIN = '@keyframes wmt-spin { to { transform: rotate(360deg); } }';

export function LoadingGlyph() {
  return (
    <div role="status" aria-label="Prix du marché en cours de chargement" title="Prix du marché en cours de chargement" style={badge}>
      <style>{SPIN}</style>
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        style={{ animation: 'wmt-spin 0.9s linear infinite' }}
      >
        <circle cx="12" cy="12" r="9" stroke="rgba(148, 163, 184, 0.35)" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke="#34d399" />
      </svg>
    </div>
  );
}

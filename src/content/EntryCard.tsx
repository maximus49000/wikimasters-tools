const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

// Carte d'une fonction : semi-transparente une fois consultée, pastille d'accent tant qu'elle ne l'est pas.
export function EntryCard({ glyph, title, summary, consulted, onClick }: { glyph: string; title: string; summary: string; consulted: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-consulted={consulted ? '' : undefined}
      style={{ position: 'relative', textAlign: 'left', minHeight: 92, padding: 10, cursor: 'pointer', color: 'inherit', background: 'rgba(148,163,184,0.08)', border, borderRadius: 12, opacity: consulted ? 0.45 : 1, transition: 'opacity .25s', font: 'inherit' }}
    >
      {!consulted && <span aria-label="Pas encore consultée" style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent, #34d399)' }} />}
      <span aria-hidden="true" style={{ fontSize: 20 }}>{glyph}</span>
      <strong style={{ display: 'block', fontSize: 13, margin: '4px 0 2px' }}>{title}</strong>
      <span style={{ display: 'block', fontSize: 12, lineHeight: '16px', opacity: 0.75 }}>{summary}</span>
    </button>
  );
}

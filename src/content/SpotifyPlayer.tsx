import { useSyncExternalStore } from 'react';
import { Glyph } from './Glyphs';
import type { PlayerSource } from './player-source';

const BTN = 44; // cible tactile
const base = {
  width: BTN,
  height: BTN,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  cursor: 'pointer',
  color: 'inherit',
  background: 'none',
  border: 'none',
} as const;

export function SpotifyPlayer({ source }: { source: PlayerSource }) {
  const view = useSyncExternalStore(source.subscribe, source.current);
  // Visible seulement s'il y a une lecture à montrer.
  if (!view.linked || !view.track) return null;
  const { track } = view;
  const toggle = (
    <button type="button" onClick={() => void source.toggle()} aria-label={track.playing ? 'Pause' : 'Lecture'} title={track.playing ? 'Pause' : 'Lecture'} style={{ ...base, borderRadius: '50%', background: 'var(--color-accent, #34d399)', color: '#0d1117' }}>
      <Glyph name={track.playing ? 'pause' : 'play'} size={20} />
    </button>
  );
  const shell = {
    position: 'fixed',
    zIndex: 2147483000,
    top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 999,
    border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
    background: 'var(--color-surface, #0d1117)',
    color: 'var(--color-foreground, #e6edf3)',
    font: '500 13px/1.2 system-ui, sans-serif',
  } as const;

  if (view.hidden) {
    return (
      <div style={{ ...shell, left: 12, paddingLeft: 8 }}>
        <Glyph name="note" size={16} />
        {toggle}
        <button type="button" onClick={() => source.setHidden(false)} aria-label="Afficher le lecteur" title="Afficher le lecteur" style={base}>
          <Glyph name="chevron-up" />
        </button>
      </div>
    );
  }
  return (
    <div style={{ ...shell, left: 12, width: 'min(320px, calc(100vw - 24px))', paddingLeft: 14 }}>
      {track.imageUrl ? (
        <img src={track.imageUrl} alt="" loading="lazy" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flex: 'none', marginRight: 10 }} />
      ) : (
        <span style={{ marginRight: 10, display: 'inline-flex', flex: 'none' }}>
          <Glyph name="note" size={20} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.65, fontSize: 11 }}>{track.artist}</div>
      </div>
      {toggle}
      <button type="button" onClick={() => source.setHidden(true)} aria-label="Masquer le lecteur" title="Masquer le lecteur" style={base}>
        <Glyph name="chevron-down" />
      </button>
    </div>
  );
}

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
  // Visible dès que Spotify est lié, sauf si le réglage « Lecteur » le masque ; sans lecture, il reste là, au repos.
  if (!view.linked || !view.enabled) return null;
  const { track } = view;
  const playing = track?.playing ?? false;
  const toggle = (
    <button type="button" onClick={() => void source.toggle()} aria-label={playing ? 'Pause' : 'Lecture'} title={playing ? 'Pause' : 'Lecture'} style={{ ...base, borderRadius: '50%', background: 'var(--color-accent, #34d399)', color: '#0d1117' }}>
      <Glyph name={playing ? 'pause' : 'play'} size={20} />
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

  // Collé au bord gauche : le bouton de repli est le plus près du bord, puis pause, puis le titre et la pochette.
  const fold = (hidden: boolean) => (
    <button type="button" onClick={() => source.setHidden(hidden)} aria-label={hidden ? 'Masquer le lecteur' : 'Afficher le lecteur'} title={hidden ? 'Masquer le lecteur' : 'Afficher le lecteur'} style={base}>
      <Glyph name={hidden ? 'chevron-down' : 'chevron-up'} />
    </button>
  );

  if (view.hidden) {
    return (
      <div style={{ ...shell, left: 12, paddingRight: 12 }}>
        {fold(false)}
        {toggle}
        <Glyph name="note" size={16} />
      </div>
    );
  }
  return (
    <div style={{ ...shell, left: 12, width: 'min(320px, calc(100vw - 24px))', paddingRight: 14 }}>
      {fold(true)}
      {toggle}
      <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track?.title ?? 'Aucune lecture'}</div>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.65, fontSize: 11 }}>{track?.artist ?? ''}</div>
      </div>
      {track?.imageUrl ? (
        <img src={track.imageUrl} alt="" loading="lazy" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flex: 'none', marginLeft: 10 }} />
      ) : (
        <span style={{ marginLeft: 10, display: 'inline-flex', flex: 'none' }}>
          <Glyph name="note" size={20} />
        </span>
      )}
    </div>
  );
}

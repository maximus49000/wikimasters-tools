import { useSyncExternalStore } from 'react';
import { Glyph } from './Glyphs';
import type { PlayerSource } from './player-source';
import { usePlayerCard } from './usePlayerCard';

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

export function SpotifyPlayer({ source, openCard }: { source: PlayerSource; openCard: (slug: string) => void }) {
  const view = useSyncExternalStore(source.subscribe, source.current);
  const card = usePlayerCard(view);
  // Visible dès que Spotify est lié, sauf si le réglage « Lecteur » le masque ; sans lecture, il reste là, au repos.
  if (!view.linked || !view.enabled) return null;
  const { track } = view;
  const playing = track?.playing ?? false;
  // La fiche de la carte dont vient la lecture ; absent quand la lecture ne vient d'aucune carte.
  const cardButton = card && (
    <button type="button" onClick={() => openCard(card.slug)} aria-label="Ouvrir la carte" title="Ouvrir la carte" style={base}>
      <Glyph name="card" size={20} />
    </button>
  );
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
      <div style={{ ...shell, left: 12, paddingRight: card ? 6 : 12 }}>
        {fold(false)}
        {toggle}
        {cardButton || <Glyph name="note" size={16} />}
      </div>
    );
  }
  return (
    <div style={{ ...shell, left: 12, width: `min(${card ? 364 : 320}px, calc(100vw - 24px))`, paddingRight: 14 }}>
      {fold(true)}
      {toggle}
      <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track?.title ?? 'Aucune lecture'}</div>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.65, fontSize: 11 }}>{track?.artist ?? ''}</div>
      </div>
      {cardButton && <span style={{ display: 'inline-flex', marginLeft: 6 }}>{cardButton}</span>}
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

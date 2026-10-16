// Bulle « En lecture » de la chaîne hi-fi : piste, artiste, album, ⏯ lecture/pause, ⏏ éjecter (le disque rentre, l'objet revient
// à sa place d'origine) et ✕. Ouverte en touchant le poste en mode Visiter ; posée au-dessus du poste, ou centrée sans repère.
import { useEffect, type CSSProperties, type ReactElement } from 'react';
import { useAnchor } from '../action-bubble';
import { getPlayerSource } from '../music-registry';
import type { PlayerView } from '../player-source';

type Props = {
  view: PlayerView;
  albumTitle: string | null;
  onClose: () => void;
  onEject: () => void;
  // Repère du poste dans la scène (sinon la bulle est centrée).
  anchor?: { stage: HTMLElement | null; scroll: HTMLElement | null; targetId: string };
};

const BUTTON: CSSProperties = { minWidth: 44, minHeight: 44, padding: 0, fontSize: 20, lineHeight: 1 };

export function HifiBubble({ view, albumTitle, onClose, onEject, anchor }: Props): ReactElement {
  const { ref, pos } = useAnchor(anchor?.stage ?? null, anchor?.scroll ?? null, anchor?.targetId ?? '', 'above');
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const track = view.track;
  // Un disque est au poste dès qu'une carte est mémorisée, même sans piste (Tidal, Spotify à l'arrêt ou sans appareil) :
  // ⏏ reste alors disponible pour le rendre, sinon il resterait coincé sur le poste.
  const loaded = view.card !== null || track !== null;
  const eject = (): void => {
    const source = getPlayerSource();
    if (track?.playing) void source?.toggle();
    source?.setCard(null);
    onEject();
  };
  const position: CSSProperties = anchor ? { left: pos.left, top: pos.top } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  return (
    <div ref={ref} className="wmt-lib-bubble" data-hifi-bubble role="dialog" aria-label="En lecture" style={{ ...position, alignItems: 'center', flexWrap: 'nowrap', gap: 4, padding: '4px 8px' }}>
      <div data-hifi-bubble-text style={{ display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: 220, lineHeight: 1.25, padding: '0 6px' }}>
        {track ? (
          <>
            <strong data-field="title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</strong>
            <span data-field="artist" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.artist}</span>
            {albumTitle && <span data-field="album" style={{ opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{albumTitle}</span>}
          </>
        ) : view.card ? (
          <>
            <strong data-field="album" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{albumTitle ?? view.card.title}</strong>
            <span data-field="empty" style={{ opacity: 0.75 }}>Rien en lecture</span>
          </>
        ) : (
          <span data-field="empty">Rien en lecture</span>
        )}
      </div>
      {track && <button type="button" className="wmt-lib-btn" data-action="toggle" aria-label="Lecture / pause" title="Lecture / pause" onClick={() => void getPlayerSource()?.toggle()} style={BUTTON}>⏯</button>}
      {loaded && <button type="button" className="wmt-lib-btn" data-action="eject" aria-label="Éjecter le disque" title="Éjecter le disque" onClick={eject} style={BUTTON}>⏏</button>}
      <button type="button" className="wmt-lib-btn" data-action="close" aria-label="Fermer" title="Fermer" onClick={onClose} style={BUTTON}>✕</button>
    </div>
  );
}

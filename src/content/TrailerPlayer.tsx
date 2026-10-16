import { useEffect, useRef, useState } from 'react';
import { embedUrl, thumbnailUrl, watchUrl } from '../core/screen/screen-format';
import { FullscreenButton, fullscreenFrame, useFullscreen } from './fullscreen';
import { Glyph } from './Glyphs';
import { track } from '../core/telemetry/registry';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

// Miniature + ▶ ; l'iframe YouTube (sans cookies) n'est chargée qu'au clic. Le lien externe reste là si le site la bloque.
// `onEnded` : prévenu à la fin de la vidéo (API des lecteurs YouTube par messages : enablejsapi=1, puis « listening » ; état 0 = terminé).
export function TrailerPlayer({ trailerKey, onEnded }: { trailerKey: string; onEnded?: () => void }) {
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  const watching = onEnded !== undefined;
  useEffect(() => {
    if (!playing || !watching) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data) as { event?: string; info?: unknown };
        if (data.event === 'onStateChange' && data.info === 0) endedRef.current?.();
      } catch { /* message étranger */ }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [playing, watching]);
  const fullscreen = useFullscreen<HTMLDivElement>();
  const embed = embedUrl(trailerKey);
  const thumb = thumbnailUrl(trailerKey);
  const watch = watchUrl(trailerKey);
  if (!embed || !watch) return null;

  return (
    <div ref={fullscreen.ref} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', maxHeight: 'min(220px, 32vh)', borderRadius: 8, overflow: 'hidden', background: '#000', border, ...fullscreenFrame(fullscreen.active) }}>
      {playing ? (
        <iframe
          ref={frame}
          src={watching ? `${embed}&enablejsapi=1` : embed}
          onLoad={() => { if (watching) frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); }}
          title="Bande-annonce"
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setPlaying(true);
            track('bande-annonce-lue');
          }}
          aria-label="Lire la bande-annonce"
          title="Lire la bande-annonce"
          style={{
            width: '100%',
            height: '100%',
            cursor: 'pointer',
            border: 0,
            padding: 0,
            color: '#fff',
            background: thumb ? `center / cover no-repeat url(${thumb})` : '#1b2330',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name="play" size={22} />
          </span>
        </button>
      )}
      <FullscreenButton active={fullscreen.active} onClick={fullscreen.toggle} />
      <a
        href={watch}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ouvrir sur YouTube"
        title="Ouvrir sur YouTube"
        style={{ position: 'absolute', top: 4, right: 4, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Glyph name="external" size={16} />
      </a>
    </div>
  );
}

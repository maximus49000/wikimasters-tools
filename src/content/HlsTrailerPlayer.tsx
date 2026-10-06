import { useEffect, useRef, useState } from 'react';
import { Glyph } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const HEIGHT = 'min(130px, 20vh)';

// Bande-annonce Steam (flux HLS) : miniature + ▶ ; hls.js n'est chargé qu'au clic (Chrome ne lit pas le HLS seul).
// Si la lecture échoue (site qui bloque le flux), le lien vers la page du jeu reste là.
export function HlsTrailerPlayer({ url, poster, pageUrl }: { url: string; poster?: string; pageUrl: string }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!playing) return;
    const element = video.current;
    if (!element) return;
    let destroy: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.on(Hls.Events.ERROR, (_event, data) => data.fatal && setFailed(true));
          hls.loadSource(url);
          hls.attachMedia(element);
          destroy = () => hls.destroy();
        } else if (element.canPlayType('application/vnd.apple.mpegurl')) {
          element.src = url;
        } else {
          setFailed(true);
        }
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [playing, url]);

  return (
    <div style={{ position: 'relative', width: '100%', height: HEIGHT, borderRadius: 8, overflow: 'hidden', background: '#000', border }}>
      {playing && !failed ? (
        <video ref={video} controls autoPlay playsInline poster={poster} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
      ) : (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setPlaying(true);
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
            background: poster ? `center / cover no-repeat url(${poster})` : '#1b2330',
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
      <a
        href={pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Voir la bande-annonce sur la page du jeu"
        title="Voir sur la page du jeu"
        style={{ position: 'absolute', top: 4, right: 4, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Glyph name="external" size={16} />
      </a>
    </div>
  );
}

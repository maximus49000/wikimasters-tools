// src/content/DocumentaryPlayer.tsx
import { useState } from 'react';
import type { DocCandidate } from '../core/documentary/types';
import { embedUrl, thumbnailUrl } from '../core/screen/screen-format';
import { FullscreenButton, fullscreenFrame, useFullscreen } from './fullscreen';
import { Glyph } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const frame = { position: 'relative', width: '100%', aspectRatio: '16 / 9', maxHeight: 'min(240px, 34vh)', borderRadius: 8, overflow: 'hidden', background: '#000', border } as const;

// Miniature + ▶ ; rien n'est chargé chez un tiers avant le clic. YouTube : iframe sans cookie ; Commons : lecture directe du fichier libre.
export function DocumentaryPlayer({ candidate }: { candidate: DocCandidate }) {
  const [playing, setPlaying] = useState(false);
  const fullscreen = useFullscreen<HTMLDivElement>();
  const isCommons = candidate.source === 'commons' && candidate.mediaUrl !== undefined;
  const embed = isCommons ? null : embedUrl(candidate.id);
  const thumb = candidate.thumbUrl ?? (isCommons ? null : thumbnailUrl(candidate.id));
  if (!isCommons && !embed) return null;

  return (
    <div ref={fullscreen.ref} style={{ ...frame, ...fullscreenFrame(fullscreen.active) }}>
      {playing && isCommons && <video src={candidate.mediaUrl} poster={thumb ?? undefined} controls autoPlay playsInline style={{ width: '100%', height: '100%', background: '#000' }} />}
      {playing && embed && (
        <iframe src={embed} title={candidate.title} allow="autoplay; encrypted-media; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{ width: '100%', height: '100%', border: 0 }} />
      )}
      {!playing && (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="Lire le documentaire"
          title="Lire le documentaire"
          style={{ width: '100%', height: '100%', cursor: 'pointer', border: 0, padding: 0, color: '#fff', background: thumb ? `center / cover no-repeat url(${thumb})` : '#1b2330', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name="play" size={22} />
          </span>
        </button>
      )}
      <FullscreenButton active={fullscreen.active} onClick={fullscreen.toggle} />
      <a
        href={candidate.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ouvrir à la source"
        title="Ouvrir à la source"
        style={{ position: 'absolute', top: 4, right: 4, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Glyph name="external" size={16} />
      </a>
    </div>
  );
}

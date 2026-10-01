import { useState, useSyncExternalStore } from 'react';
import { Glyph } from './Glyphs';
import { getImageService } from './image-registry';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const noSubscribe = () => () => undefined;
const none = () => null;

type Props = { slug: string; title: string };

// Sous la fiche native d'une carte dont l'image a été remplacée : « Mauvaise image » passe à une autre image.
export function ImageSection({ slug, title }: Props) {
  const images = getImageService();
  const url = useSyncExternalStore(images?.subscribe ?? noSubscribe, images ? () => (images.enabled() ? (images.peek(slug) ?? null) : null) : none);
  const [busy, setBusy] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  if (!images || (!url && !exhausted)) return null;

  const reject = async () => {
    setBusy(true);
    await images.reject(slug, title);
    setExhausted(images.peek(slug) === null);
    setBusy(false);
  };

  return (
    <div style={{ marginTop: 8 }}>
      {url && (
        <button
          type="button"
          onClick={reject}
          disabled={busy}
          aria-label="Mauvaise image"
          title="Mauvaise image : en chercher une autre"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 14px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, color: 'inherit', background: 'none', border, borderRadius: 8, font: '600 13px system-ui, sans-serif' }}
        >
          <Glyph name="refresh" size={16} /> Mauvaise image
        </button>
      )}
      {!url && exhausted && <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>Aucune autre image trouvée.</p>}
    </div>
  );
}

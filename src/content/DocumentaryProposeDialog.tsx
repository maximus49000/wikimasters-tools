// src/content/DocumentaryProposeDialog.tsx
import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Glyph } from './Glyphs';
import { useOverlayHost } from './SoundtrackDialog';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const button = (primary: boolean, disabled: boolean): CSSProperties => ({
  flex: 1, minHeight: 44, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, font: '600 14px system-ui, sans-serif',
  color: primary ? '#0d1117' : 'inherit', background: primary ? 'var(--color-accent, #34d399)' : 'none', border: primary ? '1px solid transparent' : border, borderRadius: 8,
});

type Props = {
  // Rend l'erreur à afficher, ou { sent } si la proposition est enregistrée.
  onPropose: (link: string) => Promise<{ ok: true; sent: boolean } | { ok: false; error: string }>;
  onClose: () => void;
  onDone: () => void;
};

// Coller un lien YouTube : la vidéo est vérifiée (elle existe, elle s'intègre), visible tout de suite pour son auteur, relue avant d'être proposée aux autres.
export function DocumentaryProposeDialog({ onPropose, onClose, onDone }: Props) {
  const mountPoint = useOverlayHost();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ sent: boolean } | null>(null);
  if (!mountPoint) return null;

  const submit = async () => {
    if (busy || link.trim() === '') return;
    setBusy(true);
    setError(null);
    const result = await onPropose(link);
    setBusy(false);
    if (result.ok) {
      setDone({ sent: result.sent });
      onDone();
    } else setError(result.error);
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div role="dialog" aria-label="Proposer un documentaire" onClick={(event) => event.stopPropagation()} style={{ width: 'min(400px, 100%)', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: '#0d1117', color: '#e6edf3', font: '14px/20px system-ui, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Proposer un documentaire</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 }}>
            <Glyph name="close" />
          </button>
        </div>
        {done ? (
          <>
            <p role="status" style={{ margin: '0 0 12px' }}>{done.sent ? 'Merci ! Votre vidéo est visible chez vous ; elle sera relue avant d’être proposée aux autres.' : 'Votre vidéo est enregistrée chez vous. Elle n’a pas pu être envoyée pour relecture.'}</p>
            <button type="button" onClick={onClose} style={{ ...button(true, false), width: '100%', flex: 'none' }}>Fermer</button>
          </>
        ) : (
          <>
            <input type="url" inputMode="url" aria-label="Lien YouTube" placeholder="Collez un lien YouTube" value={link} onChange={(event) => setLink(event.target.value)} style={{ width: '100%', minHeight: 44, boxSizing: 'border-box', padding: '0 10px', color: 'inherit', background: 'none', border, borderRadius: 8, font: '14px system-ui, sans-serif' }} />
            <p style={{ margin: '8px 0 12px', fontSize: 12, opacity: 0.75 }}>La vidéo doit exister et pouvoir être intégrée. Rien n’est envoyé avant que vous appuyiez sur le bouton.</p>
            {error && <p role="alert" style={{ margin: '0 0 12px', color: '#f87171' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={button(false, false)}>Annuler</button>
              <button type="button" onClick={() => void submit()} disabled={busy || link.trim() === ''} style={button(true, busy || link.trim() === '')}>{busy ? 'Vérification …' : 'Proposer'}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    mountPoint,
  );
}

import { useState } from 'react';
import { DESCRIPTION_MAX, type AnomalyResult } from '../core/anomalies/anomaly';
import { track } from '../core/telemetry/registry';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const button = (primary: boolean, disabled: boolean) =>
  ({
    flex: 1,
    minHeight: 44,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    font: '600 14px system-ui, sans-serif',
    color: primary ? '#0d1117' : 'inherit',
    background: primary ? 'var(--color-accent, #34d399)' : 'none',
    border: primary ? '1px solid transparent' : border,
    borderRadius: 8,
  }) as const;

export type AnomalyDialogProps = {
  // Nom du profil, s'il est connu (lu sur la page « Profil »).
  profileName: string | null;
  send: (description: string, name: string | null) => Promise<AnomalyResult>;
  onClose: () => void;
};

// « Remonter une anomalie » : une description, Annuler ou Envoyer. L'envoi crée une issue GitHub numérotée.
export function AnomalyDialog({ profileName, send, onClose }: AnomalyDialogProps) {
  const [description, setDescription] = useState('');
  const [withName, setWithName] = useState(profileName !== null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNumber, setSentNumber] = useState<number | null>(null);

  const submit = async () => {
    if (sending || description.trim().length === 0) return;
    setSending(true);
    setError(null);
    const result = await send(description, withName ? profileName : null);
    setSending(false);
    if (result.ok) {
      track('anomalie-signalee');
      setSentNumber(result.number);
    }
    else setError(result.error);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Remonter une anomalie"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(400px, 100%)', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Remonter une anomalie</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        {sentNumber !== null ? (
          <>
            <p role="status" style={{ margin: '0 0 12px' }}>Anomalie n° {sentNumber} remontée. Merci !</p>
            <button type="button" onClick={onClose} style={{ ...button(true, false), width: '100%', flex: 'none' }}>
              Fermer
            </button>
          </>
        ) : (
          <>
            <textarea
              aria-label="Description de l’anomalie"
              placeholder="Décrivez l’anomalie : ce que vous faisiez, ce qui s’est passé, ce que vous attendiez."
              value={description}
              maxLength={DESCRIPTION_MAX}
              onChange={(event) => setDescription(event.target.value)}
              rows={6}
              style={{ width: '100%', boxSizing: 'border-box', padding: 8, resize: 'vertical', color: 'inherit', background: 'transparent', border, borderRadius: 8, font: '14px/20px system-ui, sans-serif' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 12px', opacity: profileName ? 1 : 0.7 }}>
              <input type="checkbox" checked={withName} disabled={!profileName} onChange={(event) => setWithName(event.target.checked)} />
              {profileName
                ? `Inclure mon nom (${profileName}) : visible publiquement sur GitHub`
                : 'Nom inconnu : ouvrez votre Profil une fois pour pouvoir l’inclure'}
            </label>
            {error && (
              <p role="alert" style={{ margin: '0 0 12px', color: '#f87171' }}>
                {error}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={button(false, false)}>
                Annuler
              </button>
              <button type="button" onClick={() => void submit()} disabled={sending || description.trim().length === 0} style={button(true, sending || description.trim().length === 0)}>
                {sending ? 'Envoi …' : 'Envoyer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

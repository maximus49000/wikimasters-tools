import { useEffect, useState } from 'react';
import { Glyph, type GlyphName } from './Glyphs';
import { getSpotifyKey, type SpotifyKeyControl } from './music-registry';
import { normalizeClientId } from '../core/spotify/client-id';
import { track } from '../core/telemetry/registry';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const button = {
  flex: 1,
  minHeight: 44,
  cursor: 'pointer',
  font: '600 14px system-ui, sans-serif',
  color: 'inherit',
  background: 'none',
  border,
  borderRadius: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
} as const;

// La clé enregistrée (`undefined` pendant le chargement, `null` quand il n'y en a pas) ; suit les changements.
export function useSpotifyKey(): { control: SpotifyKeyControl | null; key: string | null | undefined } {
  const control = getSpotifyKey();
  const [key, setKey] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!control) return;
    let cancelled = false;
    const load = () => void control.clientId().then((value) => !cancelled && setKey(value));
    load();
    const off = control.subscribe(load);
    return () => {
      cancelled = true;
      off();
    };
  }, [control]);
  return { control, key: control ? key : null };
}

const masked = (key: string): string => `${key.slice(0, 8)}…${key.slice(-7)}`;

type Pending = { kind: 'replace'; value: string } | { kind: 'clear' } | null;

function Btn({ label, glyph, onClick, text }: { label: string; glyph?: GlyphName; onClick: () => void; text?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} style={button}>
      {glyph && <Glyph name={glyph} />} {text ?? ''}
    </button>
  );
}

// Le Client ID de l'application Spotify de l'utilisateur : saisi une fois, jamais effacé par « Délier ».
// Remplacer ou effacer la clé délie le compte (ses jetons appartiennent à l'ancienne clé) : on demande confirmation.
export function SpotifyKeySettings({ linked }: { linked: boolean }) {
  const { control, key } = useSpotifyKey();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uris, setUris] = useState<string[]>([]);

  useEffect(() => {
    if (!control) return;
    let cancelled = false;
    void control.redirectUris().then((value) => !cancelled && setUris(value));
    return () => {
      cancelled = true;
    };
  }, [control]);

  if (!control || key === undefined) return null;

  const showForm = key === null || editing;
  const reset = () => {
    setEditing(false);
    setDraft('');
    setPending(null);
  };

  const save = async () => {
    const id = normalizeClientId(draft);
    if (!id) {
      setMessage('Clé invalide : 32 caractères, chiffres et lettres de a à f.');
      return;
    }
    setMessage(null);
    if (key && id === key) return reset();
    if (key && linked) return setPending({ kind: 'replace', value: id });
    await control.setClientId(id);
    track('reglage-modifie', 'lecteur');
    reset();
  };

  const confirm = async () => {
    if (pending?.kind === 'replace') await control.setClientId(pending.value);
    if (pending?.kind === 'clear') await control.clearClientId();
    track('reglage-modifie', 'lecteur');
    reset();
  };

  const clear = async () => {
    if (linked) return setPending({ kind: 'clear' });
    await control.clearClientId();
    track('reglage-modifie', 'lecteur');
    reset();
  };

  const copy = (uri: string) => {
    try {
      void navigator.clipboard.writeText(uri).catch(() => undefined);
    } catch {
      // Presse-papiers indisponible : l'adresse reste affichée, on la copie à la main.
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: border }}>
      <p style={{ margin: '0 0 8px', opacity: 0.8 }}>Votre clé Spotify (Client ID)</p>
      {showForm ? (
        <>
          <input
            aria-label="Clé Spotify (Client ID)"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="32 caractères, ex. 30d88341…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 10px', borderRadius: 8, border, background: 'transparent', color: 'inherit', font: '13px ui-monospace, monospace' }}
          />
          {pending ? null : (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Btn label="Enregistrer ma clé Spotify" glyph="save" text="Enregistrer" onClick={() => void save()} />
              {key && <Btn label="Annuler" onClick={reset} text="Annuler" />}
            </div>
          )}
          <div style={{ display: 'flex', marginTop: 8 }}>
            <Btn label="Ouvrir le mode d’emploi" glyph="book" text="Mode d’emploi : créer ma clé" onClick={() => control.openGuide()} />
          </div>
          <p style={{ margin: '12px 0 4px', fontSize: 12, opacity: 0.8 }}>À déclarer chez Spotify (Redirect URI) :</p>
          {uris.map((uri) => (
            <div key={uri} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '4px 4px 4px 10px', border, borderRadius: 8 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', font: '12px ui-monospace, monospace' }}>{uri}</span>
              <button type="button" onClick={() => copy(uri)} aria-label="Copier l’adresse de retour" title="Copier l’adresse de retour" style={{ ...button, flex: 'none', width: 44 }}>
                <Glyph name="copy" />
              </button>
            </div>
          ))}
        </>
      ) : (
        <>
          <div style={{ padding: '10px', border, borderRadius: 8, font: '13px ui-monospace, monospace' }}>{masked(key)}</div>
          {!pending && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Btn label="Remplacer ma clé Spotify" glyph="edit" text="Remplacer" onClick={() => setEditing(true)} />
              <Btn label="Effacer ma clé Spotify" glyph="trash" text="Effacer" onClick={() => void clear()} />
            </div>
          )}
        </>
      )}
      {pending && (
        <>
          <p role="alert" style={{ margin: '8px 0 0', padding: '8px 10px', borderRadius: 8, border: '1px solid #9e6a03', fontSize: 12 }}>
            {pending.kind === 'replace' ? 'Une autre clé' : 'Effacer la clé'} délie votre compte Spotify. Vous devrez le lier de nouveau.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Btn label="Annuler" text="Annuler" onClick={reset} />
            <Btn label={pending.kind === 'replace' ? 'Remplacer et délier' : 'Effacer et délier'} text={pending.kind === 'replace' ? 'Remplacer et délier' : 'Effacer et délier'} onClick={() => void confirm()} />
          </div>
        </>
      )}
      {message && (
        <p role="status" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {message}
        </p>
      )}
    </div>
  );
}

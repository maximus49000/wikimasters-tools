import { useEffect, useState } from 'react';
import { Glyph } from './Glyphs';
import type { RemoteControl } from './music-registry';
import type { RemoteStatus } from '../core/spotify/remote-playback';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const LINES: Record<RemoteStatus, string> = {
  ok: 'Lecture directe par l’appli Spotify : active.',
  untried: 'Lecture directe par l’appli Spotify : sera essayée à la prochaine lecture.',
  'not-configured': 'Ta clé Spotify n’autorise pas encore ce téléphone : ajoute les deux lignes ci-dessous dans ta clé (Android packages). En attendant, la lecture passe par l’ancienne méthode.',
  'not-installed': 'Installe l’appli Spotify pour la lecture directe.',
  outdated: 'Mets à jour l’appli Spotify.',
};

const RETRY: readonly RemoteStatus[] = ['not-configured', 'not-installed', 'outdated'];

const copyText = (value: string) => {
  try {
    void navigator.clipboard.writeText(value).catch(() => undefined);
  } catch {
    // Presse-papiers indisponible : la valeur reste affichée, on la copie à la main.
  }
};

function Row({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '4px 4px 4px 10px', border, borderRadius: 8 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', font: '12px ui-monospace, monospace' }}>{value}</span>
      <button type="button" onClick={() => copyText(value)} aria-label={label} title={label} style={{ minHeight: 44, width: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name="copy" />
      </button>
    </div>
  );
}

// APK seulement : la lecture par l'appli Spotify du téléphone (SDK App Remote) et ce que la clé doit déclarer pour l'autoriser.
export function SpotifyRemoteSettings({ remote }: { remote: RemoteControl }) {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => void remote.status().then((value) => !cancelled && setStatus(value));
    load();
    const off = remote.subscribe(load);
    return () => {
      cancelled = true;
      off();
    };
  }, [remote]);

  if (status === null) return null;
  const fingerprint = remote.fingerprint();
  return (
    <div data-wmt-remote-playback style={{ marginTop: 16, paddingTop: 12, borderTop: border }}>
      <p style={{ margin: '0 0 8px', opacity: 0.8 }}>Lecture sur ce téléphone</p>
      <p role="status" style={{ margin: '0 0 8px', fontSize: 13 }}>
        {LINES[status]}
      </p>
      <p style={{ margin: '12px 0 4px', fontSize: 12, opacity: 0.8 }}>À déclarer chez Spotify (Android packages) :</p>
      <Row value={remote.packageName()} label="Copier le nom du paquet" />
      {fingerprint && <Row value={fingerprint} label="Copier l’empreinte SHA-1" />}
      {RETRY.includes(status) && (
        <div style={{ display: 'flex', marginTop: 8 }}>
          <button
            type="button"
            onClick={() => void remote.reset()}
            aria-label="Réessayer la lecture directe"
            title="Réessayer la lecture directe"
            style={{ flex: 1, minHeight: 44, cursor: 'pointer', font: '600 14px system-ui, sans-serif', color: 'inherit', background: 'none', border, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Glyph name="refresh" /> Réessayer la lecture directe
          </button>
        </div>
      )}
    </div>
  );
}

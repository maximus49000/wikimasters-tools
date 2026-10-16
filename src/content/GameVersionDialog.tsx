import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { boxartUrl, type TgdbVersion } from '../core/game/tgdb-api';
import type { GameBoxService } from './game-box-service';
import { Glyph } from './Glyphs';
import { useOverlayHost } from './SoundtrackDialog';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const iconButton: CSSProperties = { width: 44, height: 44, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
const rowButton = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  minHeight: 56,
  padding: '4px 8px',
  cursor: 'pointer',
  color: 'inherit',
  background: active ? 'rgba(52,211,153,0.12)' : 'none',
  border: 0,
  textAlign: 'left',
  font: '13px system-ui, sans-serif',
});

type Props = {
  service: Pick<GameBoxService, 'chooseVersion' | 'resetVersion'>;
  slug: string;
  title: string;
  versions: TgdbVersion[];
  // Version retenue pour la carte (undefined = choix automatique).
  activeId: number | undefined;
  onClose: () => void;
};

// « Changer de version » : les éditions du jeu par console (TheGamesDB), « Automatique » en tête.
export function GameVersionDialog({ service, slug, title, versions, activeId, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mountPoint = useOverlayHost();
  if (!mountPoint) return null;

  const done = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      setBusy(false);
      setMessage('Le changement a échoué, réessaie.');
      return;
    }
    setBusy(false);
    onClose();
  };

  const check = <Glyph name="check" size={18} />;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Changer de version"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(400px, 100%)', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: '#0d1117', color: '#e6edf3', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <span>
            <strong style={{ fontSize: 16 }}>Changer de version</strong>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>Carte « {title} »</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={iconButton}>
            <Glyph name="close" />
          </button>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, border, borderRadius: 8, overflow: 'hidden' }}>
          <li>
            <button type="button" disabled={busy} aria-pressed={activeId === undefined} aria-label="Version automatique" onClick={() => void done(() => service.resetVersion(slug))} style={rowButton(activeId === undefined)}>
              <span style={{ flex: 1, fontWeight: 600 }}>Automatique</span>
              {activeId === undefined && check}
            </button>
          </li>
          {versions.map((version) => {
            const active = version.id === activeId;
            return (
              <li key={version.id} style={{ borderTop: border }}>
                <button type="button" disabled={busy} aria-pressed={active} aria-label={`Choisir ${version.platformName}`} onClick={() => void done(() => service.chooseVersion(slug, version.id))} style={rowButton(active)}>
                  <span style={{ flex: 'none', width: 36, height: 48, borderRadius: 5, overflow: 'hidden', background: 'rgba(148,163,184,0.25)' }}>
                    {version.front && <img src={boxartUrl(version.front, 'medium')} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{version.platformName}</span>
                    <span style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>{version.year ?? 'Année inconnue'}</span>
                  </span>
                  {version.back && (
                    <span aria-label="Dos de la boîte connu" title="Dos de la boîte connu" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, opacity: 0.75 }}>
                      <Glyph name="check" size={12} /> dos
                    </span>
                  )}
                  {active && check}
                </button>
              </li>
            );
          })}
        </ul>

        {versions.length === 0 && <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.7 }}>Aucune autre version connue</p>}
        {message && (
          <p role="status" style={{ margin: '8px 0 0', fontSize: 12 }}>
            {message}
          </p>
        )}
      </div>
    </div>,
    mountPoint,
  );
}

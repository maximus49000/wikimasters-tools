import { useState, useSyncExternalStore } from 'react';
import { Glyph } from './Glyphs';
import { PLATFORM_LABEL, type Platform } from '../core/music/platform';
import { getMusicService, getPlatformChoice } from './music-registry';
import type { PlayerSource } from './player-source';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const choice = (selected: boolean) =>
  ({
    flex: 1,
    minHeight: 44,
    cursor: 'pointer',
    font: '600 14px system-ui, sans-serif',
    color: selected ? '#0d1117' : 'inherit',
    background: selected ? 'var(--color-accent, #34d399)' : 'none',
    border: selected ? '1px solid transparent' : border,
    borderRadius: 8,
  }) as const;

const noSubscribe = () => () => undefined;
const spotifyOnly = (): Platform => 'spotify';

// « Lecteur » : afficher ou masquer le mini-lecteur Spotify (affiché par défaut, dès que Spotify est lié), et lier ou délier le compte.
export function PlayerSettings({ source, onClose }: { source: PlayerSource; onClose: () => void }) {
  const { enabled, linked } = useSyncExternalStore(source.subscribe, source.current);
  const service = getMusicService();
  const platformChoice = getPlatformChoice();
  const platform = useSyncExternalStore(platformChoice?.setting.subscribe ?? noSubscribe, platformChoice?.setting.current ?? spotifyOnly);
  const name = PLATFORM_LABEL[platform];
  // Liaison en cours (la fenêtre d'autorisation de Spotify est ouverte) et cause d'un échec.
  const [linking, setLinking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const link = async () => {
    if (!service || linking) return;
    setLinking(true);
    setMessage(null);
    setMessage(await service.link());
    setLinking(false);
  };
  const accountLabel = `${linked ? 'Délier' : 'Lier'} ${name}`;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Lecteur"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(360px, 100%)', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Lecteur</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <p style={{ margin: '0 0 12px', opacity: 0.8 }}>Afficher le mini-lecteur en haut à gauche. Affiché, il reste visible tant que {name} est lié, même sans lecture.</p>
        <div role="group" aria-label="Affichage du lecteur" style={{ display: 'flex', gap: 8 }}>
          <button type="button" aria-pressed={enabled} onClick={() => source.setEnabled(true)} style={choice(enabled)}>
            Affiché
          </button>
          <button type="button" aria-pressed={!enabled} onClick={() => source.setEnabled(false)} style={choice(!enabled)}>
            Masqué
          </button>
        </div>
        {platformChoice && platformChoice.available.length > 1 && (
          <div role="group" aria-label="Plateforme d’écoute" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {platformChoice.available.map((candidate) => (
              <button key={candidate} type="button" aria-pressed={candidate === platform} onClick={() => platformChoice.setting.set(candidate)} style={choice(candidate === platform)}>
                {PLATFORM_LABEL[candidate]}
              </button>
            ))}
          </div>
        )}
        {service && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: border }}>
            <p style={{ margin: '0 0 8px', opacity: 0.8 }}>Compte {name} : {linked ? 'lié' : 'non lié'}.</p>
            <button
              type="button"
              onClick={() => (linked ? void service.unlink() : void link())}
              disabled={linking}
              aria-label={accountLabel}
              title={accountLabel}
              style={{ ...choice(false), flex: 'none', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...(linking ? { opacity: 0.5, cursor: 'default' } : {}) }}
            >
              <Glyph name={linked ? 'unlink' : 'link'} /> {accountLabel}
            </button>
            {message && (
              <p role="status" style={{ margin: '8px 0 0', fontSize: 12 }}>
                {message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

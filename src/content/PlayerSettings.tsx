import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Glyph } from './Glyphs';
import { PLATFORM_LABEL, type Platform } from '../core/music/platform';
import { getMusicService, getPlatformChoice } from './music-registry';
import type { PlayerSource } from './player-source';
import { usePlatform } from './usePlatform';

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

// « Lecteur » : la plateforme d'écoute (dès qu'il y en a deux), le mini-lecteur Spotify (affiché par défaut, dès que Spotify est lié),
// et lier ou délier le compte de la plateforme choisie : c'est le seul endroit où l'on délie.
export function PlayerSettings({ source, onClose }: { source: PlayerSource; onClose: () => void }) {
  const { enabled, linked: spotifyLinked } = useSyncExternalStore(source.subscribe, source.current);
  const service = getMusicService();
  const platformChoice = getPlatformChoice();
  const platform = usePlatform();
  const name = PLATFORM_LABEL[platform];
  // Tidal : l'état de liaison vient du service (le lecteur Spotify ne connaît que Spotify).
  const [tidalLinked, setTidalLinked] = useState(false);
  useEffect(() => {
    if (platform !== 'tidal' || !service) return;
    let cancelled = false;
    const load = () => void service.isLinked().then((value) => !cancelled && setTidalLinked(value));
    load();
    const off = service.subscribe(load);
    return () => {
      cancelled = true;
      off();
    };
  }, [platform, service]);
  const linked = platform === 'tidal' ? tidalLinked : spotifyLinked;
  // Liaison en cours (la fenêtre d'autorisation est ouverte) et cause d'un échec.
  // Le bouton n'est jamais bloqué : une autorisation restée sans réponse (fenêtre fermée, adresse de retour refusée)
  // ne doit pas empêcher de délier ni de recommencer. Seule la tentative la plus récente, sur la plateforme affichée, compte.
  const [linking, setLinking] = useState<Platform | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const attempt = useRef(0);
  useEffect(() => {
    attempt.current += 1;
    setLinking(null);
    setMessage(null);
  }, [platform]);

  const link = async () => {
    if (!service) return;
    const mine = ++attempt.current;
    setLinking(platform);
    setMessage(null);
    const result = await service.link();
    if (mine !== attempt.current) return;
    setMessage(result);
    setLinking(null);
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
        {platformChoice && platformChoice.available.length > 1 && (
          <div role="group" aria-label="Plateforme d’écoute" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {platformChoice.available.map((candidate) => (
              <button key={candidate} type="button" aria-pressed={candidate === platform} onClick={() => platformChoice.setting.set(candidate)} style={choice(candidate === platform)}>
                {PLATFORM_LABEL[candidate]}
              </button>
            ))}
          </div>
        )}
        {platform === 'spotify' && (
          <>
            <p style={{ margin: '0 0 12px', opacity: 0.8 }}>Afficher le mini-lecteur en haut à gauche. Affiché, il reste visible tant que {name} est lié, même sans lecture.</p>
            <div role="group" aria-label="Affichage du lecteur" style={{ display: 'flex', gap: 8 }}>
              <button type="button" aria-pressed={enabled} onClick={() => source.setEnabled(true)} style={choice(enabled)}>
                Affiché
              </button>
              <button type="button" aria-pressed={!enabled} onClick={() => source.setEnabled(false)} style={choice(!enabled)}>
                Masqué
              </button>
            </div>
          </>
        )}
        {service && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: border }}>
            <p style={{ margin: '0 0 8px', opacity: 0.8 }}>Compte {name} : {linked ? 'lié' : 'non lié'}.</p>
            <button
              type="button"
              onClick={() => (linked ? void service.unlink() : void link())}
              aria-label={accountLabel}
              title={accountLabel}
              style={{ ...choice(false), flex: 'none', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, }}
            >
              <Glyph name={linked ? 'unlink' : 'link'} /> {linking === platform && !linked ? `${accountLabel} …` : accountLabel}
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

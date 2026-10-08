import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Listen } from '../core/music/listen';
import type { SoundtrackChoice } from '../core/music/soundtrack';
import { Glyph } from './Glyphs';
import type { MusicService } from './music-service';
import { track } from '../core/telemetry/registry';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const iconButton: CSSProperties = { width: 44, height: 44, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };

const tab = (selected: boolean): CSSProperties => ({
  flex: 1,
  minHeight: 44,
  cursor: 'pointer',
  font: '600 14px system-ui, sans-serif',
  color: selected ? '#0d1117' : 'inherit',
  background: selected ? 'var(--color-accent, #34d399)' : 'none',
  border: selected ? '1px solid transparent' : border,
  borderRadius: 8,
});

type Mode = 'auto' | 'manual';

type Props = {
  service: Pick<MusicService, 'refreshSoundtrack' | 'searchSoundtracks' | 'chooseSoundtrack' | 'play' | 'manualSoundtrack'>;
  soundtrackKey: string;
  titles: string[];
  // Ce qui est gardé pour ce film, et le texte proposé d'office à la recherche manuelle.
  current: Listen | null;
  initialQuery: string;
  // La BO du film a changé (relancée ou choisie à la main).
  onChange: (listen: Listen | null) => void;
  onClose: () => void;
};

// Le réglage de la BO d'un film : « Auto » relance la recherche, « Manuel » cherche un texte saisi (albums et playlists) et garde le résultat choisi.
export function SoundtrackDialog({ service, soundtrackKey, titles, current, initialQuery, onChange, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('auto');
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<SoundtrackChoice[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const select = (next: Mode) => {
    setMode(next);
    setMessage(null);
  };

  const relaunch = async () => {
    setBusy(true);
    setMessage(null);
    const outcome = await service.refreshSoundtrack(soundtrackKey, titles);
    setBusy(false);
    if (outcome.message) return setMessage(outcome.message);
    onChange(outcome.listen);
    setMessage(outcome.listen ? null : 'Aucune bande originale trouvée.');
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim() === '') return setMessage('Saisis un titre à chercher.');
    setBusy(true);
    setMessage(null);
    const found = await service.searchSoundtracks(query);
    setBusy(false);
    setChoices(found.choices);
    setMessage(found.message ?? (found.choices.length === 0 ? 'Aucun résultat.' : null));
  };

  // Garde le résultat comme BO du film, puis le lance.
  const pick = async (choice: SoundtrackChoice) => {
    setBusy(true);
    setMessage(null);
    const outcome = await service.chooseSoundtrack(soundtrackKey, choice);
    if (!outcome.listen) {
      setBusy(false);
      return setMessage(outcome.message ?? 'Cette bande originale est introuvable.');
    }
    onChange(outcome.listen);
    const failure = await service.play(outcome.listen.items[0] ?? null, outcome.listen);
    setBusy(false);
    if (failure) setMessage(failure);
    else {
      track('bo-lue');
      onClose();
    }
  };

  const mountPoint = useOverlayHost();
  if (!mountPoint) return null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Bande originale"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(380px, 100%)', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: '#0d1117', color: '#e6edf3', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Bande originale</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={iconButton}>
            <Glyph name="close" />
          </button>
        </div>

        {service.manualSoundtrack && (
          <div role="group" aria-label="Mode de recherche" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" aria-pressed={mode === 'auto'} onClick={() => select('auto')} style={tab(mode === 'auto')}>
              Auto
            </button>
            <button type="button" aria-pressed={mode === 'manual'} onClick={() => select('manual')} style={tab(mode === 'manual')}>
              Manuel
            </button>
          </div>
        )}

        {mode === 'auto' || !service.manualSoundtrack ? (
          <>
            <p style={{ margin: '0 0 8px', opacity: 0.8 }}>Actuelle : {current?.album?.name ?? 'rien trouvé'}.</p>
            <button type="button" onClick={() => void relaunch()} aria-label="Relancer la recherche" title="Relancer la recherche" style={{ ...tab(false), width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Glyph name="refresh" /> {busy ? 'Recherche …' : 'Relancer la recherche'}
            </button>
            <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.7 }}>Cherche un album, puis une playlist, et garde le meilleur résultat.</p>
          </>
        ) : (
          <>
            <form onSubmit={(event) => void search(event)} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Titre à chercher"
                style={{ flex: 1, minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '0 10px', color: 'inherit', background: 'none', border, borderRadius: 8, font: '14px system-ui, sans-serif' }}
              />
              <button type="submit" aria-label="Chercher" title="Chercher" style={iconButton}>
                <Glyph name="search" />
              </button>
            </form>
            {choices && choices.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, border, borderRadius: 8 }}>
                {choices.map((choice, index) => (
                  <li key={`${choice.kind}:${choice.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 0 8px', minHeight: 48, borderTop: index === 0 ? 'none' : border }}>
                    <Glyph name={choice.kind === 'playlist' ? 'playlist' : 'disc'} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{choice.name}</span>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, opacity: 0.7 }}>
                        {choice.kind === 'playlist' ? 'Playlist' : 'Album'}
                        {choice.by ? ` · ${choice.by}` : ''}
                      </span>
                    </span>
                    <button type="button" disabled={busy} onClick={() => void pick(choice)} aria-label={`Lancer ${choice.name}`} title="Lancer et garder pour ce film" style={{ ...iconButton, border: 'none' }}>
                      <Glyph name="play" size={20} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
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

// Un hôte posé sur le <body>, dans un shadow DOM : la fenêtre sort de la fiche (ni défilement, ni empilement du site) et passe au premier plan.
export function useOverlayHost(): HTMLElement | null {
  const [mountPoint, setMountPoint] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed; inset:0; z-index:2147483647';
    // La fiche du jeu se ferme sur un appui « à l'extérieur » : on garde ces événements chez nous.
    for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }
    const point = document.createElement('div');
    host.attachShadow({ mode: 'open' }).appendChild(point);
    document.body.appendChild(host);
    setMountPoint(point);
    return () => host.remove();
  }, []);
  return mountPoint;
}

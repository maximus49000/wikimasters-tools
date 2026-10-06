import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { GameCandidate, GameDetail } from '../core/game/game-detail';
import type { GameCandidates, GameService } from './game-service';
import { Glyph } from './Glyphs';
import { useOverlayHost } from './SoundtrackDialog';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const iconButton: CSSProperties = { width: 44, height: 44, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
const wide: CSSProperties = { width: '100%', minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '600 14px system-ui, sans-serif' };
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
const field: CSSProperties = { flex: 1, minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '0 10px', color: 'inherit', background: 'none', border, borderRadius: 8, font: '14px system-ui, sans-serif' };
const NAMES = { steam: 'Steam', igdb: 'IGDB' } as const;

type Mode = 'search' | 'link';
type Props = {
  service: Pick<GameService, 'candidates' | 'preview' | 'fromLink' | 'choose' | 'chooseNone' | 'reset' | 'igdbEnabled'>;
  slug: string;
  title: string;
  current: GameDetail | null;
  // Le choix de la carte a changé : la section se recharge.
  onChanged: () => void;
  onClose: () => void;
};

// « Changer de jeu » : recherche sur Steam et IGDB (ou lien collé), aperçu, puis « Utiliser ce jeu » ; « Aucun jeu » vide la section.
export function GameChoiceDialog({ service, slug, title, current, onChanged, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState(title);
  const [link, setLink] = useState('');
  const [found, setFound] = useState<GameCandidates | null>(null);
  const [selected, setSelected] = useState<GameDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Numéro de la dernière requête lancée : une réponse plus ancienne est ignorée.
  const latest = useRef(0);

  const search = async (text: string) => {
    if (text.trim() === '') return setMessage('Saisis un titre à chercher.');
    const request = ++latest.current;
    setBusy(true);
    setMessage(null);
    setSelected(null);
    const result = await service.candidates(text).catch((): GameCandidates => ({ steam: [], igdb: [], message: 'La recherche a échoué.' }));
    if (request !== latest.current) return;
    setBusy(false);
    setFound(result);
    const total = result.steam.length + result.igdb.length;
    setMessage(result.message ?? (total === 0 ? 'Aucun résultat.' : null));
  };

  // Première recherche d'office, avec le titre de la carte.
  useEffect(() => {
    void search(title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = async (candidate: GameCandidate) => {
    const request = ++latest.current;
    setBusy(true);
    setMessage(null);
    const result = await service.preview({ source: candidate.source, id: candidate.id }).catch(() => ({ message: 'Ce jeu est introuvable.' }) as { detail?: GameDetail; message?: string });
    if (request !== latest.current) return;
    setBusy(false);
    setSelected(result.detail ?? null);
    if (!result.detail) setMessage(result.message ?? 'Ce jeu est introuvable.');
  };

  const checkLink = async (event: FormEvent) => {
    event.preventDefault();
    const request = ++latest.current;
    setBusy(true);
    setMessage(null);
    const result = await service.fromLink(link).catch(() => ({ message: 'Ce jeu est introuvable.' }) as { detail?: GameDetail; message?: string });
    if (request !== latest.current) return;
    setBusy(false);
    setSelected(result.detail ?? null);
    if (!result.detail) setMessage(result.message ?? 'Ce jeu est introuvable.');
  };

  const done = async (action: () => Promise<void>) => {
    latest.current++;
    setBusy(true);
    try {
      await action();
    } catch {
      setBusy(false);
      setMessage('Le changement a échoué, réessaie.');
      return;
    }
    setBusy(false);
    onChanged();
    onClose();
  };

  const mountPoint = useOverlayHost();
  if (!mountPoint) return null;

  const row = (candidate: GameCandidate) => {
    const isCurrent = current?.source === candidate.source && current.id === candidate.id;
    return (
      <li key={`${candidate.source}:${candidate.id}`} style={{ borderTop: border, opacity: isCurrent ? 0.55 : 1 }}>
        <button
          type="button"
          disabled={busy || isCurrent}
          onClick={() => void preview(candidate)}
          aria-label={`Choisir ${candidate.title} (${NAMES[candidate.source]})`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '4px 8px', cursor: 'pointer', color: 'inherit', background: 'none', border: 0, textAlign: 'left', font: '13px system-ui, sans-serif' }}
        >
          <span style={{ flex: 'none', width: 36, height: 48, borderRadius: 5, background: candidate.imageUrl ? `center / cover no-repeat url(${candidate.imageUrl})` : 'rgba(148,163,184,0.25)' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{candidate.title}</span>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, opacity: 0.7 }}>
              {[candidate.platforms.slice(0, 2).join(', '), candidate.year, isCurrent ? 'jeu actuel' : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, padding: '1px 6px', border, borderRadius: 4 }}>{NAMES[candidate.source]}</span>
        </button>
      </li>
    );
  };

  const group = (label: string, list: GameCandidate[]) => (
    <div key={label}>
      <p style={{ margin: '8px 0 4px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>{label}</p>
      {list.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>Aucun résultat.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, border, borderRadius: 8, overflow: 'hidden' }}>{list.map(row)}</ul>
      )}
    </div>
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Changer de jeu"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(400px, 100%)', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: '#0d1117', color: '#e6edf3', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <span>
            <strong style={{ fontSize: 16 }}>Changer de jeu</strong>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>Carte « {title} »</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={iconButton}>
            <Glyph name="close" />
          </button>
        </div>

        <div role="group" aria-label="Mode de recherche" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" aria-label="Rechercher" aria-pressed={mode === 'search'} onClick={() => setMode('search')} style={tab(mode === 'search')}>
            Rechercher
          </button>
          <button type="button" aria-label="Coller un lien" aria-pressed={mode === 'link'} onClick={() => setMode('link')} style={tab(mode === 'link')}>
            Coller un lien
          </button>
        </div>

        {mode === 'search' ? (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void search(query);
              }}
              style={{ display: 'flex', gap: 8, marginBottom: 4 }}
            >
              <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Titre à chercher" style={field} />
              <button type="submit" disabled={busy} aria-label="Chercher" title="Chercher" style={iconButton}>
                <Glyph name="search" />
              </button>
            </form>
            {found && (
              <>
                {group('Steam', found.steam)}
                {service.igdbEnabled && group('IGDB', found.igdb)}
              </>
            )}
          </>
        ) : (
          <form onSubmit={(event) => void checkLink(event)} style={{ display: 'flex', gap: 8 }}>
            <input value={link} onChange={(event) => setLink(event.target.value)} aria-label="Adresse du jeu" placeholder="store.steampowered.com/app/… ou igdb.com/games/…" style={field} />
            <button type="submit" disabled={busy} aria-label="Vérifier le lien" title="Vérifier le lien" style={iconButton}>
              <Glyph name="link" />
            </button>
          </form>
        )}

        {selected && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--color-accent, #34d399)', borderRadius: 12 }}>
            <span>
              <b>{selected.title}</b>
              <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>
                {NAMES[selected.source]}
                {selected.rating ? ` · ${selected.rating.kind === 'positive' ? `${selected.rating.value} %${selected.rating.verdict ? ` · ${selected.rating.verdict}` : ''}` : `${selected.rating.value}/100`}` : ''}
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void done(() => service.choose(slug, { source: selected.source, id: selected.id }))}
              aria-label="Utiliser ce jeu"
              style={{ ...wide, color: '#04130c', background: 'var(--color-accent, #34d399)', border: 0 }}
            >
              Utiliser ce jeu
            </button>
          </div>
        )}

        {message && (
          <p role="status" style={{ margin: '8px 0 0', fontSize: 12 }}>
            {message}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <button type="button" disabled={busy} onClick={() => void done(() => service.chooseNone(slug))} aria-label="Aucun jeu" title="Cette carte n'a pas de jeu" style={wide}>
            ∅ Aucun jeu
          </button>
          <button type="button" disabled={busy} onClick={() => void done(() => service.reset(slug))} aria-label="Revenir au choix automatique" style={{ ...wide, border: 'none', fontWeight: 400, opacity: 0.8 }}>
            Revenir au choix automatique
          </button>
        </div>
      </div>
    </div>,
    mountPoint,
  );
}

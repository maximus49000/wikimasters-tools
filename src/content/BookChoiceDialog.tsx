import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { coverThumbUrl } from '../core/book/book-format';
import type { OlWork } from '../core/book/openlibrary-api';
import type { BookCandidates, BookPreview, BookService } from './book-service';
import { Glyph } from './Glyphs';
import { useOverlayHost } from './SoundtrackDialog';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const iconButton: CSSProperties = { width: 44, height: 44, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
const wide: CSSProperties = { width: '100%', minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '600 14px system-ui, sans-serif' };
const field: CSSProperties = { flex: 1, minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '0 10px', color: 'inherit', background: 'none', border, borderRadius: 8, font: '14px system-ui, sans-serif' };

type Props = {
  service: Pick<BookService, 'candidates' | 'preview' | 'choose' | 'chooseNone' | 'reset'>;
  slug: string;
  title: string;
  // Identifiant Open Library du livre actuellement affiché (grisé dans la liste), null s'il n'y en a pas.
  currentId: string | null;
  // Le choix de la carte a changé : la section se recharge.
  onChanged: () => void;
  onClose: () => void;
};

// « Changer de livre » : recherche sur Open Library, aperçu, puis « Utiliser ce livre » ; « Aucun livre » vide la section.
export function BookChoiceDialog({ service, slug, title, currentId, onChanged, onClose }: Props) {
  const [query, setQuery] = useState(title);
  const [found, setFound] = useState<BookCandidates | null>(null);
  const [selected, setSelected] = useState<OlWork | null>(null);
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
    const result = await service.candidates(text).catch((): BookCandidates => ({ works: [], message: 'La recherche a échoué.' }));
    if (request !== latest.current) return;
    setBusy(false);
    setFound(result);
    setMessage(result.message ?? (result.works.length === 0 ? 'Aucun résultat.' : null));
  };

  // Première recherche d'office, avec le titre de la carte.
  useEffect(() => {
    void search(title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = async (work: OlWork) => {
    const request = ++latest.current;
    setBusy(true);
    setMessage(null);
    const result = await service.preview(work.id).catch((): BookPreview => ({ message: 'Ce livre est introuvable.' }));
    if (request !== latest.current) return;
    setBusy(false);
    setSelected(result.work ?? null);
    if (!result.work) setMessage(result.message ?? 'Ce livre est introuvable.');
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

  const row = (work: OlWork) => {
    const isCurrent = currentId === work.id;
    const author = work.author ?? 'auteur inconnu';
    return (
      <li key={work.id} style={{ borderTop: border, opacity: isCurrent ? 0.55 : 1 }}>
        <button
          type="button"
          disabled={busy || isCurrent}
          onClick={() => void preview(work)}
          aria-label={`Choisir ${work.title} (${author})`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '4px 8px', cursor: 'pointer', color: 'inherit', background: 'none', border: 0, textAlign: 'left', font: '13px system-ui, sans-serif' }}
        >
          <span style={{ flex: 'none', width: 36, height: 48, borderRadius: 5, background: work.coverId !== undefined ? `center / cover no-repeat url("${coverThumbUrl(work.coverId)}")` : 'rgba(148,163,184,0.25)' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{work.title}</span>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, opacity: 0.7 }}>
              {[work.author, work.year, isCurrent ? 'livre actuel' : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Changer de livre"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(400px, 100%)', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: '#0d1117', color: '#e6edf3', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <span>
            <strong style={{ fontSize: 16 }}>Changer de livre</strong>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>Carte « {title} »</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={iconButton}>
            <Glyph name="close" />
          </button>
        </div>

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

        {found && found.works.length > 0 && (
          <div>
            <p style={{ margin: '8px 0 4px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>Open Library</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, border, borderRadius: 8, overflow: 'hidden' }}>{found.works.map(row)}</ul>
          </div>
        )}

        {selected && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--color-accent, #34d399)', borderRadius: 12 }}>
            <span>
              <b>{selected.title}</b>
              <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>
                {[selected.author, selected.year, selected.publisher, selected.pages !== undefined ? `${selected.pages} pages` : ''].filter(Boolean).join(' · ')}
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void done(() => service.choose(slug, selected.id))}
              aria-label="Utiliser ce livre"
              style={{ ...wide, color: '#04130c', background: 'var(--color-accent, #34d399)', border: 0 }}
            >
              Utiliser ce livre
            </button>
          </div>
        )}

        {message && (
          <p role="status" style={{ margin: '8px 0 0', fontSize: 12 }}>
            {message}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <button type="button" disabled={busy} onClick={() => void done(() => service.chooseNone(slug))} aria-label="Aucun livre" title="Cette carte n’a pas de livre" style={wide}>
            ∅ Aucun livre
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

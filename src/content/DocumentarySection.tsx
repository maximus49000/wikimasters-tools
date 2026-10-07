// src/content/DocumentarySection.tsx
import { useEffect, useState, type CSSProperties } from 'react';
import { formatDuration, searchLinks } from '../core/documentary/format';
import { getDocumentaryService } from './documentary-registry';
import type { DocView } from './documentary-service';
import { DocumentaryPlayer } from './DocumentaryPlayer';
import { DocumentaryProposeDialog } from './DocumentaryProposeDialog';
import { Glyph } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const SIZE = 44; // cible tactile
const iconButton: CSSProperties = { width: SIZE, height: SIZE, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
const linkButton: CSSProperties = { minHeight: SIZE, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', border, borderRadius: 8, font: '600 13px system-ui, sans-serif' };

type Props = { slug: string; title: string };

// Section « documentaire » de la fiche native d'une carte historique : une vidéo pertinente (⇄ pour voir les autres), ou des recherches guidées ; rien pour les autres cartes.
export function DocumentarySection({ slug, title }: Props) {
  const service = getDocumentaryService();
  const [view, setView] = useState<DocView | null>(null);
  const [version, setVersion] = useState(0);
  const [index, setIndex] = useState(0);
  const [proposing, setProposing] = useState(false);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    service
      .view(slug, title)
      .catch((): DocView => ({ status: 'error', message: 'Le documentaire est indisponible pour le moment.' }))
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setIndex(0);
      });
    return () => {
      cancelled = true;
    };
  }, [service, slug, title, version]);

  if (!service || !view || view.status === 'none') return null;
  const current = view.status === 'detail' ? view.candidates[index % view.candidates.length] : undefined;
  const subject = view.status === 'detail' || view.status === 'empty' ? view.subject : null;
  const name = subject?.names[0] ?? title;

  return (
    <div data-wmt-documentary-card="" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Glyph name="film" size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>Documentaire</span>
        {view.status === 'detail' && view.candidates.length > 1 && (
          <button type="button" onClick={() => setIndex((value) => value + 1)} aria-label="Autre documentaire" title="Autre documentaire" style={iconButton}>
            <Glyph name="swap" />
          </button>
        )}
        {subject && (
          <button type="button" onClick={() => setProposing(true)} aria-label="Proposer un documentaire" title="Proposer un documentaire" style={iconButton}>
            <Glyph name="link" />
          </button>
        )}
      </div>

      {view.status === 'error' && <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{view.message}</p>}

      {current && subject && (
        <>
          <DocumentaryPlayer key={current.id} candidate={current} />
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{current.title}</div>
            <div style={{ opacity: 0.7 }}>
              {[current.channel, formatDuration(current.durationSec), current.license, current.source === 'commons' ? 'Wikimedia Commons' : current.source === 'proposal' ? 'Votre proposition (en attente de relecture)' : 'YouTube'].filter((part) => part).join(' · ')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void service.flag(slug, subject, title, current).then(() => setVersion((value) => value + 1))}
            aria-label="Cette vidéo n’est pas pertinente"
            title="Cette vidéo n’est pas pertinente"
            style={{ ...iconButton, alignSelf: 'flex-start' }}
          >
            <Glyph name="close" />
          </button>
        </>
      )}

      {view.status === 'empty' && (
        <>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
            {view.busy ? 'Recherche indisponible pour le moment, réessayez plus tard.' : 'Aucun documentaire assez pertinent trouvé.'} Chercher « {name} » :
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {searchLinks(name).map((link) => (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={linkButton}>
                <Glyph name="search" size={16} /> {link.label}
              </a>
            ))}
          </div>
        </>
      )}

      {proposing && subject && (
        <DocumentaryProposeDialog onPropose={(link) => service.propose(slug, subject, title, link)} onClose={() => setProposing(false)} onDone={() => setVersion((value) => value + 1)} />
      )}
    </div>
  );
}

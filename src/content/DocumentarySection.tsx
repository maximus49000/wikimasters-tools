import { useEffect, useState, type CSSProperties } from 'react';
import { formatDuration, searchLinks } from '../core/documentary/format';
import type { DocCandidate } from '../core/documentary/types';
import { thumbnailUrl } from '../core/screen/screen-format';
import { allVideos, isPossible } from './documentary-list';
import { getDocumentaryService } from './documentary-registry';
import type { DocView } from './documentary-service';
import { DocumentaryPlayer } from './DocumentaryPlayer';
import { DocumentaryProposeDialog } from './DocumentaryProposeDialog';
import { Glyph } from './Glyphs';
import { track } from '../core/telemetry/registry';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const SIZE = 44; // cible tactile
const iconButton: CSSProperties = { width: SIZE, height: SIZE, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
const linkButton: CSSProperties = { minHeight: SIZE, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', border, borderRadius: 8, font: '600 13px system-ui, sans-serif' };
const accent = 'var(--color-accent, #e0b04a)';
const pill: CSSProperties = { position: 'absolute', left: 8, top: 8, padding: '2px 7px', borderRadius: 4, color: '#0d1117', font: '700 11px system-ui, sans-serif' };

const sourceOf = (candidate: DocCandidate): string =>
  candidate.source === 'commons' ? 'Wikimedia Commons' : candidate.source === 'proposal' ? 'Votre proposition (en attente de relecture)' : 'YouTube';

type Props = { slug: string; title: string };

// Section « documentaire » de la fiche native d'une carte : une vidéo pertinente (⇄ pour passer à la suivante, ≡▶ pour choisir dans la liste de
// toutes les vidéos), ou des recherches guidées ; rien pour les autres cartes. Le choix dans la liste est retenu pour la carte, chez l'utilisateur.
export function DocumentarySection({ slug, title }: Props) {
  const service = getDocumentaryService();
  const [view, setView] = useState<DocView | null>(null);
  const [version, setVersion] = useState(0);
  const [index, setIndex] = useState(0);
  const [listOpen, setListOpen] = useState(false);
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
        setListOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service, slug, title, version]);

  if (!service || !view || view.status === 'none') return null;
  const good = view.status === 'detail' ? view.candidates : [];
  const possible = view.status === 'detail' || view.status === 'empty' ? view.possible : [];
  const chosenId = view.status === 'detail' ? view.chosenId : null;
  const list = allVideos(good, possible);
  // Sans vidéo proposée, rien ne se lance d'office : les possibles ne se choisissent que dans la liste.
  const playable = good.length > 0 ? list : [];
  const current = playable.length > 0 ? playable[index % playable.length] : undefined;
  const uncertain = current !== undefined && isPossible(current, good, possible);
  const mine = current !== undefined && current.id === chosenId;
  const subject = view.status === 'detail' || view.status === 'empty' ? view.subject : null;
  const name = subject?.names[0] ?? title;
  const reload = () => setVersion((value) => value + 1);

  return (
    <div data-wmt-documentary-card="" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Glyph name="film" size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>Documentaire{playable.length > 1 ? ` · ${(index % playable.length) + 1} / ${playable.length}` : ''}</span>
        {playable.length > 1 && (
          <button type="button" onClick={() => setIndex((value) => value + 1)} aria-label="Autre documentaire" title="Autre documentaire" style={iconButton}>
            <Glyph name="swap" />
          </button>
        )}
        {list.length > 1 || (good.length === 0 && list.length > 0) ? (
          <button
            type="button"
            data-wmt-documentary-list=""
            onClick={() => setListOpen((value) => !value)}
            aria-label={listOpen ? 'Masquer la liste des vidéos' : 'Choisir une vidéo dans la liste'}
            title={listOpen ? 'Masquer la liste des vidéos' : 'Choisir une vidéo dans la liste'}
            style={{ ...iconButton, position: 'relative', ...(listOpen ? { borderColor: accent } : {}) }}
          >
            <Glyph name="playlist" />
            <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, background: accent, color: '#0d1117', font: '700 11px/18px system-ui, sans-serif', textAlign: 'center' }}>{list.length}</span>
          </button>
        ) : null}
        {subject && (
          <button type="button" onClick={() => setProposing(true)} aria-label="Proposer un documentaire" title="Proposer un documentaire" style={iconButton}>
            <Glyph name="link" />
          </button>
        )}
      </div>

      {view.status === 'error' && <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{view.message}</p>}

      {current && subject && (
        <>
          <div style={{ position: 'relative' }}>
            <DocumentaryPlayer key={current.id} candidate={current} />
            {mine && <span style={{ ...pill, background: 'rgba(78,194,138,0.95)' }}>★ Votre choix</span>}
            {!mine && uncertain && <span style={{ ...pill, background: 'rgba(224,176,74,0.92)' }}>Pertinence moins sûre</span>}
          </div>
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{current.title}</div>
            <div style={{ opacity: 0.7 }}>{[current.channel, formatDuration(current.durationSec), current.license, sourceOf(current)].filter((part) => part).join(' · ')}</div>
          </div>
          {!mine && uncertain && <div style={{ fontSize: 12, color: '#e0b04a' }}>⚠ Cette vidéo peut ne pas traiter exactement ce sujet.</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void service.flag(slug, subject, title, current).then(reload)}
              aria-label="Cette vidéo n’est pas pertinente"
              title="Cette vidéo n’est pas pertinente"
              style={iconButton}
            >
              <Glyph name="close" />
            </button>
            {chosenId !== null && (
              <button
                type="button"
                data-wmt-documentary-reset=""
                onClick={() => void service.clearChoice(slug).then(reload)}
                style={{ minHeight: SIZE, padding: '0 8px', cursor: 'pointer', color: 'inherit', background: 'none', border: 0, textDecoration: 'underline', opacity: 0.8, font: '13px system-ui, sans-serif' }}
              >
                ↺ Revenir au choix automatique
              </button>
            )}
          </div>
        </>
      )}

      {view.status === 'empty' && !current && (
        <>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
            {view.busy ? 'Recherche indisponible pour le moment, réessayez plus tard.' : 'Aucun documentaire assez pertinent trouvé.'}
            {possible.length > 0 ? ` ${possible.length} vidéo${possible.length > 1 ? 's' : ''} possible${possible.length > 1 ? 's' : ''} dans la liste ci-dessus, ou chercher` : ' Chercher'} « {name} » :
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

      {listOpen && subject && (
        <div role="listbox" aria-label="Toutes les vidéos" style={{ border, borderRadius: 10, overflow: 'hidden' }}>
          {([['Proposées', list.filter((candidate) => !isPossible(candidate, good, possible))], ['Pertinence moins sûre', list.filter((candidate) => isPossible(candidate, good, possible))]] as const).map(
            ([heading, items]) =>
              items.length > 0 && (
                <div key={heading}>
                  <div style={{ padding: '6px 10px', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.7, background: 'rgba(148,163,184,0.08)' }}>{heading}</div>
                  {items.map((candidate) => {
                    const thumb = candidate.thumbUrl ?? (candidate.source === 'commons' ? null : thumbnailUrl(candidate.id));
                    const shown = current?.id === candidate.id;
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        role="option"
                        aria-selected={shown}
                        data-wmt-documentary-item=""
                        onClick={() =>
                          void service
                            .choose(slug, candidate)
                            .then(() => track('documentaire-change'))
                            .then(reload)
                        }
                        style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', textAlign: 'left', cursor: 'pointer', color: 'inherit', border: 0, borderTop: border, background: shown ? 'rgba(224,176,74,0.12)' : 'none' }}
                      >
                        <span style={{ width: 72, aspectRatio: '16 / 9', flex: 'none', borderRadius: 4, border, background: thumb ? `center / cover no-repeat url("${thumb}")` : '#2b2b2b' }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                          <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.title}</span>
                          <span style={{ opacity: 0.7, fontSize: 12 }}>{[candidate.channel, formatDuration(candidate.durationSec)].filter((part) => part).join(' · ')}</span>
                        </span>
                        {candidate.id === chosenId && <span aria-label="Votre choix">★</span>}
                      </button>
                    );
                  })}
                </div>
              ),
          )}
        </div>
      )}

      {proposing && subject && <DocumentaryProposeDialog onPropose={(link) => service.propose(slug, subject, title, link)} onClose={() => setProposing(false)} onDone={reload} />}
    </div>
  );
}

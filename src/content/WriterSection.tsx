import { useEffect, useRef, useState } from 'react';
import { writerThumbUrl } from '../core/book/writer-works';
import { Detail } from './BookSection';
import { getBookService } from './book-registry';
import type { BibliographyItem, BibliographyView, BookView } from './book-service';
import { getCollectionMarks } from './collection-marks-registry';
import { OwnedNotice, WorkBack, WorkList, type WorkItem } from './WorkList';

type Opened = { item: BibliographyItem; result: BookView | null };
// `onOpenCard` : ouvre la carte d'un livre possédé (fournie par la fiche native qui porte la section).
type Props = { slug: string; title: string; onOpenCard?: (slug: string) => void };

const status = { margin: 0, fontSize: 12, opacity: 0.8 } as const;

// Section « Bibliographie » de la fiche d'un écrivain : mêmes liste et rendu que la filmographie (`WorkList`) ; un livre s'ouvre dans la section
// (synopsis, prix, lecture gratuite), la liste est alors masquée sans être retirée. Rien pour les autres cartes.
export function WriterSection({ slug, title, onOpenCard }: Props) {
  const service = getBookService();
  const marks = getCollectionMarks();
  const [view, setView] = useState<BibliographyView | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [version, setVersion] = useState(0);
  const token = useRef(0);

  // La Collection a changé : les livres possédés se repèrent de nouveau (la liste des œuvres, elle, reste en mémoire).
  useEffect(() => marks?.subscribe(() => setVersion((value) => value + 1)), [marks]);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    service
      .bibliography(slug)
      .catch((): BibliographyView => ({ status: 'error', message: 'La bibliographie est indisponible pour le moment.' }))
      .then((next) => !cancelled && setView(next));
    return () => {
      cancelled = true;
    };
  }, [service, slug, version]);

  useEffect(() => setOpened(null), [slug]);

  if (!service || !view || view.status === 'none') return null;

  const open = (item: BibliographyItem) => {
    const mine = ++token.current;
    setOpened({ item, result: null });
    void service
      .workDetail(item, title)
      .catch((): BookView => ({ status: 'error', message: 'Le livre est indisponible pour le moment.' }))
      .then((result) => mine === token.current && setOpened({ item, result }));
  };
  const back = () => {
    token.current += 1;
    setOpened(null);
  };

  if (view.status === 'error') {
    return (
      <div data-wmt-writer="" style={{ marginTop: 8 }}>
        <p role="status" style={status}>
          {view.message}
        </p>
      </div>
    );
  }

  const toWork = (item: BibliographyItem): WorkItem => ({
    key: item.id,
    title: item.title,
    ...(item.year ? { year: item.year } : {}),
    ...(item.workId ? { thumbUrl: writerThumbUrl(item.workId) } : {}),
    ...(item.owned ? { owned: item.owned } : {}),
  });
  // La fiche ouverte reste à jour si la carte est acquise ou vendue pendant la lecture.
  const current = opened ? view.items.find((item) => item.id === opened.item.id) : undefined;

  return (
    <div data-wmt-writer="" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {opened && (
        <>
          <WorkBack title={opened.item.title} year={opened.item.year} label="Retour à la bibliographie" onBack={back} />
          {current?.owned && <OwnedNotice card={current.owned} onOpenCard={onOpenCard} />}
          {opened.result === null && (
            <p role="status" style={status}>
              Chargement…
            </p>
          )}
          {opened.result?.status === 'error' && (
            <p role="status" style={status}>
              {opened.result.message}
            </p>
          )}
          {(opened.result?.status === 'empty' || opened.result?.status === 'none') && <p style={status}>Aucune fiche trouvée pour ce livre.</p>}
          {opened.result?.status === 'detail' && <Detail slug={opened.item.slug} detail={opened.result.detail} />}
        </>
      )}
      <WorkList
        glyph="book"
        label="Bibliographie"
        items={view.items.map(toWork)}
        emptyText="Aucun livre connu."
        hidden={opened !== null}
        onOpen={(work) => {
          const item = view.items.find((candidate) => candidate.id === work.key);
          if (item) open(item);
        }}
        {...(onOpenCard ? { onOpenCard } : {})}
      />
    </div>
  );
}

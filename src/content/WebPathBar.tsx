import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { linksOf } from '../core/links/links-book';
import type { LinksRepo } from '../core/links/links-repo';
import { matchCards } from '../core/links/card-match';
import { MAX_LEVELS, MAX_READS, findPath, type PathProgress } from '../core/links/web-path';
import { slugToTitle } from '../core/market/market-book';
import type { PathRequest } from './selection-source';
import { track } from '../core/telemetry/registry';

type Props = {
  cards: KnownCard[];
  links: LinksRepo;
  // Le chemin trouvé (slugs, de A à B), ou null quand on l'efface.
  onPath: (path: string[] | null) => void;
  // Deux cartes déjà choisies (bouton Toile de la sélection) : les champs en sont remplis et la recherche part aussitôt.
  initial?: PathRequest | null;
};

type Choice = { text: string; slug: string | null };
const EMPTY: Choice = { text: '', slug: null };

const control = {
  height: 40,
  boxSizing: 'border-box',
  padding: '0 10px',
  font: '14px/20px system-ui, sans-serif',
  color: 'inherit',
  background: 'var(--color-surface, #0d1117)',
  border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
  borderRadius: 8,
} as const satisfies CSSProperties;
const glyph = { ...control, width: 40, padding: 0, cursor: 'pointer', font: '600 18px/1 system-ui, sans-serif' } as const satisfies CSSProperties;

// Un champ de carte avec suggestions : on tape un bout du nom, on choisit dans la liste (souris, doigt ou flèches + Entrée).
function CardPicker({ label, cards, value, onChange, onSubmit }: { label: string; cards: KnownCard[]; value: Choice; onChange: (choice: Choice) => void; onSubmit: () => void }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = useMemo(() => (value.slug ? [] : matchCards(cards, value.text)), [cards, value]);
  const choose = (card: KnownCard) => {
    onChange({ text: card.title, slug: card.slug });
    setOpen(false);
  };
  return (
    <div style={{ position: 'relative', flex: '1 1 150px', minWidth: 130 }}>
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={label}
        value={value.text}
        autoComplete="off"
        style={{ ...control, width: '100%', ...(value.slug ? { border: '1px solid var(--color-accent, #34d399)' } : {}) }}
        onChange={(event) => {
          setActive(0);
          setOpen(true);
          onChange({ text: event.target.value, slug: null });
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && suggestions.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActive((current) => (current + 1) % suggestions.length);
          } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
            event.preventDefault();
            setActive((current) => (current - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === 'Enter') {
            const card = open ? suggestions[active] : undefined;
            if (card) {
              event.preventDefault();
              choose(card);
            } else if (value.slug) onSubmit();
          } else if (event.key === 'Escape') setOpen(false);
        }}
      />
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 5,
            left: 0,
            right: 0,
            top: 44,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            maxHeight: 280,
            overflowY: 'auto',
            borderRadius: 8,
            border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
            background: 'var(--color-surface, #0d1117)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          {suggestions.map((card, index) => (
            <li
              key={card.slug}
              role="option"
              aria-selected={index === active}
              // `mousedown` (et non `click`) : le champ perd le focus avant, et la liste se fermerait sans prendre le choix.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(card);
              }}
              onMouseEnter={() => setActive(index)}
              style={{ padding: '10px 8px', minHeight: 20, cursor: 'pointer', borderRadius: 6, background: index === active ? 'rgba(148,163,184,0.2)' : 'transparent' }}
            >
              {card.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Les deux champs, le bouton qui lance la recherche et son avancement. La recherche tourne tant qu'on ne l'annule pas.
export function WebPathBar({ cards, links, onPath, initial = null }: Props) {
  const [from, setFrom] = useState<Choice>(initial ? { text: initial.from.title, slug: initial.from.slug } : EMPTY);
  const [to, setTo] = useState<Choice>(initial ? { text: initial.to.title, slug: initial.to.slug } : EMPTY);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PathProgress | null>(null);
  const [message, setMessage] = useState('');
  // Numéro de la recherche en cours : lancer, annuler ou quitter la vue rend les précédentes caduques.
  const run = useRef(0);
  useEffect(() => () => void (run.current += 1), []);

  // Une seule fois, à l'ouverture de la vue : les champs viennent d'être remplis, la recherche peut partir.
  useEffect(() => {
    if (initial) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titleOf = (slug: string) => cards.find((card) => card.slug === slug)?.title ?? slugToTitle(slug);
  const ready = from.slug !== null && to.slug !== null && from.slug !== to.slug;

  const start = async () => {
    if (!from.slug || !to.slug || from.slug === to.slug || running) return;
    const mine = (run.current += 1);
    const cancelled = () => run.current !== mine;
    setRunning(true);
    setProgress(null);
    setMessage('');
    onPath(null);
    try {
      const result = await findPath(
        from.slug,
        to.slug,
        {
          forward: async (slugs) => {
            const state = await links.readNow(slugs, cancelled);
            return Object.fromEntries(slugs.map((slug) => [slug, linksOf(state, slug)]));
          },
          backward: (slugs) => links.citers(slugs),
        },
        (next) => !cancelled() && setProgress(next),
        cancelled,
      );
      if (cancelled()) return;
      if (result.status === 'found') {
        track('toile-generee');
        onPath(result.path);
        setMessage(`Liaison en ${result.path.length - 1} étape${result.path.length > 2 ? 's' : ''} : ${result.path.map(titleOf).join(' → ')}.`);
      } else if (result.status === 'none') {
        setMessage(
          result.reason === 'limit'
            ? `Aucune liaison trouvée : la recherche s’est arrêtée après ${MAX_READS} articles lus (niveau ${result.level}).`
            : result.reason === 'levels'
              ? `Aucune liaison trouvée en ${MAX_LEVELS} niveaux.`
              : 'Aucune liaison trouvée : il n’y a plus d’article à explorer.',
        );
      }
    } catch (error) {
      if (cancelled()) return;
      console.warn('[wikimasters-tools]', 'recherche de liaison interrompue :', error);
      setMessage('Wikipédia est indisponible pour l’instant : relancez la recherche dans un moment.');
    } finally {
      if (!cancelled()) {
        setRunning(false);
        setProgress(null);
      }
    }
  };

  const clear = () => {
    run.current += 1;
    setRunning(false);
    setProgress(null);
    setMessage('');
    setFrom(EMPTY);
    setTo(EMPTY);
    onPath(null);
  };

  return (
    <div data-wmt-web-path="" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <CardPicker label="Carte A" cards={cards} value={from} onChange={setFrom} onSubmit={() => void start()} />
        <span aria-hidden="true" style={{ opacity: 0.6 }}>
          →
        </span>
        <CardPicker label="Carte B" cards={cards} value={to} onChange={setTo} onSubmit={() => void start()} />
        <button
          type="button"
          aria-label="Chercher la liaison"
          title={ready ? 'Chercher la liaison la plus courte' : 'Choisissez deux cartes différentes'}
          disabled={!ready || running}
          onClick={() => void start()}
          style={{ ...glyph, opacity: ready && !running ? 1 : 0.45, background: ready && !running ? 'var(--color-accent, #34d399)' : control.background, color: ready && !running ? '#0d1117' : 'inherit' }}
        >
          🔍
        </button>
        <button type="button" aria-label={running ? 'Annuler la recherche' : 'Effacer'} title={running ? 'Annuler la recherche' : 'Effacer'} onClick={clear} style={glyph}>
          ✕
        </button>
      </div>
      {(running || message) && (
        <p role="status" style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.8 }}>
          {running ? (progress ? `Recherche… niveau ${progress.level} · ${progress.reads} articles lus` : 'Recherche…') : message}
        </p>
      )}
    </div>
  );
}

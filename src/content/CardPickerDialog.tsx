import { useMemo, useState, type ReactNode } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import type { Category } from '../core/kinds/kinds-category';
import { SHELF_SHAPES, VINYL_COLORS, WALL_SHAPES } from '../core/library/furniture-catalog';
import type { ShelfShape, VinylColor, WallShape } from '../core/library/library-types';
import { suggestShape } from '../core/library/shape-suggest';
import { CardThumb } from './CardThumb';

export type CardChoice =
  | { target: 'wall'; shape: WallShape; slug: string; color?: VinylColor }
  | { target: 'shelf'; shape: ShelfShape; slug: string }
  | { target: 'screen'; slug: string };

type Target = 'wall' | 'shelf' | 'screen';

const MAX_SHOWN = 60;

// Glyphes (tracés SVG 24x24) : cibles et formes.
const GLYPHS: Record<string, readonly string[]> = {
  close: ['M18 6 6 18', 'M6 6l12 12'],
  check: ['M20 6 9 17l-5-5'],
  wall: ['M3 4h18v16H3z', 'M3 12h18', 'M12 4v8', 'M8 12v8'],
  shelf: ['M5 3v18', 'M19 3v18', 'M5 8h14', 'M5 14h14'],
  screen: ['M3 4h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8 20h8', 'M12 16v4'],
  poster: ['M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z', 'M9 6h6', 'M9 10h6'],
  vinyl: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'],
  'sleeve-square': ['M4 4h16v16H4z', 'M8 12h8'],
  'sleeve-round': ['M4 4h16v16H4z', 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'],
  'sleeve-frame': ['M3 3h18v18H3z', 'M7 7h10v10H7z'],
  cd: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', 'M12 6a6 6 0 0 1 6 6'],
  dvd: ['M3 6h18v12H3z', 'M9 12h6', 'M7 9h.01'],
  game: ['M6 8h12a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3z', 'M8 10v4', 'M6 12h4', 'M16 12h.01', 'M18 13h.01'],
  book: ['M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z', 'M6 3v18', 'M10 8h6'],
};

const LABELS: Record<string, string> = {
  wall: 'Accrocher au mur',
  shelf: 'Ranger sur une étagère',
  screen: "Afficher sur l'écran",
  poster: 'Poster',
  vinyl: 'Vinyle',
  'sleeve-square': 'Pochette carrée',
  'sleeve-round': 'Pochette ronde',
  'sleeve-frame': 'Pochette encadrée',
  cd: 'CD',
  dvd: 'DVD',
  game: 'Jeu vidéo',
  book: 'Livre',
};

const COLOR_LABELS: Record<VinylColor, string> = { black: 'Noir', red: 'Rouge', blue: 'Bleu', green: 'Vert', gold: 'Or' };
const COLOR_CSS: Record<VinylColor, string> = { black: '#111', red: '#dc2626', blue: '#2563eb', green: '#16a34a', gold: '#d4a017' };

function Glyph({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(GLYPHS[name] ?? []).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function GlyphBtn({ name, label, data, suggested, onClick }: { name: string; label: string; data: Record<string, string>; suggested?: boolean; onClick: () => void }) {
  const attrs = Object.fromEntries(Object.entries(data).map(([key, value]) => [`data-${key}`, value]));
  return (
    <button type="button" className="wmt-lib-btn" aria-label={label} title={label} data-suggested={suggested ? 'true' : undefined} onClick={onClick} {...attrs}>
      <Glyph name={name} />
    </button>
  );
}

// Sans accents ni majuscules, pour comparer la recherche au titre.
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function CardPickerDialog({
  cards,
  taken,
  categoryOf,
  allowed,
  onChoose,
  onClose,
}: {
  cards: KnownCard[];
  taken: Set<string>; // cartes déjà posées dans la pièce (grisées, non choisissables)
  categoryOf: (slug: string) => Category;
  allowed: Target[]; // cibles possibles selon l'outil
  onChoose: (choice: CardChoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [slug, setSlug] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(allowed.length === 1 ? (allowed[0] ?? null) : null);
  const [vinyl, setVinyl] = useState<VinylColor | null>(null);

  const sorted = useMemo(() => [...cards].sort((a, b) => a.title.localeCompare(b.title, 'fr')), [cards]);
  const matches = useMemo(() => {
    const needle = fold(query.trim());
    return sorted.filter((card) => !needle || fold(card.title).includes(needle));
  }, [sorted, query]);
  const shown = matches.slice(0, MAX_SHOWN);

  const card = slug ? cards.find((c) => c.slug === slug) : undefined;

  // Choisit la cible ; l'écran n'a pas de forme et valide aussitôt.
  function pickTarget(next: Target, chosen: string) {
    if (next === 'screen') onChoose({ target: 'screen', slug: chosen });
    else setTarget(next);
  }
  function pickCard(chosen: string) {
    setSlug(chosen);
    if (target) pickTarget(target, chosen);
  }
  function pickShape(shape: string) {
    if (!slug || !target) return;
    if (target === 'shelf') onChoose({ target, shape: shape as ShelfShape, slug });
    else if (shape === 'vinyl') setVinyl('black');
    else onChoose({ target: 'wall', shape: shape as WallShape, slug });
  }

  let body: ReactNode;
  if (!card) {
    body = (
      <>
        <input type="search" className="wmt-lib-name" placeholder="Chercher une carte" aria-label="Chercher une carte" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <div className="wmt-lib-picklist">
          {shown.map((c) => (
            <button key={c.slug} type="button" className="wmt-lib-btn wmt-lib-pick" data-card-option={c.slug} disabled={taken.has(c.slug)} onClick={() => pickCard(c.slug)}>
              <CardThumb card={c} />
              <span>{c.title}</span>
            </button>
          ))}
          {matches.length > MAX_SHOWN ? <div className="wmt-lib-msg">… affinez la recherche pour voir les autres cartes</div> : null}
          {matches.length === 0 ? <div className="wmt-lib-msg">Aucune carte trouvée.</div> : null}
        </div>
      </>
    );
  } else if (!target) {
    body = (
      <div className="wmt-lib-row">
        {allowed.map((t) => (
          <GlyphBtn key={t} name={t} label={LABELS[t] ?? t} data={{ target: t }} onClick={() => pickTarget(t, card.slug)} />
        ))}
      </div>
    );
  } else if (target !== 'screen') {
    const suggestion = suggestShape(categoryOf(card.slug));
    const shapes: string[] = target === 'wall' ? WALL_SHAPES : SHELF_SHAPES;
    const suggested = target === 'wall' ? suggestion.wall : suggestion.shelf;
    body = vinyl ? (
      <div className="wmt-lib-row">
        {VINYL_COLORS.map((color) => (
          <button key={color} type="button" className="wmt-lib-btn" aria-label={COLOR_LABELS[color]} title={COLOR_LABELS[color]} aria-pressed={vinyl === color} data-color={color} onClick={() => setVinyl(color)}>
            <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: COLOR_CSS[color], border: '1px solid rgba(255,255,255,.5)' }} />
          </button>
        ))}
        <button type="button" className="wmt-lib-btn" aria-label="Valider" title="Valider" data-action="confirm" onClick={() => onChoose({ target: 'wall', shape: 'vinyl', slug: card.slug, color: vinyl })}>
          <Glyph name="check" />
        </button>
      </div>
    ) : (
      <div className="wmt-lib-row">
        {shapes.map((shape) => (
          <GlyphBtn key={shape} name={shape} label={LABELS[shape] ?? shape} data={{ shape }} suggested={shape === suggested} onClick={() => pickShape(shape)} />
        ))}
      </div>
    );
  }

  return (
    <div className="wmt-lib-dialog" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wmt-lib-dialog-panel" role="dialog" aria-modal="true" aria-label="Choisir une carte">
        <div className="wmt-lib-row">
          {card ? <CardThumb card={card} /> : null}
          <span className="wmt-lib-sep">{card ? card.title : 'Choisir une carte'}</span>
          <button type="button" className="wmt-lib-btn" aria-label="Fermer" title="Fermer" data-action="close" onClick={onClose}>
            <Glyph name="close" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

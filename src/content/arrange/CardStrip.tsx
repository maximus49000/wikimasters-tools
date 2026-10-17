// Réglette 🃏 de la vue Modifier ＋ : vignettes défilantes des cartes de la Collection pas encore dans la pièce (même source que le choix
// de carte du tiroir, CardPickerDialog), triées par titre ; une recherche par titre au début ; toucher une vignette met la carte en attente.
import { useMemo, useState, type ReactElement } from 'react';
import type { KnownCard } from '../../core/collection/collection-book';
import { CardThumb } from '../CardThumb';

// Au plus 60 vignettes à la fois (comme le choix de carte) : la recherche trouve les autres.
const MAX_STRIP = 60;
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

type Props = {
  cards: KnownCard[];
  // Cartes déjà dans la pièce : absentes de la réglette.
  taken: Set<string>;
  // Carte en attente (vignette enfoncée).
  pending: string | null;
  onPick(slug: string): void;
};

export function CardStrip({ cards, taken, pending, onPick }: Props): ReactElement {
  const [query, setQuery] = useState('');
  const free = useMemo(() => cards.filter((c) => !taken.has(c.slug)).sort((a, b) => a.title.localeCompare(b.title, 'fr')), [cards, taken]);
  const needle = fold(query.trim());
  const matches = needle ? free.filter((c) => fold(c.title).includes(needle)) : free;
  const shown = matches.slice(0, MAX_STRIP);
  return (
    <div data-card-strip="" role="group" aria-label="Cartes à ajouter"
      style={{ position: 'absolute', top: 6, left: 60, right: 112, height: 48, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px', overflowX: 'auto', overflowY: 'hidden', touchAction: 'pan-x', pointerEvents: 'auto', background: 'rgba(43,29,22,.55)', borderRadius: 10, WebkitOverflowScrolling: 'touch' }}>
      <input type="search" aria-label="Chercher une carte" title="Chercher une carte" placeholder="🔍" value={query} onChange={(e) => setQuery(e.target.value)}
        style={{ flex: 'none', width: 92, height: 32, borderRadius: 8, border: '1px solid rgba(251,246,234,.5)', background: 'rgba(251,246,234,.92)', font: '14px system-ui, sans-serif', padding: '0 6px' }} />
      {shown.map((c) => (
        <button key={c.slug} type="button" data-strip-card={c.slug} aria-label={c.title} title={c.title} aria-pressed={pending === c.slug} onClick={() => onPick(c.slug)}
          style={{ flex: 'none', display: 'flex', padding: 1, border: 'none', borderRadius: 7, cursor: 'pointer', background: 'none', outline: pending === c.slug ? '3px solid #F5C542' : 'none', outlineOffset: 1 }}>
          <CardThumb card={c} width={30} height={42} />
        </button>
      ))}
      {matches.length > MAX_STRIP && <span aria-hidden="true" title="Cherchez par titre pour voir les autres cartes" style={{ flex: 'none', color: '#FBF6EA', font: '600 18px system-ui' }}>…</span>}
      {matches.length === 0 && <span aria-hidden="true" title="Aucune carte à ajouter" style={{ flex: 'none', color: '#FBF6EA', font: '600 18px system-ui' }}>∅</span>}
    </div>
  );
}

// src/content/WorkList.tsx
import { useState, type CSSProperties } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { rarityName } from '../core/collection/work-marks';
import { CardThumb } from './CardThumb';
import { Glyph, type GlyphName } from './Glyphs';

const SIZE = 44; // cible tactile
const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const STAR = '#fbbf24';
const GOLD = '#facc15';
const iconButton: CSSProperties = { width: SIZE, height: SIZE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };

// Une œuvre d'une liste (film, série, livre) ; `owned` = la carte de la Collection qui la représente.
export type WorkItem = { key: string; title: string; year?: number; rating?: string; thumbUrl?: string; owned?: KnownCard };

type ListProps = {
  glyph: GlyphName;
  label: string;
  items: readonly WorkItem[];
  emptyText: string;
  // Liste masquée (pas retirée) pendant la fiche d'une œuvre : le défilement est conservé au retour.
  hidden?: boolean;
  onOpen: (item: WorkItem) => void;
  // Ouvre la carte possédée ; sans lui, pas de bouton carte.
  onOpenCard?: (slug: string) => void;
};

function OwnedThumb({ card }: { card: KnownCard }) {
  return (
    <span style={{ position: 'relative', flex: 'none', display: 'inline-flex' }}>
      <CardThumb card={card} width={30} height={42} />
      {card.copies !== undefined && (
        <span style={{ position: 'absolute', right: -6, bottom: -6, minWidth: 18, height: 16, padding: '0 4px', borderRadius: 8, background: '#000', border: `1px solid ${GOLD}`, color: '#fff', font: '700 10px/14px system-ui, sans-serif', textAlign: 'center' }}>×{card.copies}</span>
      )}
    </span>
  );
}

// Liste d'œuvres d'une personne (filmographie, bibliographie) : les cartes possédées sont repérées, un interrupteur ne garde qu'elles.
export function WorkList({ glyph, label, items, emptyText, hidden = false, onOpen, onOpenCard }: ListProps) {
  const [mineOnly, setMineOnly] = useState(false);
  const ownedCount = items.filter((item) => item.owned).length;
  const filtering = mineOnly && ownedCount > 0;
  const shown = filtering ? items.filter((item) => item.owned) : items;
  return (
    <div data-wmt-work-list="" style={{ display: hidden ? 'none' : 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, fontWeight: 600 }}>
        <Glyph name={glyph} size={16} /> {label} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {filtering ? `${shown.length} sur ${items.length}` : items.length}</span>
        {ownedCount > 0 && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, color: GOLD }}>
            <Glyph name="card" size={15} /> {ownedCount} / {items.length} dans ma collection
          </span>
        )}
      </div>
      {ownedCount > 0 && (
        <button
          type="button"
          aria-pressed={filtering}
          onClick={() => setMineOnly((value) => !value)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, margin: '6px 0', padding: '0 12px', cursor: 'pointer', color: filtering ? GOLD : 'inherit', background: filtering ? 'rgba(250,204,21,0.14)' : 'none', border: `1px solid ${filtering ? GOLD : 'var(--color-border, rgba(148,163,184,0.5))'}`, borderRadius: 999, font: '600 12px system-ui, sans-serif' }}
        >
          <Glyph name="card" size={15} /> Seulement ma collection
        </button>
      )}
      {items.length === 0 && <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.7 }}>{emptyText}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 'min(180px, 28vh)', overflowY: 'auto' }}>
        {shown.map((item) => {
          const owned = item.owned;
          return (
            <li key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: border, ...(owned ? { background: 'rgba(250,204,21,0.07)', borderRadius: 8 } : {}) }}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                aria-label={`Ouvrir ${item.title}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, minHeight: SIZE, padding: '2px 0', cursor: 'pointer', color: 'inherit', background: 'none', border: 0, textAlign: 'left', font: '13px system-ui, sans-serif' }}
              >
                {owned ? (
                  <OwnedThumb card={owned} />
                ) : (
                  <span style={{ width: 26, height: 38, flex: 'none', borderRadius: 3, background: item.thumbUrl ? `center / cover no-repeat url(${item.thumbUrl})` : 'rgba(148,163,184,0.25)' }} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: owned ? 600 : 400 }}>{item.title}</span>
                  {(item.year || owned) && (
                    <span style={{ fontSize: 11, opacity: 0.6 }}>
                      {item.year}
                      {owned?.rarity ? `${item.year ? ' · ' : ''}${rarityName(owned.rarity)}` : ''}
                    </span>
                  )}
                </span>
                {item.rating !== undefined && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: STAR, fontSize: 12 }}>
                    <Glyph name="star" size={13} /> {item.rating}
                  </span>
                )}
              </button>
              {owned && onOpenCard && (
                <button type="button" onClick={() => onOpenCard(owned.slug)} aria-label={`Voir ma carte ${item.title}`} title="Voir ma carte" style={{ ...iconButton, color: GOLD, borderColor: GOLD }}>
                  <Glyph name="card" size={20} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// En-tête d'une œuvre ouverte dans la section : flèche de retour à la liste, titre et année.
export function WorkBack({ title, year, label, onBack }: { title: string; year?: number | undefined; label: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button type="button" onClick={onBack} aria-label={label} title={label} style={iconButton}>
        <Glyph name="back" />
      </button>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}>
        {title}
        {year && <span style={{ fontWeight: 400, opacity: 0.7 }}> {year}</span>}
      </span>
    </div>
  );
}

// Rappel dans la fiche d'une œuvre dont on possède la carte.
export function OwnedNotice({ card, onOpenCard }: { card: KnownCard; onOpenCard?: ((slug: string) => void) | undefined }) {
  const rarity = rarityName(card.rarity);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 12px', border: `1px solid ${GOLD}`, borderRadius: 10, background: 'rgba(250,204,21,0.08)', fontSize: 13, fontWeight: 600 }}>
      <span style={{ color: GOLD, display: 'inline-flex' }}>
        <Glyph name="card" size={22} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        Tu possèdes cette carte{rarity ? ` · ${rarity}` : ''}{card.copies !== undefined ? ` · ×${card.copies}` : ''}
      </span>
      {onOpenCard && (
        <button type="button" onClick={() => onOpenCard(card.slug)} aria-label={`Ouvrir ma carte ${card.title}`} title="Ouvrir ma carte" style={{ ...iconButton, color: GOLD, borderColor: GOLD }}>
          <Glyph name="external" size={18} />
        </button>
      )}
    </div>
  );
}

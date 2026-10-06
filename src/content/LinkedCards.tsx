import { useEffect, useSyncExternalStore } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { formatViews, LINKED_PREVIEW_MAX, VIA_PREVIEW_MAX, type ViaCard } from '../core/links/linked-cards';
import { rarityKey } from './card-rarity';
import { Glyph } from './Glyphs';
import { getImageService } from './image-registry';
import { getLinkedService } from './linked-registry';
import type { LinkedSource } from './linked-source';

const border = '1px solid var(--color-border, #2e3431)';
const muted = { opacity: 0.6 } as const;

// Survol et focus : le titre passe à la couleur d'accent et se souligne (le shadow DOM n'hérite pas des styles du site).
const STYLE = `
.wmt-linked-row{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:3px 4px;border:0;border-radius:10px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.wmt-linked-row:hover,.wmt-linked-row:focus-visible{background:rgba(148,163,184,.12)}
.wmt-linked-row:hover .wmt-linked-title,.wmt-linked-row:focus-visible .wmt-linked-via{display:block;font-size:12px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wmt-linked-title{color:var(--color-accent,#34d399);text-decoration:underline}
.wmt-linked-title{flex:1;min-width:0;font-weight:500;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
`;

const noSubscribe = () => () => undefined;
const NONE: KnownCard[] = [];
const NONE_VIA: ViaCard[] = [];

// Miniature : couleur de rareté en cadre et en fond, image en haut (celle du jeu, sinon l'image de remplacement déjà trouvée).
function Thumb({ card }: { card: KnownCard }) {
  const images = getImageService();
  // S'abonne aux images qui arrivent (affiche du jeu vidéo, image de remplacement).
  const url = useSyncExternalStore(images?.subscribe ?? noSubscribe, () => (images ? images.displayUrl(card.slug, card.imageUrl) : card.imageUrl));
  const color = card.rarity ? `var(--color-rarity-${rarityKey(card.rarity)}, #94a3b8)` : '#94a3b8';
  return (
    <span
      aria-hidden="true"
      style={{
        flex: 'none',
        width: 34,
        height: 48,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 5,
        border: `1.5px solid ${color}`,
        boxShadow: `0 0 6px color-mix(in srgb, ${color} 60%, transparent)`,
        background: `linear-gradient(160deg, ${color}, #0d1117 140%)`,
      }}
    >
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: '0 0 50% 0', width: '100%', height: '50%', objectFit: 'cover' }} /> : null}
    </span>
  );
}

function Row({ card, rank, via, onPick }: { card: KnownCard; rank?: number; via?: string[]; onPick: (slug: string) => void }) {
  const viaText = via && via.length > 0 ? `via ${via[0]}${via.length > 1 ? ` +${via.length - 1}` : ''}` : undefined;
  return (
    <button type="button" className="wmt-linked-row" onClick={() => onPick(card.slug)} title={card.title}>
      {rank !== undefined && <span style={{ flex: 'none', width: 18, textAlign: 'right', fontSize: 12, ...muted }}>{rank}</span>}
      <Thumb card={card} />
      {viaText ? (
        <span style={{ flex: 1, minWidth: 0 }} title={`via ${via?.join(', ')}`}>
          <span className="wmt-linked-title" style={{ display: '-webkit-box' }}>{card.title}</span>
          <span className="wmt-linked-via">{viaText}</span>
        </span>
      ) : (
        <span className="wmt-linked-title">{card.title}</span>
      )}
      {card.pageviews !== undefined && (
        <span style={{ flex: 'none', fontSize: 12, ...muted }} title="Consultations de l'article Wikipédia">
          {formatViews(card.pageviews)}
        </span>
      )}
    </button>
  );
}

type Props = {
  slug: string;
  // Toutes les cartes liées, dans une fenêtre.
  onSeeAll: () => void;
  onOpenCard: (slug: string) => void;
};

function SectionTitle({ children, window }: { children: string; window?: boolean }) {
  return (
    <div style={{ margin: window ? '10px 0 2px' : '0 0 6px', ...(window ? { gridColumn: '1 / -1' } : {}), font: '600 12px/16px system-ui, sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase', ...muted }}>
      {children}
    </div>
  );
}

function LinkedBlock({ slug, source, onSeeAll, onOpenCard }: Props & { source: LinkedSource }) {
  const cards = useSyncExternalStore(source.subscribe, () => source.linked(slug));
  const viaCards = useSyncExternalStore(source.subscribe, () => source.linkedVia(slug));
  useEffect(() => source.ensure(slug), [source, slug]);
  if (cards.length === 0 && viaCards.length === 0) return null;
  const more = cards.length > LINKED_PREVIEW_MAX || viaCards.length > VIA_PREVIEW_MAX;
  return (
    <div style={{ padding: 12, border, borderRadius: 12 }}>
      <style>{STYLE}</style>
      {cards.length > 0 && <SectionTitle>{`Cartes liées · ${cards.length}`}</SectionTitle>}
      {cards.slice(0, LINKED_PREVIEW_MAX).map((card) => (
        <Row key={card.slug} card={card} onPick={onOpenCard} />
      ))}
      {viaCards.length > 0 && <SectionTitle>{`Par un autre article · ${viaCards.length}`}</SectionTitle>}
      {viaCards.slice(0, VIA_PREVIEW_MAX).map(({ card, via }) => (
        <Row key={card.slug} card={card} via={via} onPick={onOpenCard} />
      ))}
      {more && (
        <button
          type="button"
          onClick={onSeeAll}
          style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', padding: 4, border: 0, background: 'none', cursor: 'pointer', font: '500 14px/20px system-ui, sans-serif', fontFamily: 'inherit', color: 'var(--color-accent, #34d399)' }}
        >
          Voir les {cards.length + viaCards.length} cartes liées →
        </button>
      )}
    </div>
  );
}

// Dans la fiche native, juste au-dessus des tuiles ATK / DEF : les six cartes liées les plus consultées.
export function LinkedCards(props: Props) {
  const service = getLinkedService();
  return service ? <LinkedBlock {...props} source={service.source} /> : null;
}

// Fenêtre « Voir plus » : toutes les cartes liées, les plus consultées d'abord.
export function LinkedCardsWindow({ slug, title, onPick, onClose }: { slug: string; title: string; onPick: (slug: string) => void; onClose: () => void }) {
  const source = getLinkedService()?.source;
  const cards = useSyncExternalStore(source?.subscribe ?? noSubscribe, () => source?.linked(slug) ?? NONE);
  const viaCards = useSyncExternalStore(source?.subscribe ?? noSubscribe, () => source?.linkedVia(slug) ?? NONE_VIA);
  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, background: 'rgba(0,0,0,0.65)' }}
    >
      <style>{STYLE}</style>
      <div
        role="dialog"
        aria-label={`Cartes liées à ${title}`}
        onClick={(event) => event.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', width: 'min(640px, 100%)', maxHeight: '100%', borderRadius: 16, border, background: 'var(--color-surface, #131615)', color: 'var(--color-foreground, #f1f5f3)', font: '400 14px/20px system-ui, sans-serif', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: border }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '600 16px/22px system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Cartes liées à « {title} »</div>
            <div style={{ fontSize: 12, ...muted }}>{cards.length + viaCards.length} cartes · les plus consultées d&apos;abord</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
            style={{ flex: 'none', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border: 0, borderRadius: 8 }}
          >
            <Glyph name="close" size={18} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0 12px' }}>
          {cards.map((card, index) => (
            <Row key={card.slug} card={card} rank={index + 1} onPick={onPick} />
          ))}
          {viaCards.length > 0 && <SectionTitle window>{`Par un autre article · ${viaCards.length}`}</SectionTitle>}
          {viaCards.map(({ card, via }, index) => (
            <Row key={card.slug} card={card} rank={index + 1} via={via} onPick={onPick} />
          ))}
        </div>
      </div>
    </div>
  );
}

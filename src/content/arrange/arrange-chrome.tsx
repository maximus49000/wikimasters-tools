// Bandeau du haut de la vue Modifier (plateau et étagère) : pastille du mode (✋ déplacer, ＋🃏 ajouter), réglette 🃏 en mode ajout,
// ✕ (seulement avec une carte en attente) et ✓ (pose la carte en attente, sinon referme la vue) ; halo doré de la carte en attente.
import { useMemo, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { Layout } from '../../core/library/library-types';
import { placedSlugs } from '../../core/library/room-grid';
import { CardStrip } from './CardStrip';
import type { AddProps, usePendingCard } from './use-pending-card';

export const BUTTON: CSSProperties = {
  width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  font: '600 20px system-ui, sans-serif', color: '#FBF6EA', background: 'rgba(43,29,22,.72)', border: '1px solid rgba(251,246,234,.5)', borderRadius: '50%', padding: 0,
};
// Or du halo de la carte en attente.
export const HALO = '#F5C542';
// Rouge du halo quand la place de la carte en attente ne tient plus.
export const KO_HALO = '#C8443A';

// Filtre SVG du halo : deux ombres dorées sans décalage autour de la forme (la carte reste lisible au centre).
export function HaloFilter({ id }: { id: string }): ReactElement {
  return (
    <defs>
      <filter id={id} x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx={0} dy={0} stdDeviation={2} floodColor={HALO} floodOpacity={1} />
        <feDropShadow dx={0} dy={0} stdDeviation={5} floodColor={HALO} floodOpacity={0.85} />
      </filter>
    </defs>
  );
}

type Props = {
  mode: 'move' | 'add';
  // Une carte est en attente : ✓ la pose, ✕ apparaît.
  pending: boolean;
  // Message de la vue ＋ (plus de place…), sous le bandeau.
  note?: string | null;
  strip?: ReactNode;
  onDone(): void;
  onCancel(): void;
};

export function ArrangeChrome({ mode, pending, note, strip, onDone, onCancel }: Props): ReactElement {
  const badge = mode === 'add' ? 'Ajouter une carte ici' : 'Modifier la disposition';
  return (
    <>
      <div aria-hidden="true" title={badge} style={{ ...BUTTON, position: 'absolute', top: 8, left: 8, cursor: 'default', background: '#22191A', ...(mode === 'add' ? { font: '600 15px system-ui, sans-serif' } : {}) }}>
        {mode === 'add' ? '＋🃏' : '✋'}
      </div>
      {mode === 'add' && strip}
      {pending && (
        <button type="button" data-action="arrange-cancel" aria-label="Annuler l’ajout" title="Annuler l’ajout" onClick={onCancel}
          style={{ ...BUTTON, position: 'absolute', top: 8, right: 60, pointerEvents: 'auto', background: '#8A3A33' }}>✕</button>
      )}
      <button type="button" data-action="arrange-done" aria-label={pending ? 'Poser la carte' : 'Terminer'} title={pending ? 'Poser la carte' : 'Terminer'} onClick={onDone}
        style={{ ...BUTTON, position: 'absolute', top: 8, right: 8, pointerEvents: 'auto', background: '#3E9B5A', ...(pending ? { boxShadow: `0 0 0 3px ${HALO}` } : {}) }}>✓</button>
      {note && (
        <div data-arrange-note="" style={{ position: 'absolute', left: '50%', top: 62, transform: 'translateX(-50%)', padding: '6px 12px', borderRadius: 8, background: 'rgba(43,29,22,.82)', color: '#FBF6EA', font: '600 14px system-ui, sans-serif', pointerEvents: 'none', whiteSpace: 'nowrap' }}>{note}</div>
      )}
    </>
  );
}

// Bandeau branché sur la carte en attente (vue du bureau et vue de l'étagère) : réglette des cartes pas encore dans `layout` (la
// disposition reçue), ✕ annule, ✓ pose la carte en attente ou, sans elle, referme la vue.
export function PendingChrome({ mode, add, layout, pend, onClose }: { mode: 'move' | 'add'; add?: AddProps; layout: Layout; pend: ReturnType<typeof usePendingCard>; onClose(): void }): ReactElement {
  const taken = useMemo(() => placedSlugs(layout), [layout]);
  return (
    <ArrangeChrome mode={mode} pending={pend.shown} note={pend.message} onCancel={pend.cancel} onDone={() => { if (!pend.commit()) onClose(); }}
      strip={add ? <CardStrip cards={add.cards} taken={taken} pending={pend.slug} onPick={pend.pick} /> : null} />
  );
}

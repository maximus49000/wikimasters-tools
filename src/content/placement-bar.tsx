import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react';
import { useAnchor } from './action-bubble';
import { Btn, Icon, ICONS } from './library-ui';

type Anchor = { stage: HTMLElement | null; scroll: HTMLElement | null; targetId: string };

// Barre du mode placement, au-dessus de l'objet : ses boutons propres, puis ✗ (annuler) et ✓ (valider, grisé si l'emplacement est refusé).
export function PlacementBar({ stage, scroll, targetId, ok, onCancel, onConfirm, children }: Anchor & { ok: boolean; onCancel: () => void; onConfirm: () => void; children: ReactNode }): ReactElement {
  const { ref, pos } = useAnchor(stage, scroll, targetId, 'above');
  return (
    <div ref={ref} className="wmt-lib-bubble wmt-lib-placebar" data-placement-bar role="toolbar" aria-label="Placement de l’objet" style={{ left: pos.left, top: pos.top }}>
      {children}
      <span className="wmt-lib-placebar-sep" />
      <Btn className="wmt-lib-cancel" label="Annuler" data={{ action: 'place-cancel' }} onClick={onCancel}>
        <Icon paths={ICONS.close} />
      </Btn>
      <Btn className="wmt-lib-confirm" label="Valider" disabled={!ok} data={{ action: 'place-confirm' }} onClick={onConfirm}>
        <Icon paths={ICONS.check} />
      </Btn>
    </div>
  );
}

// Poignée ✥ au centre de l'objet : on la fait glisser pour déplacer le fantôme.
export function PlacementGrip({ stage, scroll, targetId, onGrab }: Anchor & { onGrab: (event: ReactPointerEvent<HTMLButtonElement>) => void }): ReactElement {
  const { ref, pos } = useAnchor(stage, scroll, targetId, 'center');
  return (
    <div ref={ref} className="wmt-lib-grip-box" style={{ left: pos.left, top: pos.top }}>
      <button type="button" className="wmt-lib-grip" data-action="place-grip" aria-label="Glisser pour déplacer" title="Glisser pour déplacer" onPointerDown={onGrab} style={{ touchAction: 'none' }}>
        <Icon paths={ICONS.move} />
      </button>
    </div>
  );
}

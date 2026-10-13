import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { Icon } from './library-ui';

export type MenuId = 'sky' | 'pets' | 'room';

// Bouton de la barre du haut et son menu déroulant. Le menu reste monté (caché) pour garder ses champs en mémoire.
// Un seul menu ouvert à la fois : l'état vit dans la barre. Échap ou un toucher hors du menu le ferme.
export function Popover({ id, open, onOpen, label, icon, children }: { id: MenuId; open: MenuId | null; onOpen: (id: MenuId | null) => void; label: string; icon: readonly string[]; children: ReactNode }): ReactElement {
  const box = useRef<HTMLSpanElement | null>(null);
  const shown = open === id;
  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onOpen(null);
    };
    // composedPath : le panneau peut vivre dans un shadow root (panneaux de la Collection).
    const onDown = (event: PointerEvent): void => {
      if (box.current && !event.composedPath().includes(box.current)) onOpen(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [shown, onOpen]);
  return (
    <span className="wmt-lib-pop" ref={box}>
      <button type="button" className="wmt-lib-btn" aria-label={label} title={label} aria-expanded={shown} data-menu-button={id} onClick={() => onOpen(shown ? null : id)}>
        <Icon paths={icon} />
      </button>
      <div className="wmt-lib-pop-panel" role="dialog" aria-label={label} data-menu={id} hidden={!shown}>
        {children}
      </div>
    </span>
  );
}

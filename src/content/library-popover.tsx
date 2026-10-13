import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from './library-ui';

export type MenuId = 'sky' | 'pets' | 'room';

// Bouton de la barre du haut et son menu déroulant. Le menu reste monté (caché) pour garder ses champs en mémoire.
// Un seul menu ouvert à la fois : l'état vit dans la barre. Échap ou un toucher hors du menu le ferme.
// Le menu s'ouvre du côté où il a la place : vers la gauche si son bouton est dans la moitié droite de l'écran.
export function Popover({ id, open, onOpen, label, icon, children }: { id: MenuId; open: MenuId | null; onOpen: (id: MenuId | null) => void; label: string; icon: readonly string[]; children: ReactNode }): ReactElement {
  const box = useRef<HTMLSpanElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const [align, setAlign] = useState<'start' | 'end'>('end');
  const shown = open === id;
  // Un champ en cours de saisie (nom de la pièce, d'un animal) s'enregistre à la perte du focus : on la provoque avant de
  // cacher le menu, sinon certains moteurs déplacent le focus sans « blur » et la saisie serait perdue.
  const close = (): void => {
    const root = (box.current?.getRootNode() ?? document) as Document | ShadowRoot;
    const active = root.activeElement;
    if (active instanceof HTMLElement && box.current?.contains(active)) active.blur();
    onOpen(null);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeRef.current();
    };
    // composedPath : le panneau peut vivre dans un shadow root (panneaux de la Collection).
    const onDown = (event: PointerEvent): void => {
      if (box.current && !event.composedPath().includes(box.current)) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [shown]);
  const toggle = (): void => {
    if (shown) return close();
    const r = button.current?.getBoundingClientRect();
    setAlign(r && r.left + r.width / 2 > window.innerWidth / 2 ? 'end' : 'start');
    onOpen(id);
  };
  return (
    <span className="wmt-lib-pop" ref={box}>
      <button ref={button} type="button" className="wmt-lib-btn" aria-label={label} title={label} aria-expanded={shown} data-menu-button={id} onClick={toggle}>
        <Icon paths={icon} />
      </button>
      <div className="wmt-lib-pop-panel" role="dialog" aria-label={label} data-menu={id} data-align={align} hidden={!shown}>
        {children}
      </div>
    </span>
  );
}

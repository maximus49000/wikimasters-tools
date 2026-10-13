import { useState, type ReactElement, type ReactNode } from 'react';
import { Popover, type MenuId } from './library-popover';
import { Btn, Icon, ICONS } from './library-ui';

type Props = {
  rooms: { id: string; name: string }[];
  activeId: string;
  homeId: string | null;
  onRoom: (id: string) => void;
  onAddRoom: () => void;
  editing: boolean;
  onMode: (mode: 'visit' | 'edit') => void;
  fullscreenActive: boolean;
  onFullscreen: () => void;
  sky: ReactNode;
  pets: ReactNode;
  roomMenu: ReactNode;
};

// Barre du haut de Ma Pièce, toujours visible : pièces, Visiter / Aménager, plein écran, et les menus de l'ambiance
// (☁️ ciel et météo, 🐾 animaux, ⋯ réglages). La construction, elle, est dans le tiroir du bas.
export function LibraryTopBar(p: Props): ReactElement {
  const [open, setOpen] = useState<MenuId | null>(null);
  return (
    <div className="wmt-lib-row wmt-lib-topbar">
      <span role="tablist" aria-label="Pièces" className="wmt-lib-rooms">
        {p.rooms.map((r) => (
          <button key={r.id} type="button" role="tab" className="wmt-lib-btn" aria-selected={r.id === p.activeId} data-room={r.id} onClick={() => p.onRoom(r.id)}>
            {r.id === p.homeId && <Icon paths={ICONS.star} />}
            {r.name}
          </button>
        ))}
        <Btn label="Ajouter une pièce" data={{ action: 'add-room' }} onClick={p.onAddRoom}>
          <Icon paths={ICONS.plus} />
        </Btn>
      </span>
      <Btn label="Visiter" pressed={!p.editing} data={{ action: 'visit' }} onClick={() => p.onMode('visit')}>
        <Icon paths={ICONS.eye} />
      </Btn>
      <Btn label="Aménager" pressed={p.editing} data={{ action: 'edit' }} onClick={() => p.onMode('edit')}>
        <Icon paths={ICONS.pencil} />
      </Btn>
      <Btn label={p.fullscreenActive ? 'Quitter le plein écran' : 'Plein écran'} data={{ action: 'fullscreen' }} onClick={p.onFullscreen}>
        <Icon paths={ICONS.fullscreen} />
      </Btn>
      <span className="wmt-lib-sep" />
      <Popover id="sky" open={open} onOpen={setOpen} label="Ciel et météo" icon={ICONS.cloud}>
        {p.sky}
      </Popover>
      <Popover id="pets" open={open} onOpen={setOpen} label="Animaux" icon={ICONS.paw}>
        {p.pets}
      </Popover>
      <Popover id="room" open={open} onOpen={setOpen} label="Réglages de la pièce" icon={ICONS.more}>
        {p.roomMenu}
      </Popover>
    </div>
  );
}

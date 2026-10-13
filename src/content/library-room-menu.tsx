import type { ReactElement } from 'react';
import { Btn, Icon, ICONS } from './library-ui';

type Props = { roomId: string; name: string; isHome: boolean; canDelete: boolean; onRename: (name: string) => void; onToggleHome: () => void; onDelete: () => void };

// Menu ⋯ de la barre du haut : nom de la pièce, pièce d'accueil, suppression (ou vidage de la dernière pièce).
export function RoomMenu({ roomId, name, isHome, canDelete, onRename, onToggleHome, onDelete }: Props): ReactElement {
  return (
    <div className="wmt-lib-pop-group" role="group" aria-label="Réglages de la pièce">
      <input
        key={roomId}
        className="wmt-lib-name"
        aria-label="Nom de la pièce"
        defaultValue={name}
        maxLength={30}
        // La valeur est lue tout de suite : currentTarget n'existe plus quand l'écriture s'exécute.
        onBlur={(event) => onRename(event.currentTarget.value)}
      />
      <Btn label="Pièce d’accueil : s’ouvre au lancement" pressed={isHome} data={{ action: 'home' }} onClick={onToggleHome}>
        <Icon paths={ICONS.star} />
      </Btn>
      <Btn label={canDelete ? 'Supprimer la pièce' : 'Vider la pièce'} data={{ action: 'delete-room' }} onClick={onDelete}>
        <Icon paths={ICONS.trash} />
      </Btn>
    </div>
  );
}

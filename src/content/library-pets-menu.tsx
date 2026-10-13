import type { ReactElement } from 'react';
import { MAX_PET_NAME, MAX_PETS } from '../core/library/library-book';
import { coatsOf, type Coat, type Pet, type Species } from '../core/library/library-types';
import { COAT_LABELS, paletteOf as coatPaletteOf } from './pet-sprite';
import { DOG_COAT_LABELS } from './dog-sprite';
import { ROBOT_COAT_LABELS } from './robot-sprite';
import { Btn, Icon, ICONS } from './library-ui';

const COAT_LABELS_OF: Record<Species, Record<string, string>> = { cat: COAT_LABELS, dog: DOG_COAT_LABELS, robot: ROBOT_COAT_LABELS };
const coatLabel = (species: Species, coat: Coat): string => COAT_LABELS_OF[species][coat] ?? coat;

// Textes propres à chaque espèce.
export const SPECIES_TEXT: Record<Species, { name: string; adoptName: string; confirm: string; adoptLabel: string; defaultName: string; defaultCoat: Coat }> = {
  cat: { name: 'Nom du chat', adoptName: 'Nom du chat à adopter', confirm: 'Adopter ce chat', adoptLabel: 'Adopter un chat', defaultName: 'Minou', defaultCoat: 'orange' },
  dog: { name: 'Nom du chien', adoptName: 'Nom du chien à adopter', confirm: 'Adopter ce chien', adoptLabel: 'Adopter un chien', defaultName: 'Rex', defaultCoat: 'brown' },
  robot: { name: 'Nom du robot', adoptName: 'Nom du robot à adopter', confirm: 'Adopter ce robot', adoptLabel: 'Adopter un robot', defaultName: 'Robi', defaultCoat: 'white' },
};

type Props = {
  roomId: string;
  pets: Pet[];
  adopting: Species | null;
  adoptName: string;
  adoptCoat: Coat;
  onRename: (pet: Pet, name: string) => void;
  onRemove: (pet: Pet) => void;
  onStartAdopt: (species: Species) => void;
  onAdoptName: (name: string) => void;
  onAdoptCoat: (coat: Coat) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

// Menu 🐾 de la barre du haut : animaux de la pièce (renommer, retirer) et adoption.
export function PetsMenu(p: Props): ReactElement {
  const adopting = p.adopting;
  return (
    <div className="wmt-lib-pop-group" role="group" aria-label="Animaux">
      {p.pets.map((pet) => (
        <span key={`${p.roomId}:${pet.id}`} className="wmt-lib-pet" data-pet-edit={pet.id}>
          <input
            className="wmt-lib-name"
            aria-label={SPECIES_TEXT[pet.species].name}
            defaultValue={pet.name}
            maxLength={MAX_PET_NAME}
            onBlur={(event) => {
              const name = event.currentTarget.value;
              if (!name.trim()) {
                event.currentTarget.value = pet.name;
                return;
              }
              if (name === pet.name) return;
              p.onRename(pet, name);
            }}
          />
          <Btn label={`Retirer ${pet.name}`} data={{ action: 'remove-pet', pet: pet.id }} onClick={() => p.onRemove(pet)}>
            <Icon paths={ICONS.trash} />
          </Btn>
        </span>
      ))}
      {adopting !== null ? (
        <>
          <input className="wmt-lib-name" aria-label={SPECIES_TEXT[adopting].adoptName} value={p.adoptName} maxLength={MAX_PET_NAME} onChange={(event) => p.onAdoptName(event.currentTarget.value)} />
          {coatsOf(adopting).map((coat) => (
            <Btn key={coat} label={coatLabel(adopting, coat)} pressed={p.adoptCoat === coat} data={{ coat }} onClick={() => p.onAdoptCoat(coat)}>
              <span className="wmt-lib-swatch" style={{ background: coatPaletteOf(adopting, coat).body, borderColor: coatPaletteOf(adopting, coat).belly }} />
            </Btn>
          ))}
          <Btn label={SPECIES_TEXT[adopting].confirm} data={{ action: 'adopt-confirm' }} onClick={p.onConfirm}>
            <Icon paths={ICONS.check} />
          </Btn>
          <Btn label="Annuler" data={{ action: 'adopt-cancel' }} onClick={p.onCancel}>
            <Icon paths={ICONS.close} />
          </Btn>
        </>
      ) : (
        p.pets.length < MAX_PETS && (
          <>
            <Btn label="Adopter un chat" data={{ action: 'adopt' }} onClick={() => p.onStartAdopt('cat')}>
              <Icon paths={ICONS.cat} />
            </Btn>
            <Btn label="Adopter un chien" data={{ action: 'adopt-dog' }} onClick={() => p.onStartAdopt('dog')}>
              <Icon paths={ICONS.dog} />
            </Btn>
            <Btn label="Adopter un robot" data={{ action: 'adopt-robot' }} onClick={() => p.onStartAdopt('robot')}>
              <Icon paths={ICONS.robot} />
            </Btn>
          </>
        )
      )}
    </div>
  );
}

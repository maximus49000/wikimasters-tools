import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { cityMinutes, searchCities } from '../core/library/clock-cities';
import type { CityTime } from '../core/library/deco';
import { formatMinutes } from '../core/library/time-setting';
import { DECO_DIALOG_ATTR } from './deco-dialog-guard';
import { Btn, Icon, ICONS } from './library-ui';

type Props = {
  current?: CityTime;
  sceneMinutes: number;
  onChoose: (city: CityTime | null) => void;
  onClose: () => void;
};

// Choix de la ville dont une horloge affiche l'heure (ou retour à l'heure de la scène).
export function CityPickerDialog({ current, sceneMinutes, onChoose, onClose }: Props): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  // Le conteneur prend le focus (sans clavier virtuel) : Échap l'atteint même si rien n'est tapé.
  useEffect(() => { box.current?.focus(); }, []);
  const [query, setQuery] = useState('');
  const now = new Date();
  const cities = searchCities(query);
  // Échap ferme la fenêtre et ne remonte pas (il annulerait le placement ou le zoom).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
  };
  return (
    <div ref={box} tabIndex={-1} {...{ [DECO_DIALOG_ATTR]: '' }} className="wmt-lib-dialog wmt-lib-dialog-top" onKeyDown={onKeyDown} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wmt-lib-dialog-panel" role="dialog" aria-modal="true" aria-label="Heure de quelle ville ?">
        <div className="wmt-lib-row">
          <span className="wmt-lib-sep">Heure de quelle ville ?</span>
          <Btn label="Fermer" data={{ action: 'deco-city-close' }} onClick={onClose}><Icon paths={ICONS.close} /></Btn>
        </div>
        <input type="search" data-city-search="" placeholder="Chercher une ville…" value={query} onChange={(e) => setQuery(e.currentTarget.value)} autoFocus />
        <div className="wmt-city-list">
          <button type="button" data-city-tz="" aria-pressed={!current} onClick={() => onChoose(null)}>
            📍 Heure de la scène <span>{formatMinutes(sceneMinutes)}</span>
          </button>
          {cities.map((c) => (
            <button type="button" key={`${c.name}|${c.country}`} data-city-tz={c.tz} aria-pressed={current?.tz === c.tz && current.name === c.name} onClick={() => onChoose({ name: c.name, tz: c.tz })}>
              {c.name}, {c.country} <span>{formatMinutes(cityMinutes(sceneMinutes, c.tz, now))}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

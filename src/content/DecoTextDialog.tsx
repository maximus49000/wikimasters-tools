import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { MAX_PANEL_TEXT, NEON_COLORS, type NeonColor } from '../core/library/deco';
import { DECO_DIALOG_ATTR } from './deco-dialog-guard';
import { Btn, Icon, ICONS } from './library-ui';

type Props = {
  title: string;
  text: string;
  neon?: NeonColor;
  onSave: (text: string, neon?: NeonColor) => void;
  onClose: () => void;
};

const NEON_LABEL: Record<NeonColor, string> = { pink: 'Rose', cyan: 'Bleu', yellow: 'Jaune', green: 'Vert', white: 'Blanc' };

// Texte d'un panneau (et couleur du néon). Pas de focus automatique : sur Android le clavier recouvrirait la fenêtre.
export function DecoTextDialog({ title, text, neon, onSave, onClose }: Props): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  // Le conteneur prend le focus (sans clavier virtuel) : Échap l'atteint même si rien n'est tapé.
  useEffect(() => { box.current?.focus(); }, []);
  const [draft, setDraft] = useState(text);
  const [color, setColor] = useState<NeonColor | undefined>(neon);
  // Aucune touche ne remonte (raccourcis de la pièce) ; Échap ferme sans enregistrer.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
  };
  return (
    <div ref={box} tabIndex={-1} {...{ [DECO_DIALOG_ATTR]: '' }} className="wmt-lib-dialog wmt-lib-dialog-top" onKeyDown={onKeyDown} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wmt-lib-dialog-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="wmt-lib-row">
          <span className="wmt-lib-sep">{title}</span>
          <Btn label="Fermer" data={{ action: 'deco-text-close' }} onClick={onClose}><Icon paths={ICONS.close} /></Btn>
        </div>
        <textarea data-deco-text="" maxLength={MAX_PANEL_TEXT} rows={4} value={draft} onChange={(e) => setDraft(e.currentTarget.value)} />
        <div className="wmt-lib-row">
          <span className="wmt-lib-sep">{draft.length}/{MAX_PANEL_TEXT}</span>
          {color !== undefined && (Object.keys(NEON_COLORS) as NeonColor[]).map((key) => (
            <button key={key} type="button" className="wmt-neon-dot" data-neon={key} aria-pressed={key === color} aria-label={NEON_LABEL[key]} title={NEON_LABEL[key]} style={{ background: NEON_COLORS[key] }} onClick={() => setColor(key)} />
          ))}
          <Btn label="Enregistrer" data={{ action: 'deco-text-ok' }} onClick={() => onSave(draft, color)}><Icon paths={ICONS.check} /></Btn>
        </div>
      </div>
    </div>
  );
}

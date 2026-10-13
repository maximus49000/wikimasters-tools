import { useLayoutEffect, useRef, type ReactElement } from 'react';
import { catalogTree, labelOf, type CatalogNode, type Category, type Subcategory } from '../core/library/furniture-catalog';
import { STYLE_IDS, type FurnitureKind, type Orientation, type StyleId } from '../core/library/library-types';
import { STYLE_LABELS, paletteOf } from '../core/library/styles';
import { CATEGORY_ICON } from './furniture-icons';
import { FurnitureThumb } from './furniture-thumb';
import { Btn, Icon, ICONS } from './library-ui';

export type DrawerTab = 'furniture' | 'cards' | 'room';
export type DrawerState = { tab: DrawerTab; category: Category; sub: Subcategory | null; reduced: boolean };
export const INITIAL_DRAWER: DrawerState = { tab: 'furniture', category: 'storage', sub: null, reduced: false };

const SUB_ICON: Record<Subcategory, readonly string[]> = { plants: ICONS.plants, lights: ICONS.lights, floor: ICONS.floor, walls: ICONS.walls };
const TABS: { id: DrawerTab; label: string; icon: readonly string[] }[] = [
  { id: 'furniture', label: 'Meubles', icon: ICONS.sofaTab },
  { id: 'cards', label: 'Cartes', icon: ICONS.frame },
  { id: 'room', label: 'Pièce', icon: ICONS.bricks },
];

type Props = {
  state: DrawerState;
  onState: (next: DrawerState) => void;
  style: StyleId;
  orientation: Orientation;
  hasCollection: boolean;
  // Caché pendant un placement : le tiroir reste monté et garde son état.
  hidden?: boolean;
  onKind: (kind: FurnitureKind) => void;
  onCard: () => void;
  onStyle: (id: StyleId) => void;
  onOrientation: (orientation: Orientation) => void;
  onExtend: (side: 'left' | 'right') => void;
  onShrink: (side: 'left' | 'right') => void;
};

// Hauteur du tiroir recopiée sur la scène (--wmt-drawer-h) : hors plein écran, la pièce s'arrête au-dessus du tiroir.
function useDrawerHeight(reduced: boolean) {
  const box = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const stage = el?.parentElement;
    if (!el || !stage || typeof ResizeObserver === 'undefined') return;
    const sync = (): void => stage.style.setProperty('--wmt-drawer-h', `${el.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      observer.disconnect();
      stage.style.removeProperty('--wmt-drawer-h');
    };
  }, [reduced]);
  return box;
}

// Tiroir de construction (mode Aménager), façon mode Achat des Sims : onglets → catégories → sous-catégories → vignettes.
// Les panneaux des onglets restent montés (cachés) ; le tiroir se réduit en une poignée pour contempler la scène.
export function BuildDrawer(props: Props): ReactElement {
  const { state, onState, style, hasCollection } = props;
  const box = useDrawerHeight(state.reduced);
  if (state.reduced) {
    return (
      <div ref={box} className="wmt-lib-drawer wmt-lib-drawer-reduced" data-drawer data-reduced="true" hidden={props.hidden}>
        <Btn label="Ouvrir le tiroir de construction" data={{ action: 'drawer-open' }} onClick={() => onState({ ...state, reduced: false })}>
          <Icon paths={ICONS.chevronUp} />
        </Btn>
      </div>
    );
  }
  const tree = catalogTree(style);
  // Catégorie disparue (pièce qui n'est plus Steampunk) ou onglet Cartes sans Collection : retour au premier choix.
  const node = tree.find((n) => n.id === state.category) ?? (tree[0] as CatalogNode);
  const tab: DrawerTab = state.tab === 'cards' && !hasCollection ? 'furniture' : state.tab;
  const sub = node.subcategories.find((s) => s.id === state.sub) ?? node.subcategories[0] ?? null;
  const kinds = sub ? sub.kinds : node.kinds;
  const tabs = TABS.filter((t) => t.id !== 'cards' || hasCollection);
  return (
    <div ref={box} className="wmt-lib-drawer" data-drawer data-reduced="false" hidden={props.hidden}>
      <div className="wmt-lib-drawer-tabs" role="tablist" aria-label="Construction">
        <span className="wmt-lib-tabs-pill">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" className="wmt-lib-btn" aria-label={t.label} title={t.label} aria-selected={tab === t.id} data-drawer-tab={t.id} onClick={() => onState({ ...state, tab: t.id })}>
              <Icon paths={t.icon} />
              <span className="wmt-lib-tab-label">{t.label}</span>
            </button>
          ))}
        </span>
        <span className="wmt-lib-sep" />
        <Btn label="Réduire le tiroir" data={{ action: 'drawer-reduce' }} onClick={() => onState({ ...state, reduced: true })}>
          <Icon paths={ICONS.chevronDown} />
        </Btn>
      </div>

      <div className="wmt-lib-drawer-panel" data-drawer-panel="furniture" hidden={tab !== 'furniture'}>
        <div className="wmt-lib-drawer-body">
          {/* Catégories en colonne à gauche, comme le panneau de la maison du mode Achat des Sims. */}
          <div className="wmt-lib-cats" role="group" aria-label="Catégories de meubles">
            {tree.map((c) => (
              <Btn key={c.id} className="wmt-lib-cat" label={c.label} pressed={node.id === c.id} data={{ category: c.id }} onClick={() => onState({ ...state, category: c.id, sub: null })}>
                <Icon paths={CATEGORY_ICON[c.id]} />
              </Btn>
            ))}
          </div>
          <div className="wmt-lib-drawer-right">
            {node.subcategories.length > 0 ? (
              <div className="wmt-lib-chips wmt-lib-subchips" role="group" aria-label={`Sous-catégories : ${node.label}`}>
                {node.subcategories.map((s) => (
                  <Btn key={s.id} className="wmt-lib-chip" label={s.label} pressed={sub?.id === s.id} data={{ subcategory: s.id }} onClick={() => onState({ ...state, sub: s.id })}>
                    <Icon paths={SUB_ICON[s.id]} />
                    <span>{s.label}</span>
                  </Btn>
                ))}
              </div>
            ) : (
              <div className="wmt-lib-cat-title">{node.label}</div>
            )}
            <div className="wmt-lib-thumbs">
              {kinds.map((kind) => (
                <Btn key={kind} className="wmt-lib-thumb" label={`Poser : ${labelOf(kind)}`} data={{ kind }} onClick={() => props.onKind(kind)}>
                  <FurnitureThumb kind={kind} style={style} />
                  <span className="wmt-lib-thumb-name">{labelOf(kind)}</span>
                </Btn>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hasCollection && (
        <div className="wmt-lib-drawer-panel wmt-lib-thumbs" data-drawer-panel="cards" hidden={tab !== 'cards'}>
          <Btn className="wmt-lib-thumb" label="Ajouter une carte" data={{ action: 'add-card' }} onClick={props.onCard}>
            <Icon paths={ICONS.card} />
            <span className="wmt-lib-thumb-name">Carte</span>
          </Btn>
        </div>
      )}

      <div className="wmt-lib-drawer-panel" data-drawer-panel="room" hidden={tab !== 'room'}>
        <div className="wmt-lib-chips" role="group" aria-label="Style de la pièce">
          {STYLE_IDS.map((id) => (
            <Btn key={id} label={STYLE_LABELS[id]} pressed={style === id} data={{ style: id }} onClick={() => props.onStyle(id)}>
              <span className="wmt-lib-swatch" style={{ background: paletteOf(id).wall, borderColor: paletteOf(id).floor }} />
            </Btn>
          ))}
        </div>
        <div className="wmt-lib-chips" role="group" aria-label="Dimensions de la pièce">
          <Btn label="Pièce horizontale" pressed={props.orientation === 'landscape'} data={{ orient: 'landscape' }} onClick={() => props.onOrientation('landscape')}>
            <Icon paths={ICONS.landscape} />
          </Btn>
          <Btn label="Pièce verticale" pressed={props.orientation === 'portrait'} data={{ orient: 'portrait' }} onClick={() => props.onOrientation('portrait')}>
            <Icon paths={ICONS.portrait} />
          </Btn>
          <span className="wmt-lib-sep" />
          <Btn label="Agrandir la pièce à gauche" data={{ action: 'extend-left' }} onClick={() => props.onExtend('left')}>
            <Icon paths={ICONS.extendLeft} />
          </Btn>
          <Btn label="Réduire la pièce à gauche" data={{ action: 'shrink-left' }} onClick={() => props.onShrink('left')}>
            <Icon paths={ICONS.shrinkLeft} />
          </Btn>
          <Btn label="Réduire la pièce à droite" data={{ action: 'shrink-right' }} onClick={() => props.onShrink('right')}>
            <Icon paths={ICONS.shrinkRight} />
          </Btn>
          <Btn label="Agrandir la pièce à droite" data={{ action: 'extend-right' }} onClick={() => props.onExtend('right')}>
            <Icon paths={ICONS.extendRight} />
          </Btn>
        </div>
      </div>
    </div>
  );
}

import { createRoot, type Root } from 'react-dom/client';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { setActive } from '../core/library/library-book';
import type { LibraryRepo } from '../core/library/library-repo';
import { createLaunchGate } from './library-launch';
import { LIBRARY_CSS, LibraryPanel } from './LibraryPanel';

export const LIBRARY_WINDOW_ATTRIBUTE = 'data-wmt-library-window';
export const LIBRARY_TITLE = 'Ma Pièce';


// Au-dessus de la page, sous les fiches de cartes (elles s'ouvrent depuis la pièce).
const WINDOW_Z = 2147482999;

const WINDOW_CSS = `
.wmt-libwin{position:fixed;inset:0;z-index:${WINDOW_Z};background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box}
.wmt-libwin-box{position:relative;box-sizing:border-box;width:100%;max-width:1200px;max-height:100%;overflow:auto;border-radius:14px;background:var(--color-surface,#0d1117);color:var(--color-foreground,#e6edf3)}
.wmt-libwin-head{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:var(--color-surface,#0d1117);border-bottom:1px solid rgba(148,163,184,.25);font:600 15px/20px system-ui,sans-serif}
.wmt-libwin-close{min-width:40px;min-height:40px;border-radius:999px;border:1px solid rgba(148,163,184,.35);background:transparent;color:inherit;font:inherit;font-size:18px;cursor:pointer}
.wmt-libwin .wmt-lib{margin:0;border:0;border-radius:0}
`;

type Deps = {
  library: LibraryRepo;
  collection: CollectionRepo;
  kinds: KindsRepo;
  onOpenCard: (slug: string) => void;
  onOpenMarket: (slug: string) => void;
};

// « Ma Pièce » : la Bibliothèque vit dans sa propre fenêtre, ouverte depuis le menu du site (juste après « Collection »),
// et non plus dans la Collection (qu'elle alourdissait).
export function createLibraryWindow({ library, collection, kinds, onOpenCard, onOpenMarket }: Deps) {
  // Pièce d'accueil : appliquée une seule fois, à la première ouverture après le démarrage.
  const launch = createLaunchGate();
  let opened: { host: HTMLElement; root: Root; onKey: (event: KeyboardEvent) => void } | null = null;

  function close(): void {
    if (!opened) return;
    document.removeEventListener('keydown', opened.onKey, true);
    opened.root.unmount();
    opened.host.remove();
    opened = null;
  }

  function open(): void {
    if (opened) return;
    const home = launch.take(library.current());
    if (home !== null) void library.update((state) => setActive(state, home));
    const host = document.createElement('div');
    host.setAttribute(LIBRARY_WINDOW_ATTRIBUTE, '');
    host.style.cssText = `position:fixed; inset:0; z-index:${WINDOW_Z}`;
    // Le jeu ferme ses menus sur un appui « à l'extérieur » : on garde ces événements chez nous.
    for (const type of ['pointerdown', 'mousedown', 'touchstart']) host.addEventListener(type, (event) => event.stopPropagation());
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = LIBRARY_CSS + WINDOW_CSS;
    const mountPoint = document.createElement('div');
    shadow.append(style, mountPoint);
    document.body.appendChild(host);
    const root = createRoot(mountPoint);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || document.fullscreenElement) return;
      event.stopPropagation();
      close();
    };
    document.addEventListener('keydown', onKey, true);
    root.render(
      <div className="wmt-libwin" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div className="wmt-libwin-box" role="dialog" aria-label={LIBRARY_TITLE}>
          <div className="wmt-libwin-head">
            <span>{LIBRARY_TITLE}</span>
            <button type="button" className="wmt-libwin-close" aria-label="Fermer" title="Fermer" onClick={close}>✕</button>
          </div>
          <LibraryPanel library={library} collection={collection} kinds={kinds} onOpenCard={onOpenCard} onOpenMarket={onOpenMarket} />
        </div>
      </div>,
    );
    opened = { host, root, onKey };
  }

  return { open, close };
}

import { titleToSlug } from '../core/market/market-book';
import { findCardMounts } from './card-finder';
import { findAnyCardFrame } from './card-frame';

export const LOADING_HOST_ATTRIBUTE = 'data-wmt-loading';

// `mount` pose le glyphe dans le cadre de la carte et renvoie de quoi le retirer.
export type LoadingHandle = { unmount: () => void };
export type MountLoading = (frame: HTMLElement) => LoadingHandle;

const handles = new WeakMap<Element, LoadingHandle>();

// Un glyphe par carte en attente de relevé ; il disparaît dès que la carte n'est plus en attente
// (relevée, déjà à jour, erreur) ou n'est plus dans la page. Idempotent.
export function decorateLoading(root: ParentNode, pending: ReadonlySet<string>, mount: MountLoading): void {
  const framesWithGlyph = new Set<HTMLElement>();

  if (pending.size > 0) {
    for (const { title, container } of findCardMounts(root, (t) => pending.has(titleToSlug(t)))) {
      if (!pending.has(titleToSlug(title))) continue;
      const frame = findAnyCardFrame(container);
      if (!frame) continue;
      framesWithGlyph.add(frame);
      if (frame.querySelector(`:scope > [${LOADING_HOST_ATTRIBUTE}]`)) continue;

      const handle = mount(frame);
      const host = frame.querySelector(`:scope > [${LOADING_HOST_ATTRIBUTE}]`);
      if (host) handles.set(host, handle);
    }
  }

  for (const host of root.querySelectorAll(`[${LOADING_HOST_ATTRIBUTE}]`)) {
    const parent = host.parentElement;
    if (parent && framesWithGlyph.has(parent)) continue;
    handles.get(host)?.unmount();
    host.remove();
  }
}

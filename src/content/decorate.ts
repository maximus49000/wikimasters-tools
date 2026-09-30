import { toBadgeModel, type BadgeModel } from '../core/pricing/badge';
import type { PriceBook } from '../core/pricing/price-book';
import { findCardMounts } from './card-finder';

export const HOST_ATTRIBUTE = 'data-wmt-host';

export type MountBadge = (container: HTMLElement, model: BadgeModel) => void;

export function decorate(root: ParentNode, book: PriceBook, mount: MountBadge): number {
  let mounted = 0;
  for (const { title, container } of findCardMounts(root, (t) => book.byTitle(t) !== null)) {
    if (container.querySelector(`:scope > [${HOST_ATTRIBUTE}]`)) continue;
    const entry = book.byTitle(title);
    const model = entry ? toBadgeModel(entry.stats) : null;
    if (!model) continue;
    mount(container, model);
    mounted += 1;
  }
  return mounted;
}

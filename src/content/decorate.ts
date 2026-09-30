import { toBadgeModel, toPurchaseModel, type BadgeModel, type PurchaseModel } from '../core/pricing/badge';
import type { PriceBook } from '../core/pricing/price-book';
import { findCardFrame } from './card-frame';
import { findCardMounts } from './card-finder';

export const HOST_ATTRIBUTE = 'data-wmt-host';
export const PURCHASE_HOST_ATTRIBUTE = 'data-wmt-purchase';

export type MountBadge = (container: HTMLElement, model: BadgeModel) => void;
export type MountPurchase = (frame: HTMLElement, model: PurchaseModel) => void;

export function decorate(
  root: ParentNode,
  book: PriceBook,
  mount: MountBadge,
  mountPurchase?: MountPurchase,
): number {
  let mounted = 0;
  for (const { title, container } of findCardMounts(root, (t) => book.byTitle(t) !== null)) {
    const entry = book.byTitle(title);
    if (!entry) continue;

    if (!container.querySelector(`:scope > [${HOST_ATTRIBUTE}]`)) {
      const model = toBadgeModel(entry.stats);
      if (model) {
        mount(container, model);
        mounted += 1;
      }
    }

    // La pastille d'achat est indépendante du badge texte : elle peut manquer seule.
    if (mountPurchase) {
      const purchase = toPurchaseModel(entry.purchase);
      const frame = purchase ? findCardFrame(container, entry.rarity) : null;
      if (purchase && frame && !frame.querySelector(`:scope > [${PURCHASE_HOST_ATTRIBUTE}]`)) {
        mountPurchase(frame, purchase);
        mounted += 1;
      }
    }
  }
  return mounted;
}

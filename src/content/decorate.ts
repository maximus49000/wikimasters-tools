import { toPurchaseModel, type PurchaseModel } from '../core/pricing/badge';
import type { PriceBook } from '../core/pricing/price-book';
import { findCardFrame } from './card-frame';
import { findCardMounts } from './card-finder';

export const PURCHASE_HOST_ATTRIBUTE = 'data-wmt-purchase';

export type MountPurchase = (frame: HTMLElement, model: PurchaseModel) => void;

export function decorate(
  root: ParentNode,
  book: PriceBook,
  mountPurchase?: MountPurchase,
): number {
  let mounted = 0;
  for (const { title, container } of findCardMounts(root, (t) => book.byTitle(t) !== null)) {
    const entry = book.byTitle(title);
    if (!entry) continue;

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

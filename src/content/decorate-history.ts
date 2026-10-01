import type { HistoryBadgeModel } from '../core/market/history-badge';
import { toHistoryBadge } from '../core/market/history-badge';
import { titleToSlug } from '../core/market/market-book';
import type { CardHistory } from '../core/market/price-history';
import { findCardMounts } from './card-finder';
import { findRarityChip } from './card-frame';

export const HISTORY_HOST_ATTRIBUTE = 'data-wmt-history';

// `mount` pose la pastille sous la rareté et renvoie de quoi la mettre à jour ; `host` existant : mise à jour.
export type HistoryBadgeHandle = { update: (model: HistoryBadgeModel) => void };
export type MountHistory = (frame: HTMLElement, chip: HTMLElement, model: HistoryBadgeModel) => HistoryBadgeHandle;

const handles = new WeakMap<Element, HistoryBadgeHandle>();

export function decorateHistory(
  root: ParentNode,
  lookup: (slug: string) => CardHistory[],
  now: number,
  mount: MountHistory,
  isOwned: (slug: string) => boolean = () => false,
): number {
  let touched = 0;
  const modelOf = (title: string) => {
    const slug = titleToSlug(title);
    return toHistoryBadge(lookup(slug), now, isOwned(slug));
  };
  for (const { title, container } of findCardMounts(root, (t) => modelOf(t) !== null)) {
    const model = modelOf(title);
    if (!model) continue;
    const found = findRarityChip(container, model.rarity);
    if (!found) continue;

    const existing = found.frame.querySelector(`:scope > [${HISTORY_HOST_ATTRIBUTE}]`);
    const handle = existing ? handles.get(existing) : undefined;
    if (handle) handle.update(model);
    else if (!existing) {
      const created = mount(found.frame, found.chip, model);
      const host = found.frame.querySelector(`:scope > [${HISTORY_HOST_ATTRIBUTE}]`);
      if (host) handles.set(host, created);
    }
    touched += 1;
  }
  return touched;
}

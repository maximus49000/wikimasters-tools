const RARITY_TEXT = /^(L|UR|SR|R|PC|C)$/;

// Retrouve le cadre visible d'une carte à partir de sa pastille de rareté (texte + position),
// sans dépendre des classes CSS du jeu.
export function findRarityChip(
  container: HTMLElement,
  rarity: string | null,
): { frame: HTMLElement; chip: HTMLElement } | null {
  for (const el of container.querySelectorAll<HTMLElement>('*')) {
    if (el.children.length > 0) continue;
    if (el.closest('[data-wmt-host], [data-wmt-purchase], [data-wmt-history], [data-wmt-loading]')) continue;
    const text = el.textContent?.trim() ?? '';
    if (rarity === null ? !RARITY_TEXT.test(text) : text !== rarity) continue;
    if (getComputedStyle(el).position !== 'absolute') continue;
    const parent = el.parentElement;
    // Le cadre doit être positionné pour ancrer notre pastille en absolu.
    if (parent && getComputedStyle(parent).position !== 'static') return { frame: parent, chip: el };
    return null;
  }
  return null;
}

export function findCardFrame(container: HTMLElement, rarity: string): HTMLElement | null {
  return findRarityChip(container, rarity)?.frame ?? null;
}


// Comme `findCardFrame`, sans connaître la rareté de la carte : toute pastille de rareté du jeu convient.
export function findAnyCardFrame(container: HTMLElement): HTMLElement | null {
  for (const el of container.querySelectorAll<HTMLElement>('*')) {
    if (el.children.length > 0) continue;
    if (el.closest('[data-wmt-host], [data-wmt-purchase], [data-wmt-history], [data-wmt-loading]')) continue;
    if (!RARITY_TEXT.test(el.textContent?.trim() ?? '')) continue;
    if (getComputedStyle(el).position !== 'absolute') continue;
    const parent = el.parentElement;
    return parent && getComputedStyle(parent).position !== 'static' ? parent : null;
  }
  return null;
}

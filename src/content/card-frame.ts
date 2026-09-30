// Retrouve le cadre visible d'une carte à partir de sa pastille de rareté (texte + position),
// sans dépendre des classes CSS du jeu.
export function findCardFrame(container: HTMLElement, rarity: string): HTMLElement | null {
  for (const el of container.querySelectorAll<HTMLElement>('*')) {
    if (el.children.length > 0) continue;
    if (el.closest('[data-wmt-host], [data-wmt-purchase]')) continue;
    if (el.textContent?.trim() !== rarity) continue;
    if (getComputedStyle(el).position !== 'absolute') continue;
    const parent = el.parentElement;
    // Le cadre doit être positionné pour ancrer notre pastille en absolu.
    if (parent && getComputedStyle(parent).position !== 'static') return parent;
    return null;
  }
  return null;
}

export const HIDDEN_ATTRIBUTE = 'data-wmt-purchase-hidden';
const OPEN_SHOP = 'button[aria-label="Ouvrir la boutique WikiBidous"]';
// Fenêtre « Boutique » (WikiBidous + WikiMasters PRO) et sections des Paramètres qui proposent un achat en argent réel.
const OFFER_TITLE = /^(Acheter des WikiBidous|WikiMasters PRO)$/;
const SHOP_DIALOG = '[role="dialog"][aria-label="Boutique"]';

let guardInstalled = false;

// La pastille du solde ouvre la boutique : tant que les offres sont masquées, l'appui ne l'ouvre pas (le solde reste affiché).
function installShopGuard(isHidden: () => boolean): void {
  if (guardInstalled) return;
  guardInstalled = true;
  const stop = (event: Event) => {
    if (!isHidden() || !(event.target instanceof Element) || !event.target.closest(OPEN_SHOP)) return;
    event.stopImmediatePropagation();
    event.preventDefault();
  };
  for (const type of ['click', 'pointerup', 'mouseup', 'touchend']) document.addEventListener(type, stop, true);
}

function hide(element: HTMLElement, on: boolean): void {
  if (on) {
    if (element.hasAttribute(HIDDEN_ATTRIBUTE)) return;
    element.setAttribute(HIDDEN_ATTRIBUTE, element.style.display);
    element.style.display = 'none';
  } else if (element.hasAttribute(HIDDEN_ATTRIBUTE)) {
    element.style.display = element.getAttribute(HIDDEN_ATTRIBUTE) ?? '';
    element.removeAttribute(HIDDEN_ATTRIBUTE);
  }
}

// Masque (hidden = true) ou remet les propositions d'achat en argent réel du site : sections des Paramètres, fenêtre Boutique.
export function syncPurchaseOffers(root: ParentNode, hidden: () => boolean): number {
  installShopGuard(hidden);
  const on = hidden();
  let touched = 0;
  for (const dialog of root.querySelectorAll<HTMLElement>(SHOP_DIALOG)) {
    hide(dialog, on);
    touched += 1;
  }
  for (const section of root.querySelectorAll<HTMLElement>('main section')) {
    const titled = [...section.querySelectorAll('*')].some((node) => node.children.length === 0 && OFFER_TITLE.test(node.textContent?.trim() ?? ''));
    if (!titled && !section.hasAttribute(HIDDEN_ATTRIBUTE)) continue;
    hide(section, on);
    touched += 1;
  }
  return touched;
}

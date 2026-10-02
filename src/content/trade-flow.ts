const POLL_MS = 250;
// Le dialogue attend le choix de l'ami : laisser le temps de le faire.
const TOTAL_MS = 3 * 60_000;
// Une carte absente de « Mes cartes » (déjà engagée dans un autre échange…) est abandonnée au bout de ce délai.
const CARD_WAIT_MS = 4_000;
const NOTICE_ATTRIBUTE = 'data-wmt-trade-notice';
const NOTICE_MS = 6_000;

const normalize = (text: string | null): string => (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

// Les fenêtres du site sont des couches `fixed` plein écran, reconnues à leur titre.
function findDialog(root: ParentNode, title: string): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>('div.fixed')].find((layer) => normalize(layer.textContent).includes(title)) ?? null;
}

// Le champ de recherche est piloté par React : il faut passer par le setter natif pour qu'il voie la saisie.
function setSearch(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function findCardButton(dialog: HTMLElement, title: string): HTMLButtonElement | null {
  const wanted = normalize(title);
  return [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((button) => normalize(button.querySelector('h3')?.textContent ?? null) === wanted) ?? null;
}

export function showNotice(text: string): void {
  document.querySelector(`[${NOTICE_ATTRIBUTE}]`)?.remove();
  const notice = document.createElement('div');
  notice.setAttribute(NOTICE_ATTRIBUTE, '');
  notice.textContent = text;
  notice.style.cssText =
    'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:90vw;padding:10px 16px;border-radius:10px;background:#1f2937;color:#fff;font:14px/20px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.5)';
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), NOTICE_MS);
}

export type TradeFlowDeps = {
  root?: ParentNode;
  path?: () => string;
  now?: () => number;
  notify?: (text: string) => void;
};

// Ouvre l'interface d'échange du site et y pose les cartes données : page Échanges, « Proposer un échange », puis — l'ami étant
// choisi par l'utilisateur — chaque carte est cherchée dans « Mes cartes » et cliquée. L'offre n'est jamais envoyée.
// Renvoie de quoi interrompre l'enchaînement.
export function startTradeFlow(titles: string[], deps: TradeFlowDeps = {}): () => void {
  const root = deps.root ?? document;
  const path = deps.path ?? (() => window.location.pathname);
  const now = deps.now ?? Date.now;
  const notify = deps.notify ?? showNotice;
  const remaining = [...titles];
  const missing: string[] = [];
  const deadline = now() + TOTAL_MS;
  let navigated = false;
  let opened = false;
  let sawPicker = false;
  let searchedFor: string | null = null;
  let searchedAt = 0;

  const finish = (): void => {
    clearInterval(timer);
    if (missing.length > 0) notify(`Pas trouvée dans vos cartes à échanger : ${missing.join(', ')}.`);
  };

  const placeCards = (dialog: HTMLElement): void => {
    const input = dialog.querySelector<HTMLInputElement>('input');
    const title = remaining[0];
    if (title === undefined) {
      if (input) setSearch(input, '');
      return finish();
    }
    if (!input) return;
    if (searchedFor !== title) {
      setSearch(input, title);
      searchedFor = title;
      searchedAt = now();
      return;
    }
    const button = findCardButton(dialog, title);
    if (button) {
      button.click();
      remaining.shift();
    } else if (now() - searchedAt > CARD_WAIT_MS) {
      missing.push(title);
      remaining.shift();
    }
  };

  const tick = (): void => {
    if (now() > deadline) return finish();
    const trade = findDialog(root, 'échanger avec');
    if (trade) return placeCards(trade);
    if (findDialog(root, 'choisir un ami')) {
      sawPicker = true;
      return;
    }
    // Le sélecteur d'ami a été refermé sans choisir : l'utilisateur renonce.
    if (sawPicker) return finish();
    if (!path().startsWith('/trades')) {
      if (navigated) return;
      navigated = true;
      const link = root.querySelector<HTMLAnchorElement>('a[href="/trades"]');
      if (!link) {
        notify('Page Échanges introuvable.');
        return finish();
      }
      link.click();
      return;
    }
    if (opened) return;
    const propose = [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => normalize(button.textContent).includes('proposer un échange'));
    if (!propose) return;
    opened = true;
    propose.click();
  };

  const timer = setInterval(tick, POLL_MS);
  tick();
  return () => clearInterval(timer);
}

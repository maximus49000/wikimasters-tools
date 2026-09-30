export type SearchControls = { input: HTMLInputElement; button: HTMLButtonElement };
export type SearchOutcome = 'started' | 'no-controls';

export type RunSearchOptions = {
  // Attente de l'apparition du champ (page en cours de chargement).
  timeoutMs?: number;
  // Attente de l'activation du bouton après la saisie.
  enableTimeoutMs?: number;
};

const POLL_MS = 25;
const MAX_CLIMB = 5;

// Le champ et le bouton sont repérés par leur texte, pas par des classes CSS que le site peut changer.
export function findSearchControls(root: ParentNode): SearchControls | null {
  const input = [...root.querySelectorAll<HTMLInputElement>('input[type="search"]')].find((el) =>
    /rechercher une carte/i.test(el.placeholder),
  );
  if (!input) return null;

  let scope = input.parentElement;
  for (let depth = 0; scope && depth < MAX_CLIMB; depth++, scope = scope.parentElement) {
    const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.textContent?.trim().toLowerCase() === 'rechercher',
    );
    if (button) return { input, button };
  }
  return null;
}

// Un champ contrôlé (React…) ignore `input.value = …` : on passe par le setter natif
// puis on émet l'événement `input`, comme le fait une vraie saisie.
export function fillInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export async function waitFor<T>(probe: () => T | null | false, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = probe();
    if (found) return found;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

// Une recherche = une saisie et un clic, exactement ce que ferait l'utilisateur.
export async function runSearch(
  root: ParentNode,
  query: string,
  { timeoutMs = 10_000, enableTimeoutMs = 2_000 }: RunSearchOptions = {},
): Promise<SearchOutcome> {
  const controls = await waitFor(() => findSearchControls(root), timeoutMs);
  if (!controls) return 'no-controls';

  fillInput(controls.input, query);
  const ready = await waitFor(() => !controls.button.disabled, enableTimeoutMs);
  if (!ready) return 'no-controls';

  controls.button.click();
  return 'started';
}

// Le nom du joueur n'est donné par aucune API du jeu : il est affiché sur la page « Profil » (titre « Mon Profil », puis son nom).
// On le lit là, quand la page est ouverte, et on le garde pour les envois suivants.
const KEY = 'wmt:profile-name';

export function readProfileName(root: ParentNode): string | null {
  const titles = [...root.querySelectorAll('h1')];
  const index = titles.findIndex((title) => title.textContent?.trim() === 'Mon Profil');
  const name = index >= 0 ? titles[index + 1]?.textContent?.trim() : undefined;
  return name ? name : null;
}

export type NameStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function rememberProfileName(root: ParentNode, storage: NameStorage, pathname: string = window.location.pathname): void {
  if (pathname !== '/profile') return;
  const name = readProfileName(root);
  if (!name) return;
  try {
    storage.setItem(KEY, name);
  } catch {
    // Stockage indisponible : le nom sera relu à la prochaine visite du profil.
  }
}

export function getProfileName(storage: NameStorage): string | null {
  try {
    return storage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

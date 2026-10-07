const open = new Map<string, () => void>();

// Les fenêtres de réglage ouvertes (Paramètre d'extension, WikiHow…), pour que la visite guidée puisse les fermer d'un coup.
export const registerSettingsWindow = (key: string, close: () => void): void => {
  open.set(key, close);
};
export const unregisterSettingsWindow = (key: string): void => {
  open.delete(key);
};

// Ferme les fenêtres ouvertes, sauf celles de `keep` (la visite elle-même).
export function closeSettingsWindows(keep: readonly string[] = []): void {
  for (const [key, close] of [...open]) if (!keep.includes(key)) close();
}

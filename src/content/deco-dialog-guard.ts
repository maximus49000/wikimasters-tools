// Les fenêtres « ville » et « écrire » gèrent Échap elles-mêmes : les écouteurs globaux d'Échap (fenêtres, popovers)
// doivent l'ignorer. composedPath traverse les shadow roots (la bibliothèque vit dans l'un d'eux).
export const DECO_DIALOG_ATTR = 'data-wmt-deco-dialog';
export const inDecoDialog = (event: Event): boolean => event.composedPath().some((node) => node instanceof Element && node.hasAttribute(DECO_DIALOG_ATTR));

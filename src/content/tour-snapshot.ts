const MAX_NODES = 80;
const OPAQUE = 'canvas, video, iframe';

// Copie réduite d'un élément pour l'encart de la visite : même texte, même mise en forme (styles calculés recopiés, car la bulle
// vit dans un shadow DOM qui ne reçoit pas le CSS du site), non cliquable. Rend null si l'élément est trop gros ou ne se copie pas
// (canvas, vidéo) : l'encart montre alors le glyphe de la fonction.
export function snapshot(element: Element): HTMLElement | null {
  const sources = [element, ...element.querySelectorAll('*')];
  if (sources.length > MAX_NODES || sources.some((node) => node.matches(OPAQUE))) return null;
  const clone = element.cloneNode(true) as HTMLElement;
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  sources.forEach((source, index) => {
    const copy = copies[index];
    if (!copy) return;
    const computed = getComputedStyle(source);
    let css = '';
    for (let i = 0; i < computed.length; i++) {
      const name = computed.item(i);
      css += `${name}:${computed.getPropertyValue(name)};`;
    }
    copy.style.cssText = css;
    // Posé comme un bloc ordinaire, inerte ; et sans les attributs qui feraient confondre la copie avec l'élément réel.
    copy.style.position = 'static';
    copy.style.margin = '0';
    copy.style.transform = 'none';
    copy.style.pointerEvents = 'none';
    for (const name of copy.getAttributeNames()) {
      if (name === 'id' || name === 'href' || name === 'name' || name.startsWith('data-wmt-')) copy.removeAttribute(name);
    }
  });
  return clone;
}

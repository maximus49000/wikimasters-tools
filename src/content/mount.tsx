import { createRoot } from 'react-dom/client';
import type { BadgeModel } from '../core/pricing/badge';
import { HOST_ATTRIBUTE } from './decorate';
import { PriceBadge } from './PriceBadge';

export function mountBadge(container: HTMLElement, model: BadgeModel): void {
  const host = document.createElement('div');
  host.setAttribute(HOST_ATTRIBUTE, '');
  host.style.display = 'block';

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  container.appendChild(host);
  createRoot(mountPoint).render(<PriceBadge model={model} />);
}

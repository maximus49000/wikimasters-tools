import { createRoot } from 'react-dom/client';
import type { BadgeModel, PurchaseModel } from '../core/pricing/badge';
import { HOST_ATTRIBUTE, PURCHASE_HOST_ATTRIBUTE } from './decorate';
import { PriceBadge } from './PriceBadge';
import { PurchaseBadge } from './PurchaseBadge';

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

export function mountPurchaseBadge(frame: HTMLElement, model: PurchaseModel): void {
  const host = document.createElement('div');
  host.setAttribute(PURCHASE_HOST_ATTRIBUTE, '');
  host.style.cssText = 'position:absolute; top:8px; right:8px; z-index:30';

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  frame.appendChild(host);
  createRoot(mountPoint).render(<PurchaseBadge model={model} />);
}

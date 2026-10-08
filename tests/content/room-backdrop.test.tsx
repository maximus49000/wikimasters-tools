// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { STYLE_IDS } from '../../src/core/library/library-types';
import { decorOf } from '../../src/core/library/styles';
import { RoomBackdrop } from '../../src/content/room-backdrop';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('fond de pièce', () => {
  it('dessine un mur, un sol et une plinthe pour chaque style, avec les motifs du décor', async () => {
    for (const style of STYLE_IDS) {
      const host = document.createElement('div');
      const root = createRoot(host);
      await act(async () => { root.render(<svg><RoomBackdrop style={style} width={720} height={510} wallH={340} /></svg>); });
      expect(host.querySelector('[data-backdrop="wall"]'), style).not.toBeNull();
      expect(host.querySelector('[data-backdrop="floor"]'), style).not.toBeNull();
      expect(host.querySelector('[data-backdrop="skirt"]'), style).not.toBeNull();
      const decor = decorOf(style);
      expect(host.querySelector(`[data-wall-pattern="${decor.wall}"]`), style).not.toBeNull();
      expect(host.querySelector(`[data-floor-pattern="${decor.floor}"]`), style).not.toBeNull();
      act(() => root.unmount());
    }
  });
});

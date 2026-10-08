import { describe, expect, it } from 'vitest';
import { createLaunchGate } from '../../src/content/library-launch';
import { createInitialState, setHome } from '../../src/core/library/library-book';

describe('createLaunchGate', () => {
  it("n'a rien à donner tant que l'état n'est pas chargé, et attend", () => {
    const gate = createLaunchGate();
    expect(gate.take(null)).toBeNull();
    expect(gate.take(setHome(createInitialState(), 'r1'))).toBe('r1');
  });

  it("ne donne la pièce d'accueil qu'une seule fois", () => {
    const gate = createLaunchGate();
    const state = setHome(createInitialState(), 'r1');
    expect(gate.take(state)).toBe('r1');
    expect(gate.take(state)).toBeNull();
  });

  it("sans pièce d'accueil, ne donne rien et ne redemande pas", () => {
    const gate = createLaunchGate();
    expect(gate.take(createInitialState())).toBeNull();
    expect(gate.take(setHome(createInitialState(), 'r1'))).toBeNull();
  });
});

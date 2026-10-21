import { describe, expect, it } from 'vitest';
import { createGameMachine } from '../src/game/machine';

describe('game machine', () => {
  it('accepts an allowed transition and updates the current phase', () => {
    const machine = createGameMachine();

    expect(machine.transition('tutorial')).toBe(true);
    expect(machine.getPhase()).toBe('tutorial');
  });

  it('rejects a disallowed transition without changing the current phase', () => {
    const machine = createGameMachine();

    expect(machine.transition('laporan')).toBe(false);
    expect(machine.getPhase()).toBe('menu');
  });
});

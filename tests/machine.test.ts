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

  it.each([
    ['menu', 'event'],
    ['tutorial', 'laporan'],
    ['ronde', 'menu'],
    ['event', 'ronde'],
    ['ringkasan', 'event'],
    ['laporan', 'menu'],
    ['tiket', 'laporan'],
  ] as const)('rejects %s -> %s without changing the phase', (initialPhase, nextPhase) => {
    const machine = createGameMachine(initialPhase);

    expect(machine.transition(nextPhase)).toBe(false);
    expect(machine.getPhase()).toBe(initialPhase);
  });
});

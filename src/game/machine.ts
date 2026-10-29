import type { Phase } from './types';

export type { Phase } from './types';

export const allowedTransitions: Record<Phase, readonly Phase[]> = {
  menu: ['tutorial', 'ronde'],
  tutorial: ['ronde'],
  ronde: ['event', 'ringkasan'],
  event: ['ringkasan'],
  ringkasan: ['ronde', 'laporan'],
  laporan: [],
};

export interface GameMachine {
  getPhase(): Phase;
  transition(next: Phase): boolean;
  restore(next: Phase): void;
}

export function createGameMachine(initialPhase: Phase = 'menu'): GameMachine {
  let phase = initialPhase;

  return {
    getPhase: () => phase,
    transition(next) {
      if (!allowedTransitions[phase].includes(next)) return false;
      phase = next;
      return true;
    },
    restore(next) {
      phase = next;
    },
  };
}

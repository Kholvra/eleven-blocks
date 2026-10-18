export type Phase =
  | 'menu'
  | 'tutorial'
  | 'ronde'
  | 'event'
  | 'ringkasan'
  | 'laporan'
  | 'tiket';

const allowedTransitions: Record<Phase, readonly Phase[]> = {
  menu: ['tutorial', 'ronde'],
  tutorial: ['ronde'],
  ronde: ['event', 'ringkasan'],
  event: ['ringkasan'],
  ringkasan: ['ronde', 'laporan'],
  laporan: ['tiket'],
  tiket: ['menu'],
};

export interface GameMachine {
  getPhase(): Phase;
  transition(next: Phase): boolean;
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
  };
}

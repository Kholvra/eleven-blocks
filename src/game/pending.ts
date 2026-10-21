import type { Efek, GameState } from './types';

export type PendingEffect = GameState['antrian'][number] & {
  syarat?: string;
};

export interface DelayedEffect {
  setelahRonde: number;
  efek: Efek;
  catatan?: string;
  syarat?: string;
}

export function scheduleEffects(
  queue: readonly PendingEffect[],
  source: string,
  currentRound: number,
  delayed: readonly DelayedEffect[],
): PendingEffect[] {
  return [
    ...queue,
    ...delayed.map(({ setelahRonde, efek, catatan, syarat }) => ({
      ronde: Math.min(10, currentRound + setelahRonde),
      sumber: source,
      efek: { ...efek },
      ...(catatan === undefined ? {} : { catatan }),
      ...(syarat === undefined ? {} : { syarat }),
    })),
  ];
}

export function takeDueEffects(
  queue: readonly PendingEffect[],
  currentRound: number,
): { due: PendingEffect[]; remaining: PendingEffect[] } {
  const due: PendingEffect[] = [];
  const remaining: PendingEffect[] = [];

  for (const effect of queue) {
    if (effect.ronde <= currentRound || (currentRound === 10 && effect.ronde > 10)) {
      due.push(effect);
    } else {
      remaining.push(effect);
    }
  }

  return { due, remaining };
}

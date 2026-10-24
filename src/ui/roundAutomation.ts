import type { GameState } from '../game/types';

export interface RoundAutomationClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export interface RoundAutomation {
  update(phase: GameState['fase'], round: number, sessionId?: string): void;
  setVisible(visible: boolean): void;
}

const RECAP_DURATION_MS = 2_000;

const browserClock: RoundAutomationClock = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

export function createRoundAutomation(
  advance: () => void,
  clock: RoundAutomationClock = browserClock,
): RoundAutomation {
  let recapKey: string | null = null;
  let remainingMs = 0;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let visible = true;
  let generation = 0;
  let completedKey: string | null = null;

  const clearTimer = (): void => {
    generation += 1;
    if (timer !== null) {
      clock.clearTimeout(timer);
      timer = null;
    }
  };

  const startTimer = (): void => {
    if (!visible || recapKey === null || timer !== null || completedKey === recapKey) return;
    const key = recapKey;
    const token = ++generation;
    startedAt = clock.now();
    timer = clock.setTimeout(() => {
      if (token !== generation || recapKey !== key || !visible || completedKey === key) return;
      timer = null;
      remainingMs = 0;
      completedKey = key;
      advance();
    }, remainingMs);
  };

  return {
    update(phase, round, sessionId = 'session') {
      const nextKey = phase === 'ringkasan' ? `${sessionId}:ringkasan:${round}` : null;
      if (nextKey === recapKey) return;
      clearTimer();
      recapKey = nextKey;
      remainingMs = nextKey === null ? 0 : RECAP_DURATION_MS;
      completedKey = null;
      startTimer();
    },
    setVisible(nextVisible) {
      if (visible === nextVisible) return;
      visible = nextVisible;
      if (!visible) {
        if (timer !== null) {
          remainingMs = Math.max(0, remainingMs - (clock.now() - startedAt));
          clearTimer();
        }
        return;
      }
      startTimer();
    },
  };
}

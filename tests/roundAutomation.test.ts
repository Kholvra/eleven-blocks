import { describe, expect, it } from 'vitest';
import { createRoundAutomation, type RoundAutomationClock } from '../src/ui/roundAutomation';
import type { GameState } from '../src/game/types';

type Task = { id: number; at: number; callback: () => void; cancelled: boolean };

class FakeClock implements RoundAutomationClock {
  time = 0;
  tasks: Task[] = [];
  private nextId = 0;

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    const id = ++this.nextId;
    this.tasks.push({ id, at: this.time + delay, callback, cancelled: false });
    return id as unknown as ReturnType<typeof setTimeout>;
  }

  clearTimeout(handle: ReturnType<typeof setTimeout>): void {
    const task = this.tasks.find(({ id }) => id === (handle as unknown as number));
    if (task) task.cancelled = true;
  }

  advance(milliseconds: number): void {
    const deadline = this.time + milliseconds;
    while (true) {
      const task = this.tasks
        .filter((item) => !item.cancelled && item.at <= deadline)
        .sort((a, b) => a.at - b.at)[0];
      if (!task) break;
      task.cancelled = true;
      this.time = task.at;
      task.callback();
    }
    this.time = deadline;
  }
}

const phase = (value: GameState['fase']): GameState['fase'] => value;

describe('recap round automation', () => {
  it('advances once after two seconds in a visible recap', () => {
    const clock = new FakeClock();
    let advances = 0;
    const automation = createRoundAutomation(() => { advances += 1; }, clock);

    automation.update(phase('ringkasan'), 1);
    clock.advance(1_999);
    expect(advances).toBe(0);
    clock.advance(1);
    expect(advances).toBe(1);
    automation.update(phase('ringkasan'), 1);
    clock.advance(2_000);
    expect(advances).toBe(1);
  });

  it('pauses visible time while the tab is hidden', () => {
    const clock = new FakeClock();
    let advances = 0;
    const automation = createRoundAutomation(() => { advances += 1; }, clock);
    automation.update(phase('ringkasan'), 2);

    clock.advance(1_000);
    automation.setVisible(false);
    clock.advance(30_000);
    expect(advances).toBe(0);
    automation.setVisible(true);
    clock.advance(999);
    expect(advances).toBe(0);
    clock.advance(1);
    expect(advances).toBe(1);
  });

  it('does not restart the timer on a rerender of the same recap', () => {
    const clock = new FakeClock();
    let advances = 0;
    const automation = createRoundAutomation(() => { advances += 1; }, clock);
    automation.update(phase('ringkasan'), 4);

    clock.advance(1_000);
    automation.update(phase('ringkasan'), 4);
    clock.advance(999);
    expect(advances).toBe(0);
    clock.advance(1);
    expect(advances).toBe(1);
  });

  it('invalidates callbacks when a different session restores the same recap round', () => {
    const clock = new FakeClock();
    let advances = 0;
    const automation = createRoundAutomation(() => { advances += 1; }, clock);

    automation.update(phase('ringkasan'), 1, 'seed-a');
    const staleCallback = clock.tasks[0]!.callback;
    automation.update(phase('ringkasan'), 1, 'seed-b');
    staleCallback();
    expect(advances).toBe(0);
    clock.advance(2_000);
    expect(advances).toBe(1);
  });

  it('ignores stale and duplicate timer callbacks after a phase change', () => {
    const clock = new FakeClock();
    let advances = 0;
    const automation = createRoundAutomation(() => { advances += 1; }, clock);

    automation.update(phase('ringkasan'), 5);
    const staleCallback = clock.tasks[0]!.callback;
    automation.update(phase('ronde'), 5);
    staleCallback();
    expect(advances).toBe(0);

    automation.update(phase('ringkasan'), 5);
    const currentCallback = clock.tasks[1]!.callback;
    currentCallback();
    currentCallback();
    expect(advances).toBe(1);
  });
});

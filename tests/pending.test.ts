import { describe, expect, it } from 'vitest';
import { scheduleEffects, takeDueEffects } from '../src/game/pending';
import type { Efek, GameState } from '../src/game/types';

type PendingEffect = GameState['antrian'][number];

describe('pending effects', () => {
  it('schedules delayed effects at their absolute target rounds with source and copied effects', () => {
    const existing: PendingEffect = { ronde: 4, sumber: 'old', efek: { udara: 1 } };
    const queue = [existing];
    const originalEffect: Efek = { akses: 2 };
    const delayed = [{ setelahRonde: 2, efek: originalEffect, catatan: 'new mobility', syarat: 'K01 ada' }];

    const result = scheduleEffects(queue, 'K03', 5, delayed);

    expect(result).toEqual([
      existing,
      { ronde: 7, sumber: 'K03', efek: { akses: 2 }, catatan: 'new mobility', syarat: 'K01 ada' },
    ]);
    expect(result).not.toBe(queue);
    expect(result[1].efek).not.toBe(originalEffect);
    expect(queue).toEqual([existing]);
  });

  it('caps scheduled target rounds at round 10', () => {
    expect(scheduleEffects([], 'ACT01', 9, [
      { setelahRonde: 1, efek: { warga: 1 } },
      { setelahRonde: 5, efek: { hijau: 2 }, catatan: 'late' },
    ])).toEqual([
      { ronde: 10, sumber: 'ACT01', efek: { warga: 1 } },
      { ronde: 10, sumber: 'ACT01', efek: { hijau: 2 }, catatan: 'late' },
    ]);
  });

  it('takes due entries in FIFO order and retains future entries in place', () => {
    const queue: PendingEffect[] = [
      { ronde: 3, sumber: 'A', efek: { udara: 1 } },
      { ronde: 8, sumber: 'future', efek: { akses: 1 } },
      { ronde: 5, sumber: 'B', efek: { hijau: 1 } },
      { ronde: 5, sumber: 'C', efek: { warga: 1 } },
    ];

    const result = takeDueEffects(queue, 5);

    expect(result.due).toEqual([queue[0], queue[2], queue[3]]);
    expect(result.remaining).toEqual([queue[1]]);
    expect(queue).toHaveLength(4);
  });

  it('retains entries that are not due yet without mutation', () => {
    const queue: PendingEffect[] = [
      { ronde: 6, sumber: 'A', efek: { udara: 1 } },
      { ronde: 8, sumber: 'B', efek: { akses: 1 } },
    ];

    const result = takeDueEffects(queue, 5);

    expect(result.due).toEqual([]);
    expect(result.remaining).toEqual(queue);
    expect(result.remaining).not.toBe(queue);
    expect(queue).toHaveLength(2);
  });

  it('resolves targets beyond round 10 only when processing round 10', () => {
    const queue: PendingEffect[] = [{ ronde: 12, sumber: 'late', efek: { hijau: -1 } }];

    expect(takeDueEffects(queue, 9)).toEqual({ due: [], remaining: queue });
    expect(takeDueEffects(queue, 10)).toEqual({ due: [queue[0]], remaining: [] });
    expect(queue).toHaveLength(1);
  });

  it('does not mutate the input queue or share scheduled effect objects', () => {
    const effect: Efek = { udara: 1 };
    const delayed = [{ setelahRonde: 1, efek: effect }];
    const queue: PendingEffect[] = [{ ronde: 2, sumber: 'existing', efek: { warga: 1 } }];
    const scheduled = scheduleEffects(queue, 'K01', 1, delayed);
    scheduled[1].efek.udara = 5;

    const partitioned = takeDueEffects(queue, 2);

    expect(effect.udara).toBe(1);
    expect(queue).toEqual([{ ronde: 2, sumber: 'existing', efek: { warga: 1 } }]);
    expect(partitioned.due).toEqual(queue);
    expect(partitioned.due).not.toBe(queue);
  });
});

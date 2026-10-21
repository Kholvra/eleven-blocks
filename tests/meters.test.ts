import { describe, expect, it } from 'vitest';
import { applyMeterEffect } from '../src/game/meters';
import type { Efek, KunciMeter } from '../src/game/types';

const meter: Record<KunciMeter, number> = {
  udara: 50,
  akses: 50,
  hijau: 50,
  warga: 50,
};

describe('applyMeterEffect', () => {
  it('clamps positive and negative effects to the meter boundaries', () => {
    const result = applyMeterEffect(
      { udara: 99, akses: 1, hijau: 50, warga: 50 },
      { udara: 3, akses: -3 },
    );

    expect(result.meter).toEqual({ udara: 100, akses: 0, hijau: 50, warga: 50 });
    expect(result.delta).toEqual({ udara: 1, akses: -1 });
  });

  it('updates effect keys independently and preserves unaffected values', () => {
    const result = applyMeterEffect(meter, { hijau: 12 });

    expect(result.meter).toEqual({ udara: 50, akses: 50, hijau: 62, warga: 50 });
    expect(result.delta).toEqual({ hijau: 12 });
  });

  it('omits a meter whose effect cannot change its boundary value', () => {
    const result = applyMeterEffect(
      { udara: 100, akses: 0, hijau: 50, warga: 50 },
      { udara: 5, akses: -5 },
    );

    expect(result.delta).toEqual({});
  });

  it('does not mutate the input meter', () => {
    const input = { ...meter };

    const result = applyMeterEffect(input, { udara: 10, warga: -10 });

    expect(input).toEqual(meter);
    expect(result.meter).not.toBe(input);
  });

  it('reports only changed keys with their actual post-clamp differences', () => {
    const effect: Efek = { udara: 3, akses: -3, hijau: 0 };
    const result = applyMeterEffect(
      { udara: 99, akses: 1, hijau: 50, warga: 50 },
      effect,
    );

    expect(result.delta).toEqual({ udara: 1, akses: -1 });
    expect(Object.keys(result.delta)).toEqual(['udara', 'akses']);
  });
});

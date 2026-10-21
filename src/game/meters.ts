import type { Efek, KunciMeter } from './types';

const meterKeys: readonly KunciMeter[] = ['udara', 'akses', 'hijau', 'warga'];

export function applyMeterEffect(
  meter: Record<KunciMeter, number>,
  effect: Efek,
): { meter: Record<KunciMeter, number>; delta: Efek } {
  const nextMeter = { ...meter };
  const delta: Efek = {};

  for (const key of meterKeys) {
    const nextValue = Math.max(0, Math.min(100, meter[key] + (effect[key] ?? 0)));
    const appliedDelta = nextValue - meter[key];

    nextMeter[key] = nextValue;
    if (appliedDelta !== 0) {
      delta[key] = appliedDelta;
    }
  }

  return { meter: nextMeter, delta };
}

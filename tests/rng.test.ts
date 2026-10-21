import { describe, expect, it } from 'vitest';
import { baruGame } from '../src/game/state';
import { acak, acakUrutan, hashSeed } from '../src/game/rng';

describe('game random generator', () => {
  it('hashes a seed to its stable uint32 value', () => {
    expect(hashSeed('deterministic-seed')).toBe(1031065050);
  });

  it('advances cloned RNG state identically while keeping the original separate', () => {
    const original = baruGame('deterministic-seed');
    const clone = structuredClone(original);
    const initialRngS = original.rngS;

    const originalSequence = Array.from({ length: 8 }, () => acak(original));
    const clonedSequence = Array.from({ length: 8 }, () => acak(clone));

    expect(clonedSequence).toEqual(originalSequence);
    expect(clone.rngS).toBe(original.rngS);
    expect(original.rngS).not.toBe(initialRngS);
    expect(original.rngS).toBeGreaterThanOrEqual(0);
    expect(original.rngS).toBeLessThanOrEqual(0xffffffff);
  });

  it('reproduces RNG progression across independent sessions with the same seed', () => {
    const first = baruGame('same-session-seed');
    const second = baruGame('same-session-seed');
    const firstSequence = Array.from({ length: 10 }, () => acak(first));
    const secondSequence = Array.from({ length: 10 }, () => acak(second));

    expect(secondSequence).toEqual(firstSequence);
    expect(second.rngS).toBe(first.rngS);
  });

  it('shuffles card identifiers deterministically without changing the source order', () => {
    const cards = [1, 2, 3, 4, 5, 6];
    const firstState = baruGame('card-order');
    const secondState = baruGame('card-order');

    const firstOrder = acakUrutan(firstState, cards);
    const secondOrder = acakUrutan(secondState, cards);

    expect(firstOrder).toEqual(secondOrder);
    expect(firstOrder).not.toEqual(cards);
    expect([...firstOrder].sort((left, right) => left - right)).toEqual(cards);
    expect(cards).toEqual([1, 2, 3, 4, 5, 6]);
    expect(firstState.rngS).toBe(secondState.rngS);
  });

});

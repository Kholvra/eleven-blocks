import type { GameState } from './types';

export function hashSeed(seed: string): number {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
}

export function acak(state: GameState): number {
  if (!Number.isInteger(state.rngS) || state.rngS < 0 || state.rngS > 0xffffffff) {
    throw new RangeError('rngS harus berupa integer uint32.');
  }

  let value = state.rngS | 0;
  value = (value + 0x6d2b79f5) | 0;
  let result = Math.imul(value ^ (value >>> 15), 1 | value);
  result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
  state.rngS = value >>> 0;
  return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
}

export function acakUrutan<T>(state: GameState, items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(acak(state) * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

export function seedBaru(): string {
  return Date.now().toString(36).slice(-6);
}

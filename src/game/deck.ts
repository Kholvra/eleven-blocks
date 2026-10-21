import balance from '../data/balance.json';
import { acakUrutan } from './rng';
import type { GameState } from './types';

export function createDeck(state: GameState): void {
  state.deck = acakUrutan(state, balance.ekonomi.kebijakan.map((_, index) => index));
}

export function drawHand(state: GameState): void {
  if (state.tangan.length > 0) throw new RangeError('Tangan ronde sebelumnya belum dibuang.');
  if (state.ronde < 1 || state.ronde > 10) throw new RangeError('Ronde harus berada pada rentang 1 sampai 10.');
  const size = state.ronde <= 3 ? 4 : 3;
  const reserved = state.kartuCadanganACT04;
  state.tangan = reserved === null ? [] : [reserved];
  state.kartuCadanganACT04 = null;
  drawIntoHand(state, size - state.tangan.length);
}

export function finishHand(state: GameState): void {
  state.discard.push(...state.tangan);
  state.tangan = [];
}

export function exchangePolicy(state: GameState, kartuIdx: number): boolean {
  const replacement = drawOne(state);
  if (replacement === null) return false;
  state.tangan.splice(state.tangan.indexOf(kartuIdx), 1);
  state.discard.push(kartuIdx);
  state.kartuCadanganACT04 = replacement;
  return true;
}

export function canDrawPolicy(state: GameState): boolean {
  return state.deck.length > 0 || state.discard.length > 0;
}

function drawIntoHand(state: GameState, count: number): void {
  for (let drawn = 0; drawn < count; drawn += 1) {
    const card = drawOne(state);
    if (card === null) throw new RangeError('Tidak ada kartu kebijakan yang bisa ditarik.');
    state.tangan.push(card);
  }
}

function drawOne(state: GameState): number | null {
  if (state.deck.length === 0 && state.discard.length > 0) {
    state.deck = acakUrutan(state, state.discard);
    state.discard = [];
  }
  return state.deck.pop() ?? null;
}

import { describe, expect, it } from 'vitest';
import { createGameEngine } from '../src/game/engine';
import type { GameAction } from '../src/game/engine';
import { BUILDABLE_CELLS } from '../src/game/board';
import { baruGame } from '../src/game/state';
import type { GameState, Phase } from '../src/game/types';

interface EngineActions {
  dispatch(action: GameAction): boolean;
  getState(): GameState;
}

function dispatch(engine: EngineActions, fase: Phase) {
  engine.dispatch({ type: 'TRANSISI_FASE', fase });
}

function enterRound(engine: EngineActions) {
  dispatch(engine, 'tutorial');
  dispatch(engine, 'ronde');
}

function finishRoundStages(engine: EngineActions) {
  const stages = ['berita', 'tangan', 'resolusi', 'reaksi', 'transisi'] as const;
  expect(engine.getState().fase).toBe('ronde');
  expect(engine.getState().tahapRonde).toBe(stages[0]);

  for (const stage of stages.slice(1)) {
    engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
    expect(engine.getState().tahapRonde).toBe(stage);
  }
}

function finishRound(engine: EngineActions) {
  finishRoundStages(engine);
  engine.dispatch({ type: 'SELESAI_RONDE' });
}

describe('game engine', () => {
  it('starts in menu and follows the five-stage first-round flow', () => {
    const engine = createGameEngine(baruGame('phase-flow'));

    expect(engine.getState().fase).toBe('menu');
    enterRound(engine);
    finishRoundStages(engine);

    expect(engine.getState().tahapRonde).toBe('transisi');
    engine.dispatch({ type: 'SELESAI_RONDE' });
    expect(engine.getState().ronde).toBe(2);
    expect(engine.getState().fase).toBe('ronde');
    expect(engine.getState().tahapRonde).toBe('berita');
  });

  it('preserves the state when an action is invalid', () => {
    const engine = createGameEngine(baruGame('invalid-actions'));
    const before = structuredClone(engine.getState());

    engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
    expect(engine.getState()).toEqual(before);

    engine.dispatch({ type: 'SELESAI_RONDE' });
    expect(engine.getState()).toEqual(before);
  });

  it('adds ten income only after completing rounds 1 through 9', () => {
    const engine = createGameEngine(baruGame('nine-rounds'));
    enterRound(engine);

    for (let round = 1; round <= 9; round += 1) {
      const beforeIncome = engine.getState().anggaran;
      finishRound(engine);

      expect(engine.getState().anggaran).toBe(beforeIncome + 10);
      expect(engine.getState().ronde).toBe(round + 1);
      expect(engine.getState().fase).toBe('ronde');
      expect(engine.getState().tahapRonde).toBe('berita');
    }
  });

  it('completes round 10 to ringkasan without income or round 11', () => {
    const state = baruGame('tenth-round');
    state.ronde = 10;
    const engine = createGameEngine(state);
    enterRound(engine);
    const beforeIncome = engine.getState().anggaran;

    finishRound(engine);

    expect(engine.getState().anggaran).toBe(beforeIncome);
    expect(engine.getState().ronde).toBe(10);
    expect(engine.getState().fase).toBe('ringkasan');

    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'tiket' })).toBe(false);
    expect(engine.getState().fase).toBe('ringkasan');

    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'ronde' })).toBe(false);
    expect(engine.getState().fase).toBe('ringkasan');

    dispatch(engine, 'laporan');
    expect(engine.getState().fase).toBe('laporan');

    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'tiket' })).toBe(true);
    expect(engine.getState().fase).toBe('tiket');
  });

  it('enforces guards between ringkasan, event, and round progression', () => {
    const state = baruGame('mid-rounds');
    state.fase = 'ronde';
    state.ronde = 3;
    const engine = createGameEngine(state);

    // Dapat berpindah ke event di ronde 3
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'event' })).toBe(true);
    expect(engine.getState().fase).toBe('event');

    // Dari event dapat lanjut ke ringkasan
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'ringkasan' })).toBe(true);
    expect(engine.getState().fase).toBe('ringkasan');

    // Di ronde 3, tidak boleh langsung lompat ke laporan
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'laporan' })).toBe(false);
    expect(engine.getState().fase).toBe('ringkasan');

    // Di ronde 3, dapat kembali ke ronde berikutnya
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'ronde' })).toBe(true);
    expect(engine.getState().fase).toBe('ronde');
    expect(engine.getState().tahapRonde).toBe('berita');
  });
});

function placementEngine(configure?: (state: GameState) => void) {
  const state = baruGame('policy-placement');
  state.fase = 'ronde';
  state.tahapRonde = 'tangan';
  state.tangan = [4, 5];
  configure?.(state);
  return createGameEngine(state);
}

function expectRejectedWithoutMutation(engine: EngineActions, kartuIdx = 4, selIdx = 17) {
  const previousState = engine.getState();
  const previousSnapshot = structuredClone(previousState);

  expect(engine.dispatch({ type: 'TEMPATKAN_KEBIJAKAN', kartuIdx, selIdx })).toBe(false);
  expect(engine.getState()).toBe(previousState);
  expect(engine.getState()).toEqual(previousSnapshot);
}



const rejectedPlacementCases: Array<[string, (state: GameState) => void]> = [
  ['wrong phase', (state) => { state.fase = 'menu'; }],
  ['wrong round stage', (state) => { state.tahapRonde = 'berita'; }],
  ['card absent from hand', (state) => { state.tangan = [5]; }],
  ['card already played this round', (state) => { state.kartuDimainkanRondeIni = 'aksi'; }],
  ['card already placed', (state) => { state.milik = [4]; }],
  ['occupied cell', (state) => { state.papan.ubin[17] = 9; }],
];
describe('policy placement', () => {
  it('rejects a card already occupying another cell when ownership data omits it', () => {
    const engine = placementEngine((state) => {
      state.papan.ubin[18] = 4;
      state.milik = [];
    });

    expectRejectedWithoutMutation(engine);
  });
});

const rejectedCellIndexes: Array<[string, number]> = [
  ['non-buildable cell', 16],
  ['negative cell index', -1],
  ['cell outside the 8×8 board', 64],
  ['cell outside the tile array', 256],
  ['non-integer cell index', 17.5],
];

describe('policy placement', () => {
  it('places a policy into one empty buildable cell without changing costs or meters', () => {
    const engine = placementEngine();
    const previousState = engine.getState();
    const expectedState = structuredClone(previousState);
    expectedState.papan.ubin[17] = 4;
    expectedState.tangan = [5];
    expectedState.milik = [4];
    expectedState.kartuDimainkanRondeIni = 'kebijakan';

    expect(engine.dispatch({ type: 'TEMPATKAN_KEBIJAKAN', kartuIdx: 4, selIdx: 17 })).toBe(true);

    const nextState = engine.getState();
    expect(nextState).not.toBe(previousState);
    expect(nextState.papan.ubin).not.toBe(previousState.papan.ubin);
    expect(previousState.papan.ubin[17]).toBeNull();
    expect(nextState).toEqual(expectedState);
  });

  it.each(rejectedPlacementCases)('rejects placement for %s without mutation', (_scenario, configure) => {
    expectRejectedWithoutMutation(placementEngine(configure));
  });

  it.each(rejectedCellIndexes)('rejects a %s without mutation', (_scenario, selIdx) => {
    expectRejectedWithoutMutation(placementEngine(), 4, selIdx);
  });

  it('rejects a non-integer card index without mutation', () => {
    expectRejectedWithoutMutation(placementEngine(), 4.5, 17);
  });

  it('rejects placement when every buildable cell is occupied without mutation', () => {
    const engine = placementEngine((state) => {
      state.milik = BUILDABLE_CELLS.map((cell) => cell + 100);
      for (const cell of BUILDABLE_CELLS) {
        state.papan.ubin[cell] = cell + 100;
      }
    });

    expectRejectedWithoutMutation(engine);
  });
});


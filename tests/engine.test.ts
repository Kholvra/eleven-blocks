import balance from '../src/data/balance.json';

import { describe, expect, it } from 'vitest';
import { statusAksi, statusKartu } from '../src/game/cards';
import { createGameEngine } from '../src/game/engine';
import type { GameAction } from '../src/game/engine';
import { BUILDABLE_CELLS } from '../src/game/board';
import { baruGame } from '../src/game/state';
import type { GameState, Phase } from '../src/game/types';

interface EngineActions {
  dispatch(action: GameAction): boolean;
  getState(): GameState;
}

function readyForPlay(overrides: Partial<GameState> = {}) {
  const state = { ...baruGame('ready-for-play'), fase: 'ronde' as const, tahapRonde: 'tangan' as const, ...overrides };
  return createGameEngine(state);
}

function enterHand(engine: EngineActions) {
  enterRound(engine);
  engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
  expect(engine.getState().tahapRonde).toBe('tangan');
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
    const playable = readyForPlay({ tangan: [0] });
    const beforePlay = structuredClone(playable.getState());
    playable.dispatch({ type: 'MAIN_KARTU', kartuIdx: 1 });
    expect(playable.getState()).toEqual(beforePlay);

    const beforeUnknownAction = structuredClone(playable.getState());
    playable.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT99' });
    expect(playable.getState()).toEqual(beforeUnknownAction);
  });

  it('adds ten income only after completing rounds 1 through 9', () => {
    const engine = createGameEngine(baruGame('nine-rounds'));
    enterRound(engine);

    for (let round = 1; round <= 9; round += 1) {
      const beforeIncome = engine.getState().anggaran;
      finishRound(engine);

      expect(engine.getState().anggaran).toBe(beforeIncome + balance.ekonomi.pendapatan_per_ronde);
      expect(engine.getState().ronde).toBe(round + 1);
      expect(engine.getState().fase).toBe('ronde');
      expect(engine.getState().tahapRonde).toBe('berita');
    }
  });
  it('accounts for all 19 policies through ten rounds of play', () => {
    const state = baruGame('policy-accounting-ten-rounds');
    state.anggaran = 10_000;
    const engine = createGameEngine(state);
    enterRound(engine);

    for (let round = 1; round <= 10; round += 1) {
      engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
      const hand = engine.getState().tangan;
      expect(hand.length).toBeGreaterThan(0);
      const policy = hand[0];
      expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: policy })).toBe(true);
      for (const stage of ['resolusi', 'reaksi', 'transisi'] as const) {
        engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
        expect(engine.getState().tahapRonde).toBe(stage);
      }
      engine.dispatch({ type: 'SELESAI_RONDE' });

    }

    const final = engine.getState();
    const policies = [
      ...final.deck,
      ...final.tangan,
      ...final.discard,
      ...final.milik,
      ...(final.kartuCadanganACT04 === null ? [] : [final.kartuCadanganACT04]),
    ];
    expect(policies).toHaveLength(19);
    expect(new Set(policies)).toEqual(new Set(Array.from({ length: 19 }, (_, index) => index)));
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
  it('starts with all 19 policy indices shuffled deterministically', () => {
    const first = createGameEngine(baruGame('deck-seed'));
    const repeated = createGameEngine(baruGame('deck-seed'));
    const other = createGameEngine(baruGame('different-deck-seed'));
    const deck = first.getState().deck;

    expect(deck).toHaveLength(19);
    expect([...deck].sort((a, b) => a - b)).toEqual(Array.from({ length: 19 }, (_, index) => index));
    expect(repeated.getState().deck).toEqual(deck);
    expect(other.getState().deck).not.toEqual(deck);
    enterHand(first);
    enterHand(repeated);
    expect(repeated.getState().tangan).toEqual(first.getState().tangan);
  });

  it('draws four policies in rounds 1–3 and three in rounds 4–10 on entry to tangan', () => {
    for (let ronde = 1; ronde <= 10; ronde += 1) {
      const state = baruGame(`hand-size-${ronde}`);
      state.ronde = ronde;
      const engine = createGameEngine(state);

      enterHand(engine);
      expect(engine.getState().tangan).toHaveLength(ronde <= 3 ? 4 : 3);
      expect(engine.getState().deck).toHaveLength(19 - (ronde <= 3 ? 4 : 3));
    }
  });

  it('reshuffles discard with the saved RNG when a draw empties', () => {
    const state = baruGame('discard-shuffle');
    state.fase = 'ronde';
    state.deck = [];
    state.discard = [0, 1, 2, 3, 4];
    const repeatedState = structuredClone(state);
    const first = createGameEngine(state);
    const repeated = createGameEngine(repeatedState);

    first.dispatch({ type: 'PROSES_TAHAP_RONDE' });
    repeated.dispatch({ type: 'PROSES_TAHAP_RONDE' });

    expect(first.getState().tangan).toHaveLength(4);
    expect(first.getState().tangan).toEqual(repeated.getState().tangan);
    expect(first.getState().discard).toEqual([]);
    expect(first.getState().deck).toHaveLength(1);
  });

  it('discards leftover hand policies before the next round is drawn', () => {
    const state = baruGame('leftover-discard');
    state.fase = 'ronde';
    state.tahapRonde = 'transisi';
    state.deck = [4, 5, 6, 7, 8, 9, 10, 11];
    state.tangan = [0, 1];
    const engine = createGameEngine(state);

    engine.dispatch({ type: 'SELESAI_RONDE' });
    expect(engine.getState().discard).toEqual([0, 1]);
    expect(engine.getState().tangan).toEqual([]);
    engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });

    expect(engine.getState().tangan).toHaveLength(4);
    expect(engine.getState().tangan).not.toContain(0);
    expect(engine.getState().tangan).not.toContain(1);
  });

  it('charges K01 exactly once and preserves all state when unaffordable', () => {
    const playable = readyForPlay({ tangan: [0], anggaran: 100 });
    const beforeBudget = playable.getState().anggaran;
    expect(statusKartu(playable.getState(), 0)).toEqual({ available: true, reason: null });
    expect(playable.dispatch({ type: 'MAIN_KARTU', kartuIdx: 0 })).toBe(true);
    expect(playable.getState().anggaran).toBe(beforeBudget - 14);
    expect(playable.getState().kartuDimainkanRondeIni).toBe('K01');
    expect(playable.getState().milik).toContain(0);
    expect(statusKartu(playable.getState(), 0)).toEqual({ available: false, reason: 'Kartu tidak ada di tangan.' });

    const afterPlay = structuredClone(playable.getState());
    playable.dispatch({ type: 'PROSES_TAHAP_RONDE' });
    expect(playable.getState().anggaran).toBe(afterPlay.anggaran);

    const unaffordable = readyForPlay({ tangan: [0], anggaran: 6 });
    expect(statusKartu(unaffordable.getState(), 0)).toEqual({ available: false, reason: 'Dana kurang.' });
    const before = structuredClone(unaffordable.getState());
    expect(unaffordable.dispatch({ type: 'MAIN_KARTU', kartuIdx: 0 })).toBe(false);
    expect(unaffordable.getState()).toEqual(before);
  });
  it('places policies on a selected empty buildable cell and leaves cells unchanged for actions', () => {
    const policy = readyForPlay({ tangan: [0], anggaran: 100 });
    const beforeBudget = policy.getState().anggaran;
    expect(policy.dispatch({ type: 'MAIN_KARTU', kartuIdx: 0, selIdx: 17 })).toBe(true);
    expect(policy.getState().tangan).not.toContain(0);
    expect(policy.getState().papan.ubin[17]).toBe(0);
    expect(policy.getState().milik).toContain(0);
    expect(policy.getState().anggaran).toBe(beforeBudget - 14);

    const invalidCell = readyForPlay({ tangan: [0], papan: { ...baruGame('invalid-cell').papan, selBuildable: 24 } });
    const beforeInvalidPlay = structuredClone(invalidCell.getState());
    expect(invalidCell.dispatch({ type: 'MAIN_KARTU', kartuIdx: 0, selIdx: 16 })).toBe(false);
    expect(invalidCell.getState()).toEqual(beforeInvalidPlay);

    const action = readyForPlay();
    expect(action.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT01' })).toBe(true);
    expect(action.getState().papan).toEqual(baruGame('empty-board').papan);
  });

  it('allows ACT01 at exact cost, once per session, and only one card per round', () => {
    const engine = readyForPlay({ anggaran: 3 });

    expect(engine.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT01' })).toBe(true);
    expect(engine.getState().anggaran).toBe(0);
    const afterAction = structuredClone(engine.getState());
    expect(engine.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT01' })).toBe(false);
    expect(engine.getState()).toEqual(afterAction);

    const policyAfterAction = readyForPlay({ tangan: [0], anggaran: 100 });
    policyAfterAction.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT01' });
    const beforeSecondCard = structuredClone(policyAfterAction.getState());
    expect(policyAfterAction.dispatch({ type: 'MAIN_KARTU', kartuIdx: 0 })).toBe(false);
    expect(policyAfterAction.getState()).toEqual(beforeSecondCard);

    const actionAfterPolicy = readyForPlay({ tangan: [0], anggaran: 100 });
    actionAfterPolicy.dispatch({ type: 'MAIN_KARTU', kartuIdx: 0 });
    const beforeAction = structuredClone(actionAfterPolicy.getState());
    expect(actionAfterPolicy.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT01' })).toBe(false);
    expect(actionAfterPolicy.getState()).toEqual(beforeAction);

    const acrossRounds = createGameEngine({ ...baruGame('act01-session-limit'), fase: 'ronde', tahapRonde: 'berita', anggaran: 3 });
    acrossRounds.dispatch({ type: 'PROSES_TAHAP_RONDE' });
    expect(acrossRounds.getState().tahapRonde).toBe('tangan');
    expect(acrossRounds.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT01' })).toBe(true);
    for (const stage of ['resolusi', 'reaksi', 'transisi'] as const) {
      expect(acrossRounds.dispatch({ type: 'PROSES_TAHAP_RONDE' })).toBe(true);
      expect(acrossRounds.getState().tahapRonde).toBe(stage);
    }
    acrossRounds.dispatch({ type: 'SELESAI_RONDE' });
    expect(acrossRounds.getState().ronde).toBe(2);
    expect(acrossRounds.dispatch({ type: 'PROSES_TAHAP_RONDE' })).toBe(true);
    expect(acrossRounds.getState().tahapRonde).toBe('tangan');
    expect(acrossRounds.getState().anggaran).toBeGreaterThanOrEqual(3);
    const beforeSecondRoundAttempt = structuredClone(acrossRounds.getState());
    expect(acrossRounds.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT01' })).toBe(false);
    expect(acrossRounds.getState()).toEqual(beforeSecondRoundAttempt);
  });

  it('ACT04 exchanges a selected policy and reserves it as a normal next-round draw', () => {
    const state = baruGame('act04-reservation');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.tangan = [0, 1, 2, 3];
    state.deck = [4, 5, 6, 7, 8, 9];
    const engine = createGameEngine(state);

    expect(engine.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT04', kartuIdx: 1 })).toBe(true);
    expect(engine.getState().tangan).toEqual([0, 2, 3]);
    expect(engine.getState().discard).toEqual([1]);
    expect(engine.getState().kartuCadanganACT04).toBe(9);
    expect(engine.getState().kartuDimainkanRondeIni).toBe('ACT04');

    for (let i = 0; i < 4; i += 1) engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
    expect(engine.getState().tahapRonde).toBe('transisi');
    engine.dispatch({ type: 'SELESAI_RONDE' });
    engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
    expect(engine.getState().tangan).toHaveLength(4);
    expect(engine.getState().tangan).toContain(9);
    expect(engine.getState().deck).toHaveLength(2);
    expect(engine.getState().kartuCadanganACT04).toBe(null);
  });

  it('rejects ACT04 in round 10 and does not alter state', () => {
    const engine = readyForPlay({ ronde: 10, tangan: [0, 1, 2] });
    const before = structuredClone(engine.getState());

    expect(engine.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT04', kartuIdx: 0 })).toBe(false);
    expect(engine.getState()).toEqual(before);
  });
function placementEngine(configure?: (state: GameState) => void, fixedNow = 1000) {
  const state = baruGame('policy-placement');
  state.fase = 'ronde';
  state.tahapRonde = 'tangan';
  state.tangan = [4, 5];
  state.waktuSimpan = fixedNow;
  configure?.(state);
  return createGameEngine(state, undefined, () => fixedNow);
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

const rejectedCellIndexes: Array<[string, number]> = [
  ['non-buildable cell', 16],
  ['negative cell index', -1],
  ['cell outside the 8×8 board', 64],
  ['cell outside the tile array', 256],
  ['non-integer cell index', 17.5],
];
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

  it('timestamps and emits each successful state change without changing rejected actions', () => {
    const state = baruGame('save-timestamps');
    const changes: GameState[] = [];
    let now = 42;
    const engine = createGameEngine(state, (nextState) => changes.push(structuredClone(nextState)), () => now);

    now = 43;
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'tutorial' })).toBe(true);
    expect(engine.getState().waktuSimpan).toBe(43);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual(engine.getState());

    now = 44;
    expect(engine.dispatch({ type: 'PROSES_TAHAP_RONDE' })).toBe(false);
    expect(engine.getState().waktuSimpan).toBe(43);
    expect(changes).toHaveLength(1);
  });

  it('keeps audio preference changes in the session state', () => {
    const initialState = baruGame('audio-preference');
    const engine = createGameEngine(initialState, undefined, () => 99);

    expect(engine.dispatch({ type: 'SETELAN_AUDIO', aktif: false })).toBe(true);
    expect(engine.getState().setelan.audio).toBe(false);
    expect(engine.getState().waktuSimpan).toBe(99);
    expect(initialState.setelan.audio).toBe(true);
  });
});


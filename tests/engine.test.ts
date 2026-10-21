import { describe, expect, it } from 'vitest';
import { createGameEngine } from '../src/game/engine';
import { baruGame } from '../src/game/state';
import type { GameState, Phase } from '../src/game/types';

interface EngineActions {
  dispatch(
    action:
      | { type: 'TRANSISI_FASE'; fase: Phase }
      | { type: 'PROSES_TAHAP_RONDE' }
      | { type: 'SELESAI_RONDE' },
  ): void;
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


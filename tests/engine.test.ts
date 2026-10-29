import balance from '../src/data/balance.json';
import events from '../src/data/events.json';

import { describe, expect, it } from 'vitest';
import { statusAksi, statusKartu } from '../src/game/cards';
import { createGameEngine } from '../src/game/engine';
import type { GameAction } from '../src/game/engine';
import { baruGame } from '../src/game/state';
import type { GameState, Phase } from '../src/game/types';
import { hitungSkorAkhir } from '../src/game/report';

interface EngineActions {
  dispatch(action: GameAction): boolean;
  getState(): GameState;
}

function readyForPlay(overrides: Partial<GameState> = {}) {
  const state = { ...baruGame('ready-for-play'), fase: 'ronde' as const, tahapRonde: 'tangan' as const, ...overrides };
  return createGameEngine(state);
}

function enterHand(engine: EngineActions) {
  if (engine.getState().fase === 'menu') enterRound(engine);
  const state = engine.getState();
  if (state.fase === 'event' && state.eventAktif !== null) {
    const event = events.event.find((item) => item.id === state.eventAktif?.id);
    const choice = event?.pilihan.find((item) => item.biaya <= state.anggaran);
    if (event && choice) expect(engine.dispatch({ type: 'PILIH_EVENT', eventId: event.id, pilihanId: choice.id })).toBe(true);
  }
  expect(engine.getState().fase).toBe('ronde');
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
  enterHand(engine);
  expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
  expect(engine.getState().fase).toBe('ringkasan');
  expect(engine.getState().tahapRonde).toBe('transisi');
}

function finishRound(engine: EngineActions) {
  finishRoundStages(engine);
  engine.dispatch({ type: 'SELESAI_RONDE' });
}

describe('game engine', () => {
  it('starts each round with a hand and resolves skipping directly into recap', () => {
    const engine = createGameEngine(baruGame('phase-flow'));

    expect(engine.getState().fase).toBe('menu');
    enterRound(engine);
    expect(engine.getState()).toMatchObject({ fase: 'ronde', tahapRonde: 'tangan' });
    expect(engine.getState().tangan).toHaveLength(4);

    finishRoundStages(engine);
    expect(engine.getState()).toMatchObject({ fase: 'ringkasan', tahapRonde: 'transisi', ronde: 1 });
    expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
    expect(engine.getState()).toMatchObject({ fase: 'ronde', tahapRonde: 'tangan', ronde: 2 });
  });

  it('preserves the state when an action is invalid', () => {
    const engine = createGameEngine(baruGame('invalid-actions'));
    const before = structuredClone(engine.getState());

    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(false);
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
      enterHand(engine);
      const beforeIncome = engine.getState().anggaran;
      finishRound(engine);

      expect(engine.getState().anggaran).toBe(beforeIncome + balance.ekonomi.pendapatan_per_ronde);
      expect(engine.getState().ronde).toBe(round + 1);
      const nextEvent = events.event.find((event) => event.ronde === round + 1);
      expect(engine.getState().fase).toBe(nextEvent?.jenis === 'interaktif' ? 'event' : 'ronde');
      expect(engine.getState().tahapRonde).toBe(nextEvent?.jenis === 'interaktif' ? 'berita' : 'tangan');
    }
  });
  it('accounts for all 19 policies through ten rounds of play', () => {
    const state = baruGame('policy-accounting-ten-rounds');
    state.anggaran = 10_000;
    const engine = createGameEngine(state);
    enterRound(engine);

    for (let round = 1; round <= 10; round += 1) {
      enterHand(engine);
      const hand = engine.getState().tangan;
      expect(hand.length).toBeGreaterThan(0);
      const policy = hand[0]!;
      expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: policy })).toBe(true);
      expect(engine.getState()).toMatchObject({ fase: 'ringkasan', tahapRonde: 'transisi' });
      expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
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


  it('completes round 10 directly to laporan without income or round 11', () => {
    const state = baruGame('tenth-round');
    state.ronde = 10;
    const engine = createGameEngine(state);
    enterRound(engine);
    const beforeIncome = engine.getState().anggaran;

    finishRound(engine);

    expect(engine.getState().anggaran).toBe(beforeIncome);
    expect(engine.getState().ronde).toBe(10);
    expect(engine.getState().fase).toBe('laporan');


    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'ronde' })).toBe(false);
    expect(engine.getState().fase).toBe('laporan');
  });




  it('only enters event and recap through their owning decisions', () => {
    const state = baruGame('scheduled-event-guards');
    state.fase = 'ronde';
    state.ronde = 3;
    const engine = createGameEngine(state);

    expect(engine.getState().fase).toBe('event');
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'ringkasan' })).toBe(false);
    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(false);
    expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: 0 })).toBe(false);
    expect(engine.dispatch({ type: 'PILIH_EVENT', eventId: 'E01', pilihanId: 'posko_siaga' })).toBe(true);
    expect(engine.getState()).toMatchObject({ fase: 'ronde', tahapRonde: 'tangan' });
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'event' })).toBe(false);
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'ringkasan' })).toBe(false);
    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.getState()).toMatchObject({ fase: 'ringkasan', tahapRonde: 'transisi' });
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'laporan' })).toBe(false);
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'ronde' })).toBe(false);
  });
  it('recovers a committed card when an event note records only the event choice', () => {
    const state = baruGame('recover-after-event-choice');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.ronde = 3;
    state.kartuDimainkanRondeIni = 'K01';
    state.milik = [0];
    state.anggaran -= 14;
    state.papan.ubin[17] = 0;
    state.catatan.push({
      ronde: 3,
      kartuIdx: null,
      delta: { warga: 2 },
      meter: { ...state.meter },
      anggaran: state.anggaran,
      eventId: 'E01',
      pilihanEvent: 'evakuasi',
    });
    const engine = createGameEngine(state);
    const recovered = structuredClone(engine.getState());

    expect(recovered).toMatchObject({ fase: 'ringkasan', tahapRonde: 'transisi', anggaran: state.anggaran });
    expect(recovered.eventTerpakai).toContain('E01');
    expect(recovered.catatan.at(-1)).toMatchObject({ ronde: 3, kartuIdx: 0 });
    expect(recovered.meter).not.toEqual(state.meter);
    expect(createGameEngine(recovered).getState()).toEqual(recovered);
  });

  it('trusts a round-resolution note over a missing or mismatched played-card index', () => {
    const state = baruGame('recover-round-note');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.kartuDimainkanRondeIni = 'K01';
    state.milik = [0];
    state.anggaran -= 14;
    state.catatan.push({
      ronde: 1,
      kartuIdx: 7,
      delta: {},
      meter: { ...state.meter },
      anggaran: state.anggaran,
    });

    const engine = createGameEngine(state);
    const recovered = structuredClone(engine.getState());

    expect(recovered).toMatchObject({ fase: 'ringkasan', tahapRonde: 'transisi', anggaran: state.anggaran });
    expect(recovered.meter).toEqual(state.meter);
    expect(recovered.catatan).toHaveLength(1);
    expect(createGameEngine(recovered).getState()).toEqual(recovered);
  });

  it('resolves a committed card without charging it again when no round note exists', () => {
    const state = baruGame('recover-committed-card');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.kartuDimainkanRondeIni = 'K01';
    state.milik = [0];
    state.anggaran -= 14;
    state.papan.ubin[17] = 0;
    const budget = state.anggaran;

    const engine = createGameEngine(state);
    const recovered = structuredClone(engine.getState());

    expect(recovered).toMatchObject({ fase: 'ringkasan', tahapRonde: 'transisi', anggaran: budget });
    expect(recovered.catatan.at(-1)?.kartuIdx).toBe(0);
    expect(createGameEngine(recovered).getState()).toEqual(recovered);
  });

  it('reconstructs a pending scheduled event and clears stale saved event state', () => {
    const pending = baruGame('recover-pending-event');
    pending.ronde = 3;
    pending.fase = 'event';
    pending.eventAktif = null;
    expect(createGameEngine(pending).getState()).toMatchObject({
      fase: 'event',
      tahapRonde: 'berita',
      eventAktif: { id: 'E01', dipilih: null },
    });

    const stale = structuredClone(pending);
    stale.eventTerpakai = ['E01'];
    stale.eventAktif = { id: 'E01', dipilih: null };
    const reconciled = createGameEngine(stale).getState();
    expect(reconciled).toMatchObject({ fase: 'ronde', tahapRonde: 'tangan', eventAktif: null, ronde: 3 });
    expect(reconciled.eventTerpakai).toEqual(['E01']);
  });

  it('returns an incomplete no-card save to the same round without income or resolution', () => {
    const state = baruGame('recover-no-card');
    state.fase = 'ringkasan';
    state.tahapRonde = 'transisi';
    state.ronde = 2;
    state.anggaran = 17;
    state.tangan = [];
    const engine = createGameEngine(state);

    expect(engine.getState()).toMatchObject({ fase: 'ronde', tahapRonde: 'tangan', ronde: 2, anggaran: 17 });
    expect(engine.getState().tangan).toHaveLength(4);
    expect(engine.getState().catatan).toEqual([]);
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

    expect(first.getState().tangan).toHaveLength(4);
    expect(first.getState().tangan).toEqual(repeated.getState().tangan);
    expect(first.getState().discard).toEqual([]);
    expect(first.getState().deck).toHaveLength(1);
  });

  it('discards leftover hand policies and draws the next hand on automatic round advance', () => {
    const state = baruGame('leftover-discard');
    state.fase = 'ringkasan';
    state.tahapRonde = 'transisi';
    state.deck = [4, 5, 6, 7, 8, 9, 10, 11];
    state.tangan = [0, 1];
    state.catatan.push({
      ronde: 1,
      kartuIdx: null,
      delta: {},
      meter: { ...state.meter },
      anggaran: state.anggaran,
    });
    const engine = createGameEngine(state);

    expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
    expect(engine.getState().discard).toEqual([0, 1]);
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
    expect(playable.dispatch({ type: 'LEWATI_RONDE' })).toBe(false);
    expect(playable.getState()).toEqual(afterPlay);

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
    expect(acrossRounds.getState().tahapRonde).toBe('tangan');
    expect(acrossRounds.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT01' })).toBe(true);
    expect(acrossRounds.getState().fase).toBe('ringkasan');
    expect(acrossRounds.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
    expect(acrossRounds.getState()).toMatchObject({ ronde: 2, fase: 'ronde', tahapRonde: 'tangan' });
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

    expect(engine.getState()).toMatchObject({ fase: 'ringkasan', tahapRonde: 'transisi' });
    expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
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
    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(false);
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
  it('resolves a played policy immediately and schedules its delayed effects', () => {
    const engine = readyForPlay({ tangan: [17], meter: { udara: 50, akses: 50, hijau: 50, warga: 50 } });

    expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: 17 })).toBe(true);
    expect(engine.getState()).toMatchObject({ fase: 'ringkasan', tahapRonde: 'transisi' });

    expect(engine.getState().meter).toEqual({ udara: 50, akses: 57, hijau: 50, warga: 50 });
    expect(engine.getState().antrian).toEqual([
      {
        ronde: 5,
        rondeAsal: 1,
        sumber: 'K18',
        efek: { akses: -3, udara: -2 },
        catatan: 'Permintaan terinduksi: lebih banyak kendaraan pindah ke jalan baru.',
      },
    ]);
    expect(engine.getState().catatan.at(-1)).toMatchObject({
      ronde: 1,
      delta: { akses: 7 },
      meter: { udara: 50, akses: 57, hijau: 50, warga: 50 },
      anggaran: 76,
    });
  });
  it('applies direct and delayed effects from action cards before showing recap', () => {
    const engine = readyForPlay({ meter: { udara: 50, akses: 50, hijau: 50, warga: 50 } });

    expect(engine.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT01' })).toBe(true);
    expect(engine.getState().fase).toBe('ringkasan');
    expect(engine.getState().meter.warga).toBe(52);
    expect(engine.getState().antrian).toEqual([
      { ronde: 3, rondeAsal: 1, sumber: 'ACT01', efek: { warga: 1 }, catatan: 'Efek permainan: manfaat dialog berlanjut.' },
    ]);
  });

  it('resolves queued effects on skip exactly once across later rounds', () => {
    const state = baruGame('k08-k10-synergy');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.tangan = [7];
    state.milik = [9];
    state.papan.ubin[18] = 9;
    const engine = createGameEngine(state);
    expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: 7 })).toBe(true);
    expect(engine.getState().fase).toBe('ringkasan');
    expect(engine.getState().meter.hijau).toBe(40);

    expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
    expect(engine.getState().ronde).toBe(2);
    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.getState().meter.hijau).toBe(42);
    expect(engine.getState().antrian).toEqual([]);

    expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
    enterHand(engine);
    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.getState().meter.hijau).toBe(42);
  });

  it('clamps each queued effect before applying the next one', () => {
    const state = baruGame('sequential-meter-clamp');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.meter.udara = 99;
    state.antrian = [
      { ronde: 1, sumber: 'first', efek: { udara: 3 } },
      { ronde: 1, sumber: 'second', efek: { udara: -3 } },
    ];
    const engine = createGameEngine(state);

    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.getState().meter.udara).toBe(97);
    expect(engine.getState().catatan.at(-1)?.delta).toEqual({ udara: -2 });
    expect(engine.getState().antrian).toEqual([]);
  });


  it('records actual clamped K18 delayed effects once when they are capped at round 10', () => {
    const state = baruGame('k18-final-round');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.ronde = 7;
    state.tangan = [17];
    state.meter = { udara: 1, akses: 99, hijau: 50, warga: 50 };
    const engine = createGameEngine(state);
    expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: 17 })).toBe(true);
    expect(engine.getState()).toMatchObject({ fase: 'ringkasan', tahapRonde: 'transisi' });
    expect(engine.getState().antrian[0].ronde).toBe(10);
    expect(engine.getState().antrian[0].rondeAsal).toBe(7);

    const final = structuredClone(engine.getState());
    final.ronde = 10;
    final.tahapRonde = 'berita';
    final.kartuDimainkanRondeIni = null;
    const finalEngine = createGameEngine(final);
    finishRound(finalEngine);
    expect(finalEngine.getState().fase).toBe('laporan');
    expect(finalEngine.getState().meter).toEqual({ udara: 0, akses: 97, hijau: 50, warga: 50 });
    expect(finalEngine.getState().atribusiKeputusan).toContainEqual({
      ronde: 7,
      langsung: { akses: 1 },
      tertunda: { akses: -3, udara: -1 },
    });
    expect(hitungSkorAkhir(finalEngine.getState())).toMatchObject({ status: 'siap', mi: 83 });
    expect(finalEngine.getState().antrian).toEqual([]);
  });
  it('resolves K19 delayed penalties at the scheduled round', () => {
    const state = baruGame('k19-trap-effect');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.tangan = [18];
    state.meter = { udara: 50, akses: 50, hijau: 50, warga: 50 };
    const engine = createGameEngine(state);
    expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: 18 })).toBe(true);
    expect(engine.getState()).toMatchObject({ fase: 'ringkasan', tahapRonde: 'transisi' });
    expect(engine.getState().meter.warga).toBe(54);
    expect(engine.getState().antrian[0]).toMatchObject({
      ronde: 5,
      sumber: 'K19',
      efek: { udara: -4, akses: -3 },
    });

    const target = structuredClone(engine.getState());
    target.ronde = 5;
    target.tahapRonde = 'tangan';
    target.kartuDimainkanRondeIni = null;
    const targetEngine = createGameEngine(target);
    expect(targetEngine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(targetEngine.getState().meter).toEqual({ udara: 46, akses: 47, hijau: 50, warga: 54 });
    expect(targetEngine.getState().antrian).toEqual([]);
  });

  it.each([
    ['K03 without K04', 'K03', 'K04 tidak ada', [], { akses: -2 }, 48, 50],
    ['K03 with K04', 'K03', 'K04 tidak ada', [3], { akses: -2 }, 50, 50],
    ['K06 without K07 or K08', 'K06', 'K07 dan K08 tidak ada', [], { hijau: -1 }, 50, 49],
    ['K06 with K08', 'K06', 'K07 dan K08 tidak ada', [7], { hijau: -1 }, 50, 50],
    ['K14 with K07', 'K14', 'K07 atau K08 ada', [6], { hijau: 1 }, 50, 51],
    ['K14 without K07 or K08', 'K14', 'K07 dan K08 tidak ada', [], { hijau: -1 }, 50, 49],
  ] as const)('evaluates delayed synergy at resolution time: %s', (_scenario, source, syarat, owned, effect, expectedAccess, expectedGreen) => {
    const state = baruGame(`synergy-${source}-${_scenario}`);
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.ronde = 5;
    state.milik = [...owned];
    state.meter = { udara: 50, akses: 50, hijau: 50, warga: 50 };
    state.antrian = [{ ronde: 5, sumber: source, efek: effect, syarat }];
    const engine = createGameEngine(state);

    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.getState().meter.akses).toBe(expectedAccess);
    expect(engine.getState().meter.hijau).toBe(expectedGreen);
    expect(engine.getState().antrian).toEqual([]);
  });

  it.each([
    ['K04 with edge-adjacent K01', 'K04', 'K01 sudah ada', 3, 0, 18, 17, { akses: 1 }, 'akses', 51],
    ['K04 with diagonal K01', 'K04', 'K01 sudah ada', 3, 0, 26, 17, { akses: 1 }, 'akses', 50],
    ['K04 with distant K01', 'K04', 'K01 sudah ada', 3, 0, 25, 22, { akses: 1 }, 'akses', 50],
    ['K08 with edge-adjacent K10', 'K08', 'K10 ada', 7, 9, 18, 17, { hijau: 1 }, 'hijau', 51],
    ['K08 with distant K10', 'K08', 'K10 ada', 7, 9, 20, 17, { hijau: 1 }, 'hijau', 50],
  ] as const)('requires adjacency for delayed pair bonus: %s', (_case, source, condition, sourceIdx, partnerIdx, sourceCell, partnerCell, effect, meter, expected) => {
    const state = baruGame(`adjacency-${_case}`);
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.ronde = 5;
    state.milik = [sourceIdx, partnerIdx];
    state.papan.ubin[sourceCell] = sourceIdx;
    state.papan.ubin[partnerCell] = partnerIdx;
    state.meter = { udara: 50, akses: 50, hijau: 50, warga: 50 };
    state.antrian = [{ ronde: 5, sumber: source, efek: effect, syarat: condition }];
    const engine = createGameEngine(state);

    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.getState().meter[meter]).toBe(expected);
    expect(engine.getState().antrian).toEqual([]);
  });
  it.each([
    ['K04 then K01', 3, 0, 'K04', 'K01 sudah ada', 4, { akses: 7, udara: 2 }],
    ['K01 then K04', 0, 3, 'K04', 'K01 sudah ada', 5, { akses: 4, udara: 1 }],
    ['K08 then K10', 7, 9, 'K08', 'K10 ada', 2, { hijau: 5, warga: 2 }],
    ['K10 then K08', 9, 7, 'K08', 'K10 ada', 3, { hijau: 3, warga: 1 }],
  ] as const)('resolves the pending adjacent pair when cards are played in order: %s', (_order, firstCard, partnerCard, source, condition, dueRound, expectedDelta) => {
    const state = baruGame(`pending-adjacency-${_order}`);
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.tangan = [firstCard];
    state.anggaran = 1000;
    state.meter = { udara: 50, akses: 50, hijau: 50, warga: 50 };
    const remaining = Array.from({ length: 19 }, (_, index) => index)
      .filter((index) => index !== firstCard && index !== partnerCard);
    state.deck = [...remaining, partnerCard];
    const engine = createGameEngine(state);

    expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: firstCard, selIdx: 17 })).toBe(true);
    expect(engine.getState().papan.ubin[17]).toBe(firstCard);
    expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
    expect(engine.getState().tangan).toContain(partnerCard);
    expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: partnerCard, selIdx: 18 })).toBe(true);
    expect(engine.getState().papan.ubin[18]).toBe(partnerCard);

    while (engine.getState().ronde < dueRound) {
      if (engine.getState().fase === 'ringkasan') {
        expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
      } else {
        finishRound(engine);
      }
    }
    if (engine.getState().fase !== 'ringkasan') finishRoundStages(engine);

    const resolution = engine.getState().catatan.find((note) => note.ronde === dueRound && note.eventId === undefined);
    expect(resolution?.delta).toEqual(expectedDelta);
    expect(engine.getState().antrian.some((effect) => effect.syarat === condition)).toBe(false);
  });

  it('does not grant a pair bonus when the partner arrives after its due round', () => {
    const state = baruGame('late-k10-no-retroactive-bonus');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.ronde = 5;
    state.milik = [7];
    state.papan.ubin[18] = 7;
    state.meter = { udara: 50, akses: 50, hijau: 50, warga: 50 };
    state.antrian = [{ ronde: 5, sumber: 'K08', efek: { hijau: 1 }, syarat: 'K10 ada' }];
    const dueEngine = createGameEngine(state);

    expect(dueEngine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(dueEngine.getState().meter.hijau).toBe(50);
    expect(dueEngine.getState().antrian).toEqual([]);

    const later = structuredClone(dueEngine.getState());
    later.ronde = 7;
    later.fase = 'ronde';
    later.tahapRonde = 'tangan';
    later.kartuDimainkanRondeIni = null;
    later.milik.push(9);
    later.papan.ubin[17] = 9;
    const lateEngine = createGameEngine(later);

    expect(lateEngine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(lateEngine.getState().meter.hijau).toBe(50);
    expect(lateEngine.getState().antrian).toEqual([]);
  });
  it('applies K16 delayed income loss when no temporary kiosk and information are modeled', () => {
    const state = baruGame('k16-unmitigated-condition');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.ronde = 5;
    state.antrian = [{
      ronde: 5,
      sumber: 'K16',
      efek: { warga: -1 },
      syarat: 'Tidak ada kios sementara dan informasi',
    }];
    const engine = createGameEngine(state);

    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.getState().meter.warga).toBe(49);
    expect(engine.getState().antrian).toEqual([]);
  });


  it('leaves meters unchanged across rounds without discrete effects', () => {

    const state = baruGame('no-passive-meter-drift');
    state.eventTerpakai = ['E01', 'E02', 'E03'];
    const engine = createGameEngine(state);
    const initialMeters = structuredClone(engine.getState().meter);
    enterRound(engine);

    for (let round = 1; round <= 10; round += 1) finishRound(engine);

    expect(engine.getState().meter).toEqual(initialMeters);
    expect(engine.getState().antrian).toEqual([]);
  });
});


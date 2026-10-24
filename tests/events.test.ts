import { describe, expect, it } from 'vitest';
import scheduledEvents from '../src/data/events.json';
import cards from '../src/data/cards.json';
import { createGameEngine, type GameEngine } from '../src/game/engine';
import { baruGame } from '../src/game/state';

const initialMeters = { udara: 50, akses: 50, hijau: 50, warga: 50 };
const k07 = cards.kebijakan.findIndex((card) => card.id === 'K07');
const k08 = cards.kebijakan.findIndex((card) => card.id === 'K08');
const k15 = cards.kebijakan.findIndex((card) => card.id === 'K15');

function startRound(round: number, budget = 100, owned: readonly number[] = []) {
  const state = baruGame(`event-round-${round}-${budget}`);
  state.fase = 'tutorial';
  state.ronde = round;
  state.anggaran = budget;
  state.meter = { ...initialMeters };
  state.milik = [...owned];
  const engine = createGameEngine(state);
  expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'ronde' })).toBe(true);
  return engine;
}

function choose(engine: GameEngine, eventId: string, pilihanId: string): boolean {
  return engine.dispatch({ type: 'PILIH_EVENT', eventId, pilihanId });
}

describe('scheduled event choices', () => {
  it('opens each fixed interactive event and draws hands for the narrative slots', () => {
    for (const event of scheduledEvents.event) {
      const engine = startRound(event.ronde);
      const state = engine.getState();

      if (event.jenis === 'interaktif') {
        expect(state.fase).toBe('event');
        expect(state.eventAktif).toEqual({ id: event.id, dipilih: null });
        expect(state.tangan).toEqual([]);
      } else {
        expect(state.fase).toBe('ronde');
        expect(state.tahapRonde).toBe('tangan');
        expect(state.tangan).toHaveLength(event.ronde <= 3 ? 4 : 3);
      }
    }
  });

  it.each([
    ['E01', 3, 'posko_siaga', [], 8, { udara: 49, akses: 48, hijau: 50, warga: 49 }, { udara: -1, akses: -2, warga: -1 }, []],
    ['E01', 3, 'gotong_royong', [k07], 2, { udara: 51, akses: 50, hijau: 51, warga: 51 }, { udara: 1, hijau: 1, warga: 1 }, []],
    ['E01', 3, 'evakuasi', [], 5, { udara: 50, akses: 49, hijau: 50, warga: 52 }, { akses: -1, warga: 2 }, []],
    ['E02', 6, 'dialog', [], 4, { udara: 50, akses: 49, hijau: 50, warga: 53 }, { akses: -1, warga: 3 }, []],
    ['E02', 6, 'tertibkan', [k15], 2, { udara: 50, akses: 53, hijau: 50, warga: 45 }, { akses: 3, warga: -5 }, [{ ronde: 8, rondeAsal: 6, sumber: 'E02', efek: { warga: 2 }, catatan: 'Penataan memberi manfaat bagi warga.', syarat: 'Jika K15 sudah dipasang' }]],
    ['E02', 6, 'tunda', [], 0, { udara: 50, akses: 48, hijau: 50, warga: 51 }, { akses: -2, warga: 1 }, [{ ronde: 8, rondeAsal: 6, sumber: 'E02', efek: { akses: -1 }, catatan: 'Dampak penundaan penataan terasa kembali.' }]],
    ['E03', 9, 'walking_bus', [], 3, { udara: 51, akses: 52, hijau: 50, warga: 52 }, { udara: 1, akses: 2, warga: 2 }, []],
    ['E03', 9, 'tambah_lajur', [], 10, { udara: 50, akses: 52, hijau: 50, warga: 50 }, { akses: 2 }, [{ ronde: 10, rondeAsal: 9, sumber: 'E03', efek: { akses: -3 }, catatan: 'Kapasitas jalan bertambah, tetapi permintaan perjalanan juga dapat berubah.' }]],
    ['E03', 9, 'pasrah', [], 0, { udara: 50, akses: 47, hijau: 50, warga: 49 }, { akses: -3, warga: -1 }, []],
  ] as const)('applies %s/%s once with exact cost, effects, and delayed queue', (eventId, round, pilihanId, owned, cost, meter, delta, pending) => {
    const engine = startRound(round, 100, owned);
    const beforeBudget = engine.getState().anggaran;

    expect(choose(engine, eventId, pilihanId)).toBe(true);
    const state = engine.getState();
    expect(state.fase).toBe('ronde');
    expect(state.tahapRonde).toBe('tangan');
    expect(state.anggaran).toBe(beforeBudget - cost);
    expect(state.meter).toEqual(meter);
    expect(state.antrian).toEqual(pending);
    expect(state.eventTerpakai).toContain(eventId);
    expect(state.eventAktif).toBeNull();
    expect(state.catatan.at(-1)).toMatchObject({
      ronde: round,
      kartuIdx: null,
      delta,
      meter,
      anggaran: beforeBudget - cost,
      eventId,
      pilihanEvent: pilihanId,
    });

    const committed = structuredClone(state);
    expect(choose(engine, eventId, pilihanId)).toBe(false);
    expect(engine.getState()).toEqual(committed);
  });

  it('clamps the base and conditional effects separately in documented order', () => {
    const engine = startRound(3, 100);
    const before = engine.getState();
    before.meter = { udara: 0, akses: 0, hijau: 100, warga: 100 };

    expect(choose(engine, 'E01', 'posko_siaga')).toBe(true);
    expect(engine.getState().meter).toEqual({ udara: 0, akses: 0, hijau: 100, warga: 98 });
    expect(engine.getState().catatan.at(-1)?.delta).toEqual({ warga: -2 });
  });

  it('rejects invalid, unaffordable, and bypass choices without mutation', () => {
    const engine = startRound(3, 7);
    const before = structuredClone(engine.getState());

    expect(choose(engine, 'E02', 'dialog')).toBe(false);
    expect(engine.getState()).toEqual(before);
    expect(choose(engine, 'E01', 'unknown')).toBe(false);
    expect(engine.getState()).toEqual(before);
    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(false);
    expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: 0 })).toBe(false);
    expect(engine.dispatch({ type: 'TRANSISI_FASE', fase: 'ringkasan' })).toBe(false);
    expect(engine.getState()).toEqual(before);
  });

  it('handles an interactive event without effects when every choice is unaffordable', () => {
    const engine = startRound(3, 1);
    const state = engine.getState();

    expect(state.fase).toBe('ronde');
    expect(state.tahapRonde).toBe('tangan');
    expect(state.eventAktif).toBeNull();
    expect(state.eventTerpakai).toContain('E01');
    expect(state.anggaran).toBe(1);
    expect(state.meter).toEqual(initialMeters);
    expect(state.catatan).toMatchObject([{
      ronde: 3,
      kartuIdx: null,
      delta: {},
      eventId: 'E01',
      pilihanEvent: 'lewati_tanpa_efek',
    }]);
  });

  it('resolves a played card directly into recap and starts the next round on continue', () => {
    const engine = startRound(1);
    const cardIdx = engine.getState().tangan[0]!;
    const cost = cards.kebijakan[cardIdx]!.biaya;

    expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: cardIdx })).toBe(true);
    expect(engine.getState()).toMatchObject({
      fase: 'ringkasan',
      tahapRonde: 'transisi',
      ronde: 1,
      kartuDimainkanRondeIni: cards.kebijakan[cardIdx]!.id,
      anggaran: 100 - cost,
    });
    expect(engine.getState().catatan.at(-1)?.kartuIdx).toBe(cardIdx);

    expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
    expect(engine.getState()).toMatchObject({ fase: 'ronde', tahapRonde: 'tangan', ronde: 2 });
  });

  it('finishes round ten from recap without income or a round eleven draw', () => {
    const engine = startRound(10);
    const budgetBefore = engine.getState().anggaran;

    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.getState().fase).toBe('ringkasan');
    expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
    expect(engine.getState()).toMatchObject({ fase: 'laporan', tahapRonde: 'transisi', ronde: 10, anggaran: budgetBefore });
  });

  it('applies the conditional delayed E02 choice only when K15 is owned at its due round', () => {
    const engine = startRound(6, 100, [k15]);
    expect(choose(engine, 'E02', 'tertibkan')).toBe(true);
    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.getState().fase).toBe('ringkasan');

    expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
    expect(engine.getState().ronde).toBe(7);
    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.dispatch({ type: 'SELESAI_RONDE' })).toBe(true);
    expect(engine.getState().ronde).toBe(8);
    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);

    expect(engine.getState().meter.warga).toBe(47);
    expect(engine.getState().antrian).toEqual([]);
  });
});

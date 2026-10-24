import cards from '../src/data/cards.json';
import { describe, expect, it } from 'vitest';
import { createGameEngine } from '../src/game/engine';
import { hitungPreview } from '../src/game/preview';
import { baruGame } from '../src/game/state';
import type { GameState } from '../src/game/types';

function playable(overrides: Partial<GameState> = {}): GameState {
  return {
    ...baruGame('preview-contract'),
    fase: 'ronde',
    tahapRonde: 'tangan',
    tangan: [0, 2, 17],
    ...overrides,
  };
}

describe('hitungPreview', () => {
  it('shows direct and delayed effects in the schedule', () => {
    const state = playable();
    const direct = hitungPreview(state, { type: 'action', aksiId: 'ACT02' });
    expect(direct.jadwal).toEqual([{ ronde: state.ronde, delta: { warga: 1 }, lengkap: true }]);

    const delayedState = playable({ ronde: 4, tangan: [17] });
    const delayed = hitungPreview(delayedState, { type: 'policy', kartuIdx: 17, selIdx: 17 });
    const effect = cards.kebijakan[17]!.efek.tertunda[0]!;
    expect(delayed.jadwal[1]).toEqual({
      ronde: Math.min(10, delayedState.ronde + effect.setelahRonde),
      delta: effect.efek,
      lengkap: true,
    });
    expect(delayed.jadwal.map(({ ronde }) => ronde)).toEqual([4, 8]);
  });
  it('uses resolver effects and preserves live state and RNG over repeated previews', () => {
    const state = playable();
    const before = structuredClone(state);
    const first = hitungPreview(state, { type: 'policy', kartuIdx: 0, selIdx: 17 });
    const second = hitungPreview(state, { type: 'policy', kartuIdx: 0, selIdx: 17 });

    expect(state).toEqual(before);
    expect(second).toEqual(first);
    expect(first.status).toBe('ready');
    expect(first.horizons.map(({ id }) => id)).toEqual(['sekarang', '+5', 'akhir']);
    expect(first.horizons[1]?.delta).toEqual({ udara: 3, akses: 7, hijau: 1, warga: 1 });
  });

  it('clamps the middle horizon and delayed effects to round ten', () => {
    const state = playable({ ronde: 8, tangan: [17] });
    const result = hitungPreview(state, { type: 'policy', kartuIdx: 17, selIdx: 17 });

    expect(result.horizons.map(({ ronde }) => ronde)).toEqual([8, 10, 10]);
    expect(result.horizons[1]?.delta).toEqual({ udara: -2, akses: 4 });
  });

  it('resolves known conditional effects at their due horizons', () => {
    const result = hitungPreview(playable({ tangan: [2] }), { type: 'policy', kartuIdx: 2, selIdx: 17 });

    expect(result.horizons[0]?.delta).toEqual({ udara: 3, akses: 3, warga: -1 });
    expect(result.horizons[0]?.lengkap).toBe(true);
    expect(result.horizons[1]?.lengkap).toBe(true);
    expect(result.horizons[1]?.delta).toEqual({ udara: 4, akses: 1, warga: -1 });
    expect(result.catatan.join(' ')).not.toMatch(/K04 tidak ada/);
  });

  it('marks only horizons affected by unsupported pending conditions incomplete', () => {
    const state = playable();
    state.antrian.push({ ronde: 3, sumber: 'K02', efek: { akses: 2 }, syarat: 'unsupported condition' });
    const result = hitungPreview(state, { type: 'action', aksiId: 'ACT04', kartuIdx: 0 });

    expect(result.horizons.map(({ lengkap }) => lengkap)).toEqual([true, false, false]);
  });

  it('reports invalid membership and placement without horizon numbers', () => {
    const board = playable().papan;
    const state = playable({ tangan: [0], papan: { ...board, ubin: board.ubin.map((cell, index) => index === 17 ? 1 : cell) } });
    const notInHand = hitungPreview(state, { type: 'policy', kartuIdx: 1, selIdx: 1 });
    const blockedCell = hitungPreview(state, { type: 'policy', kartuIdx: 0, selIdx: 17 });

    expect(notInHand.status).toBe('invalid');
    expect(notInHand.horizons).toEqual([]);
    expect(notInHand.jadwal).toEqual([]);
    expect(blockedCell.status).toBe('invalid');
    expect(blockedCell.horizons).toEqual([]);
    expect(blockedCell.jadwal).toEqual([]);
  });
  it('rejects unknown policy indices and unavailable actions without numeric horizons', () => {
    const state = playable({ tangan: [999] });
    const policy = hitungPreview(state, { type: 'policy', kartuIdx: 999, selIdx: 17 });
    const action = hitungPreview(state, { type: 'action', aksiId: 'ACT01' });

    expect(policy.status).toBe('invalid');
    expect(policy.horizons).toEqual([]);
    expect(policy.jadwal).toEqual([]);
    expect(action.status).toBe('ready');
    expect(action.horizons).toHaveLength(3);
  });

  it('estimates an unaffordable candidate without making it playable', () => {
    const state = playable({ tangan: [0], anggaran: 0 });
    const before = structuredClone(state);
    const result = hitungPreview(state, { type: 'policy', kartuIdx: 0, selIdx: 17 });

    expect(result.status).toBe('ready');
    expect(result.biaya).toBe(14);
    expect(result.dapatDimainkan).toBe(false);
    expect(result.horizons[0]?.delta).toEqual({ udara: 2, akses: 4, hijau: 1, warga: 1 });
    expect(state).toEqual(before);
  });

  it('marks effects-free actions as having no meter change', () => {
    const result = hitungPreview(playable(), { type: 'action', aksiId: 'ACT04', kartuIdx: 0 });

    expect(result.status).toBe('ready');
    expect(result.tanpaPerubahan).toBe(true);
    expect(result.horizons.every(({ delta }) => Object.keys(delta).length === 0)).toBe(true);
  });

  it('matches the resolver for pending effects as rounds advance', () => {
    const initial = playable({ tangan: [0], ronde: 1 });
    initial.antrian.push({ ronde: 3, sumber: 'K02', efek: { akses: 2 } });
    const preview = hitungPreview(initial, { type: 'policy', kartuIdx: 0, selIdx: 17 });
    const engine = createGameEngine(initial, undefined, () => 0);
    expect(engine.dispatch({ type: 'MAIN_KARTU', kartuIdx: 0, selIdx: 17 })).toBe(true);
    for (let round = 1; round <= 6; round += 1) {
      engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
      engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
      engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
      engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
      if (round < 6) {
        engine.dispatch({ type: 'PROSES_TAHAP_RONDE' });
        engine.dispatch({ type: 'SELESAI_RONDE' });
      }
    }
    const predicted = preview.horizons[1]?.delta;
    const actual = engine.getState().meter;
    expect({ udara: actual.udara - initial.meter.udara, akses: actual.akses - initial.meter.akses, hijau: actual.hijau - initial.meter.hijau, warga: actual.warga - initial.meter.warga }).toEqual(predicted);
  });
});

import { describe, expect, it } from 'vitest';
import { hitungSkorAkhir } from '../src/game/report';
import { migrasikanSave } from '../src/save/migrasi';
import { baruGame } from '../src/game/state';
import type { GameState, KunciMeter } from '../src/game/types';

function finalState(meter: Record<KunciMeter, number>): GameState {
  const state = baruGame('report-score');
  state.ronde = 10;
  state.fase = 'laporan';
  state.meter = meter;
  return state;
}

describe('hitungSkorAkhir', () => {
  it('counts T at each exact threshold and C only below 30', () => {
    expect(hitungSkorAkhir(finalState({ udara: 60, akses: 70, hijau: 30, warga: 70 }))).toMatchObject({
      status: 'siap', t: 4, c: 0, bintang: 5,
    });
    expect(hitungSkorAkhir(finalState({ udara: 59, akses: 69, hijau: 29, warga: 69 }))).toMatchObject({
      status: 'siap', t: 0, c: 1,
    });
  });
  it.each([
    ['ronde', 'tidak-valid'],
    ['event', 'tidak-valid'],
    ['ringkasan', 'siap'],
    ['laporan', 'siap'],
  ] as const)('returns %s status at round 10 in phase %s', (fase, status) => {
    const state = finalState({ udara: 60, akses: 70, hijau: 30, warga: 70 });
    state.fase = fase;

    expect(hitungSkorAkhir(state).status).toBe(status);
  });


  it.each([
    ['5 stars matches first at MI 40', { udara: 60, akses: 70, hijau: 30, warga: 70 }, 40, 5],
    ['4 stars start at T=3, C=0, MI=60', { udara: 60, akses: 70, hijau: 30, warga: 69 }, 60, 4],
    ['3 stars include T=2, C=1', { udara: 60, akses: 70, hijau: 29, warga: 69 }, 100, 3],
    ['2 stars include T=1, C=2', { udara: 60, akses: 29, hijau: 29, warga: 69 }, 100, 2],
    ['1 star is the final fallback', { udara: 29, akses: 29, hijau: 29, warga: 29 }, 100, 1],
    ['5-star condition yields 4 when MI exceeds 40', { udara: 60, akses: 70, hijau: 30, warga: 70 }, 41, 4],
    ['4-star condition yields 3 when MI exceeds 60', { udara: 60, akses: 70, hijau: 30, warga: 69 }, 61, 3],
    ['T=2 and C=2 falls through to 2 stars', { udara: 60, akses: 29, hijau: 30, warga: 29 }, 100, 2],
    ['T=1 and C=3 falls through to 1 star', { udara: 60, akses: 29, hijau: 29, warga: 29 }, 100, 1],
  ] as const)('%s', (_scenario, meter, mi, bintang) => {
    const state = finalState({ ...meter });
    const directByMi: Record<number, number> = { 40: 2 / 3, 41: 0.7, 60: 1.5, 61: 1.55, 100: 1e308 };
    state.atribusiKeputusan = [{
      ronde: 1,
      langsung: { udara: directByMi[mi] },
      tertunda: {},
    }];

    const result = hitungSkorAkhir(state);
    expect(result.status).toBe('siap');
    if (result.status === 'siap') {
      expect(result.mi).toBe(mi);
      expect(result.bintang).toBe(bintang);
    }
  });

  it('uses signed Math.round and clamps extreme results', () => {
    const positiveHalf = finalState({ udara: 60, akses: 70, hijau: 30, warga: 70 });
    positiveHalf.atribusiKeputusan = [{ ronde: 1, langsung: { udara: 99.5 }, tertunda: { udara: -99.5 } }];
    expect(hitungSkorAkhir(positiveHalf)).toMatchObject({ status: 'siap', mi: 100 });

    const negativeHalf = finalState({ udara: 60, akses: 70, hijau: 30, warga: 70 });
    negativeHalf.atribusiKeputusan = [{ ronde: 1, langsung: { udara: -99.5 }, tertunda: { udara: 99.5 } }];
    expect(hitungSkorAkhir(negativeHalf)).toMatchObject({ status: 'siap', mi: -99 });

    const extreme = finalState({ udara: 60, akses: 70, hijau: 30, warga: 70 });
    extreme.atribusiKeputusan = [{ ronde: 1, langsung: { udara: 1e308 }, tertunda: {} }];
    expect(hitungSkorAkhir(extreme)).toMatchObject({ status: 'siap', mi: 100 });
  });

  it('returns MI 0 for a complete empty journal without mutating state', () => {
    const state = finalState({ udara: 60, akses: 70, hijau: 30, warga: 70 });
    const before = structuredClone(state);

    const score = hitungSkorAkhir(state);
    expect(score).toMatchObject({ status: 'siap', mi: 0 });
    expect(hitungSkorAkhir(state)).toEqual(score);
    expect(state).toEqual(before);
  });

  it('keeps legacy saves readable but marks MI unavailable without an attribution journal', () => {
    const state = finalState({ udara: 60, akses: 70, hijau: 30, warga: 70 });
    delete state.atribusiKeputusan;
    state.antrian = [{ ronde: 10, sumber: 'K18', efek: { udara: -2 } }];

    const migrated = migrasikanSave({ versi: 1, state });
    expect(migrated).toEqual(state);
    expect(hitungSkorAkhir(migrated as GameState)).toMatchObject({ status: 'mi-tidak-tersedia', t: 4, c: 0 });
  });

  it.each([
    ['before round 10', (state: GameState) => { state.ronde = 9; }],
    ['fractional meter values', (state: GameState) => { state.meter.akses = 70.5; }],
    ['out-of-range meter values', (state: GameState) => { state.meter.udara = 101; }],
    ['missing meter values', (state: GameState) => { delete (state.meter as Partial<GameState['meter']>).warga; }],
    ['malformed attribution entries', (state: GameState) => { state.atribusiKeputusan = [{ ronde: 0, langsung: { udara: -1 }, tertunda: {} }]; }],
  ])('returns unavailable for %s', (_scenario, mutate) => {
    const state = finalState({ udara: 60, akses: 70, hijau: 30, warga: 70 });
    mutate(state);

    expect(hitungSkorAkhir(state).status).toBe('tidak-valid');
  });
});

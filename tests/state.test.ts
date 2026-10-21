import { describe, expect, it } from 'vitest';
import { baruGame } from '../src/game/state';

describe('new game state', () => {
  it('creates a state matching the public game-state schema', () => {
    const state = baruGame('schema-seed');

    expect(state.versi).toBe(1);
    expect(state.seed).toBe('schema-seed');
    expect(typeof state.rngS).toBe('number');
    expect(typeof state.fase).toBe('string');
    expect(typeof state.ronde).toBe('number');
    expect(typeof state.anggaran).toBe('number');

    expect(Object.keys(state.meter).sort()).toEqual(['akses', 'udara', 'warga', 'hijau'].sort());
    expect(Object.values(state.meter).every((value) => typeof value === 'number')).toBe(true);

    expect(state.papan).toMatchObject({ lebar: 8, tinggi: 8, selBuildable: 24 });
    expect(Array.isArray(state.papan.ubin)).toBe(true);
    expect(Array.isArray(state.deck)).toBe(true);
    expect(Array.isArray(state.tangan)).toBe(true);
    expect(Array.isArray(state.discard)).toBe(true);
    expect(Array.isArray(state.aksiTerpakai)).toBe(true);
    expect(state.kartuCadanganACT04 === null || typeof state.kartuCadanganACT04 === 'number').toBe(true);
    expect(state.kartuDimainkanRondeIni === null || typeof state.kartuDimainkanRondeIni === 'string').toBe(true);
    expect(Array.isArray(state.milik)).toBe(true);
    expect(Array.isArray(state.perRondeAktif)).toBe(true);
    expect(Array.isArray(state.antrian)).toBe(true);
    expect(state.eventAktif === null || typeof state.eventAktif === 'object').toBe(true);
    expect(Array.isArray(state.eventTerpakai)).toBe(true);
    expect(Array.isArray(state.catatan)).toBe(true);
    expect(typeof state.setelan.audio).toBe('boolean');
    expect(typeof state.waktuSimpan).toBe('number');
  });
});

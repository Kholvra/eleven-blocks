import { describe, expect, it } from 'vitest';
import { baruGame } from '../src/game/state';
import { createGameEngine } from '../src/game/engine';
import { createSaveRepository, type SaveStorage } from '../src/save/save';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: SaveStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { storage, values };
}

describe('save repository', () => {
  it('round-trips the complete state, including optional name and ticket', () => {
    const state = baruGame('save-seed');
    state.nama = 'Kota';
    state.tiket = { teks: ['satu', 'dua', 'tiga'], url: 'https://example.test', dibuat: 123 };
    state.antrian.push({ ronde: 2, sumber: 'K08', efek: { udara: -2 }, catatan: 'tertunda', syarat: 'K10 ada' });
    const { storage } = memoryStorage();
    const repository = createSaveRepository(storage);

    expect(repository.save(state)).toBe(true);
    expect(repository.load()).toEqual({ status: 'valid', state });
  });

  it('loads a v1 pending adjacent bonus, resolves it once, and keeps it consumed after reload', () => {
    const state = baruGame('save-v1-adjacent-bonus');
    state.fase = 'ronde';
    state.tahapRonde = 'tangan';
    state.ronde = 5;
    state.milik = [0, 3];
    state.papan.ubin[17] = 0;
    state.papan.ubin[18] = 3;
    state.meter = { udara: 50, akses: 50, hijau: 50, warga: 50 };
    state.antrian = [{
      ronde: 5,
      sumber: 'K04',
      efek: { akses: 1 },
      catatan: 'Bonus akses bike-to-halte.',
      syarat: 'K01 sudah ada',
    }];
    const { storage } = memoryStorage();
    const repository = createSaveRepository(storage);

    expect(repository.save(state)).toBe(true);
    const loaded = repository.load();
    expect(loaded.status).toBe('valid');
    if (loaded.status !== 'valid') return;
    const engine = createGameEngine(loaded.state);

    expect(engine.dispatch({ type: 'LEWATI_RONDE' })).toBe(true);
    expect(engine.getState().meter.akses).toBe(51);
    expect(engine.getState().antrian).toEqual([]);
    expect(repository.save(engine.getState())).toBe(true);

    const reloaded = repository.load();
    expect(reloaded.status).toBe('valid');
    if (reloaded.status !== 'valid') return;
    expect(reloaded.state.meter.akses).toBe(51);
    expect(reloaded.state.antrian).toEqual([]);
  });
  it('loads a save written by another tab after the repository was created', () => {
    const { storage, values } = memoryStorage();
    const repository = createSaveRepository(storage);
    const stateA = baruGame('tab-a');
    const stateB = baruGame('tab-b');

    expect(repository.save(stateA)).toBe(true);
    values.set('elevenblocks.v1.save', JSON.stringify({ versi: 1, state: stateB }));
    expect(repository.load()).toEqual({ status: 'valid', state: stateB });
  });


  it('rejects corrupt and unsupported-version payloads without exposing state', () => {
    for (const raw of ['{', JSON.stringify({ versi: 2, state: baruGame('x') })]) {
      const { storage, values } = memoryStorage({ 'elevenblocks.v1.save': raw });
      const result = createSaveRepository(storage).load();
      expect(result.status).toBe('invalid');
      expect(values.has('elevenblocks.v1.save')).toBe(false);
      if (result.status === 'invalid') expect(result.message).toContain('Mulai permainan baru');
    }
  });

  it('uses same-page memory when storage access or writes fail', () => {
    const state = baruGame('memory-seed');
    const blocked: SaveStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    const repository = createSaveRepository(blocked);
    expect(repository.save(state)).toBe(false);
    expect(repository.load()).toEqual({ status: 'valid', state });

    const { storage: backing, values } = memoryStorage({ 'elevenblocks.v1.save': 'older' });
    const quota: SaveStorage = { ...backing, setItem: () => { throw new Error('quota'); } };
    const quotaRepository = createSaveRepository(quota);
    expect(quotaRepository.save(state)).toBe(false);
    expect(quotaRepository.load()).toEqual({ status: 'valid', state });
    expect(values.get('elevenblocks.v1.save')).toBe('older');
  });

  it('rejects unknown phases and malformed required shapes atomically', () => {
    const invalidStates = [
      { ...baruGame('phase'), fase: 'unknown' },
      { ...baruGame('shape'), papan: { ...baruGame('shape').papan, ubin: [1] } },
    ];
    for (const state of invalidStates) {
      const { storage, values } = memoryStorage({
        'elevenblocks.v1.save': JSON.stringify({ versi: 1, state }),
      });
      expect(createSaveRepository(storage).load().status).toBe('invalid');
      expect(values.has('elevenblocks.v1.save')).toBe(false);
    }
  });
  it('rejects report and ticket phases before round 10 atomically', () => {
    const invalidStates = [
      { ...baruGame('pre-report'), fase: 'laporan' },
      { ...baruGame('pre-ticket'), fase: 'tiket' },
    ];

    for (const state of invalidStates) {
      const { storage, values } = memoryStorage({
        'elevenblocks.v1.save': JSON.stringify({ versi: 1, state }),
      });
      expect(createSaveRepository(storage).load().status).toBe('invalid');
      expect(values.has('elevenblocks.v1.save')).toBe(false);
    }
  });

  it('accepts a valid round-10 final state', () => {
    const state = baruGame('final-save');
    state.ronde = 10;
    state.fase = 'tiket';
    state.tiket = { teks: ['satu', 'dua', 'tiga'], url: 'https://example.test', dibuat: 123 };
    const { storage } = memoryStorage({
      'elevenblocks.v1.save': JSON.stringify({ versi: 1, state }),
    });

    expect(createSaveRepository(storage).load()).toEqual({ status: 'valid', state });
  });

  it('clears persistent and in-memory saves', () => {
    const { storage, values } = memoryStorage();
    const repository = createSaveRepository(storage);
    repository.save(baruGame('clear'));
    repository.clear();
    expect(repository.load()).toEqual({ status: 'empty' });
    expect(values.has('elevenblocks.v1.save')).toBe(false);
  });
});

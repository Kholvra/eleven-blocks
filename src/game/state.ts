import balance from '../data/balance.json';
import type { GameState } from './types';
import { createDeck } from './deck';
import { hashSeed } from './rng';

export function baruGame(seed: string): GameState {
  const state: GameState = {
    versi: 1,
    seed,
    rngS: hashSeed(seed),
    fase: 'menu',
    tahapRonde: 'berita',
    ronde: 1,
    anggaran: balance.awal.anggaran,
    meter: { ...balance.awal.meter },
    papan: {
      lebar: 8,
      tinggi: 8,
      selBuildable: 24,
      ubin: Array<number | null>(256).fill(null),
    },
    deck: [],
    tangan: [],
    discard: [],
    aksiTerpakai: [],
    kartuCadanganACT04: null,
    kartuDimainkanRondeIni: null,
    milik: [],
    perRondeAktif: [],
    antrian: [],
    atribusiKeputusan: [],
    eventAktif: null,
    eventTerpakai: [],
    catatan: [],
    setelan: { audio: true },
    waktuSimpan: Date.now(),
  };
  createDeck(state);
  return state;
}

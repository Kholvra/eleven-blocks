import balance from '../data/balance.json';
import { BUILDABLE_CELLS } from './board';
import { canDrawPolicy } from './deck';
import type { GameState } from './types';

export interface CardAvailability {
  available: boolean;
  reason: string | null;
}

export function statusKartu(state: GameState, kartuIdx: number): CardAvailability {
  const card = balance.ekonomi.kebijakan[kartuIdx];
  if (!card || !state.tangan.includes(kartuIdx)) {
    return { available: false, reason: 'Kartu tidak ada di tangan.' };
  }
  if (state.fase !== 'ronde' || state.tahapRonde !== 'tangan') {
    return { available: false, reason: 'Kartu hanya bisa dimainkan pada tahap tangan.' };
  }
  if (state.kartuDimainkanRondeIni !== null) {
    return { available: false, reason: 'Satu kartu per ronde.' };
  }
  if (state.anggaran < card.biaya) {
    return { available: false, reason: 'Dana kurang.' };
  }
  if (firstOpenBuildableCell(state) === null) {
    return { available: false, reason: 'Tidak ada sel kosong.' };
  }
  return { available: true, reason: null };
}

export function statusAksi(state: GameState, aksiId: string, kartuIdx?: number): CardAvailability {
  const action = balance.ekonomi.aksi.find((item) => item.kode === aksiId);
  if (!action) return { available: false, reason: 'Aksi tidak dikenal.' };
  if (state.fase !== 'ronde' || state.tahapRonde !== 'tangan') {
    return { available: false, reason: 'Aksi hanya bisa dimainkan pada tahap tangan.' };
  }
  if (state.kartuDimainkanRondeIni !== null) {
    return { available: false, reason: 'Satu kartu per ronde.' };
  }
  if (state.aksiTerpakai.includes(aksiId)) {
    return { available: false, reason: 'Aksi sudah dipakai.' };
  }
  if (state.anggaran < action.biaya) {
    return { available: false, reason: 'Dana kurang.' };
  }
  if (aksiId === 'ACT04') {
    if (state.ronde === 10) return { available: false, reason: 'Aksi ini tidak tersedia pada ronde 10.' };
    if (kartuIdx === undefined || !state.tangan.includes(kartuIdx) || biayaKartu(kartuIdx) === undefined) {
      return { available: false, reason: 'Pilih kartu tangan untuk ditukar.' };
    }
    if (!canDrawPolicy(state)) return { available: false, reason: 'Tidak ada kartu pengganti.' };
  }
  return { available: true, reason: null };
}

export function biayaKartu(kartuIdx: number): number | undefined {
  return balance.ekonomi.kebijakan[kartuIdx]?.biaya;
}

export function biayaAksi(aksiId: string): number | undefined {
  return balance.ekonomi.aksi.find((item) => item.kode === aksiId)?.biaya;
}

export function kodeKartu(kartuIdx: number): string | undefined {
  return balance.ekonomi.kebijakan[kartuIdx]?.kode;
}

export function firstOpenBuildableCell(state: GameState): number | null {
  for (const cell of BUILDABLE_CELLS) {
    if (state.papan.ubin[cell] === null) return cell;
  }
  return null;
}

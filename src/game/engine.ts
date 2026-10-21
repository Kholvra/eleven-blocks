import balance from '../data/balance.json';
import { allowedTransitions } from './machine';
import { isBuildableCell } from './board';
import { biayaAksi, biayaKartu, firstOpenBuildableCell, kodeKartu, statusAksi, statusKartu } from './cards';
import { drawHand, exchangePolicy, finishHand } from './deck';
import type { GameState, Phase, TahapRonde } from './types';

const nextStage: Record<TahapRonde, TahapRonde | null> = {
  berita: 'tangan',
  tangan: 'resolusi',
  resolusi: 'reaksi',
  reaksi: 'transisi',
  transisi: null,
};

const POLICY_PLAY_MARKER = 'kebijakan';

export type GameAction =
  | { type: 'TRANSISI_FASE'; fase: Phase }
  | { type: 'PROSES_TAHAP_RONDE' }
  | { type: 'SELESAI_RONDE' }
  | { type: 'TEMPATKAN_KEBIJAKAN'; kartuIdx: number; selIdx: number }
  | { type: 'MAIN_KARTU'; kartuIdx: number; selIdx?: number }
  | { type: 'MAIN_AKSI'; aksiId: string; kartuIdx?: number };

export interface GameEngine {
  getState(): GameState;
  dispatch(action: GameAction): boolean;
}

export function createGameEngine(initialState: GameState): GameEngine {
  let state = structuredClone(initialState);

  return {
    getState: () => state,
    dispatch(action) {
      if (action.type === 'TEMPATKAN_KEBIJAKAN') {
        if (
          state.fase !== 'ronde' ||
          state.tahapRonde !== 'tangan' ||
          state.kartuDimainkanRondeIni !== null
        ) {
          return false;
        }

        const { kartuIdx, selIdx } = action;
        if (!Number.isInteger(kartuIdx) || kartuIdx < 0 || !state.tangan.includes(kartuIdx) || state.milik.includes(kartuIdx) || state.papan.ubin.includes(kartuIdx)) {
          return false;
        }
        if (
          !Number.isInteger(selIdx) ||
          selIdx < 0 ||
          selIdx >= state.papan.ubin.length ||
          selIdx >= state.papan.lebar * state.papan.tinggi ||
          !isBuildableCell(selIdx) ||
          state.papan.ubin[selIdx] !== null
        ) {
          return false;
        }

        const nextState = structuredClone(state);
        nextState.papan.ubin[selIdx] = kartuIdx;
        nextState.tangan = nextState.tangan.filter((cardIndex) => cardIndex !== kartuIdx);
        nextState.milik.push(kartuIdx);
        nextState.kartuDimainkanRondeIni = POLICY_PLAY_MARKER;
        state = nextState;
        return true;
      }
      if (action.type === 'MAIN_KARTU') {
        const nextState = playPolicy(state, action.kartuIdx, action.selIdx);
        if (nextState === null) return false;
        state = nextState;
        return true;
      }
      if (action.type === 'MAIN_AKSI') {
        const nextState = playAction(state, action.aksiId, action.kartuIdx);
        if (nextState === null) return false;
        state = nextState;
        return true;
      }

      if (action.type === 'PROSES_TAHAP_RONDE') {
        if (state.fase !== 'ronde') return false;
        const stage = nextStage[state.tahapRonde];
        if (stage === undefined || stage === null) return false;
        const nextState = structuredClone(state);
        nextState.tahapRonde = stage;
        if (stage === 'tangan') drawHand(nextState);
        state = nextState;
        return true;
      }

      if (action.type === 'SELESAI_RONDE') {
        if (state.fase !== 'ronde' || state.tahapRonde !== 'transisi' || state.ronde < 1 || state.ronde > 10) return false;

        const nextState = structuredClone(state);
        finishHand(nextState);
        nextState.tahapRonde = 'berita';
        nextState.kartuDimainkanRondeIni = null;
        if (nextState.ronde === 10) {
          nextState.fase = 'ringkasan';
        } else {
          nextState.anggaran += balance.ekonomi.pendapatan_per_ronde;
          nextState.ronde += 1;
          nextState.fase = 'ronde';
        }
        state = nextState;
        return true;
      }

      if (!allowedTransitions[state.fase].includes(action.fase)) return false;
      if (action.fase === 'laporan' && state.ronde < 10) return false;
      if (state.fase === 'ringkasan' && action.fase === 'ronde' && state.ronde >= 10) return false;

      const nextState = structuredClone(state);
      nextState.fase = action.fase;
      if (action.fase === 'ronde') nextState.tahapRonde = 'berita';
      state = nextState;
      return true;
    },
  };
}

function playPolicy(state: GameState, kartuIdx: number, requestedCell?: number): GameState | null {
  if (state.fase !== 'ronde' || state.tahapRonde !== 'tangan' || !statusKartu(state, kartuIdx).available) return null;
  const cell = requestedCell ?? firstOpenBuildableCell(state);
  if (
    cell === null ||
    !Number.isInteger(cell) ||
    cell < 0 ||
    cell >= state.papan.ubin.length ||
    cell >= state.papan.lebar * state.papan.tinggi ||
    !isBuildableCell(cell) ||
    state.papan.ubin[cell] !== null
  ) return null;
  const cost = biayaKartu(kartuIdx);
  const code = kodeKartu(kartuIdx);
  if (cost === undefined || code === undefined) return null;

  const nextState = structuredClone(state);
  nextState.tangan.splice(nextState.tangan.indexOf(kartuIdx), 1);
  nextState.anggaran -= cost;
  nextState.kartuDimainkanRondeIni = code;
  nextState.papan.ubin[cell] = kartuIdx;
  nextState.milik.push(kartuIdx);
  return nextState;
}

function playAction(state: GameState, aksiId: string, kartuIdx?: number): GameState | null {
  if (state.fase !== 'ronde' || state.tahapRonde !== 'tangan') return null;
  if (!statusAksi(state, aksiId, kartuIdx).available) return null;
  const cost = biayaAksi(aksiId);
  if (cost === undefined) return null;

  const nextState = structuredClone(state);
  nextState.anggaran -= cost;
  nextState.aksiTerpakai.push(aksiId);
  nextState.kartuDimainkanRondeIni = aksiId;
  if (aksiId === 'ACT04' && kartuIdx !== undefined && !exchangePolicy(nextState, kartuIdx)) return null;
  return nextState;
}

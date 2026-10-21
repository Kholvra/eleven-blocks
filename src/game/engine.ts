import balance from '../data/balance.json';
import { allowedTransitions } from './machine';
import type { GameState, Phase, TahapRonde } from './types';

const nextStage: Record<TahapRonde, TahapRonde | null> = {
  berita: 'tangan',
  tangan: 'resolusi',
  resolusi: 'reaksi',
  reaksi: 'transisi',
  transisi: null,
};

export type GameAction =
  | { type: 'TRANSISI_FASE'; fase: Phase }
  | { type: 'PROSES_TAHAP_RONDE' }
  | { type: 'SELESAI_RONDE' }
  | { type: 'SETELAN_AUDIO'; aktif: boolean };

export interface GameEngine {
  getState(): GameState;
  dispatch(action: GameAction): boolean;
}

export function createGameEngine(
  initialState: GameState,
  onStateChange?: (state: GameState) => void,
  now: () => number = Date.now,
): GameEngine {
  let state = structuredClone(initialState);

  function commit(nextState: GameState): boolean {
    nextState.waktuSimpan = now();
    state = nextState;
    onStateChange?.(state);
    return true;
  }

  return {
    getState: () => state,
    dispatch(action) {
      if (action.type === 'SETELAN_AUDIO') {
        const nextState = structuredClone(state);
        nextState.setelan.audio = action.aktif;
        return commit(nextState);
      }

      if (action.type === 'PROSES_TAHAP_RONDE') {
        if (state.fase !== 'ronde') return false;
        const stage = nextStage[state.tahapRonde];
        if (stage === undefined || stage === null) return false;
        const nextState = structuredClone(state);
        nextState.tahapRonde = stage;
        return commit(nextState);
      }

      if (action.type === 'SELESAI_RONDE') {
        if (state.fase !== 'ronde' || state.tahapRonde !== 'transisi' || state.ronde < 1 || state.ronde > 10) return false;

        const nextState = structuredClone(state);
        nextState.tahapRonde = 'berita';
        nextState.kartuDimainkanRondeIni = null;
        if (nextState.ronde === 10) {
          nextState.fase = 'ringkasan';
        } else {
          nextState.anggaran += balance.ekonomi.pendapatan_per_ronde;
          nextState.ronde += 1;
          nextState.fase = 'ronde';
        }
        return commit(nextState);
      }

      if (!allowedTransitions[state.fase].includes(action.fase)) return false;
      if (action.fase === 'laporan' && state.ronde < 10) return false;
      if (state.fase === 'ringkasan' && action.fase === 'ronde' && state.ronde >= 10) return false;

      const nextState = structuredClone(state);
      nextState.fase = action.fase;
      if (action.fase === 'ronde') nextState.tahapRonde = 'berita';
      return commit(nextState);
    },
  };
}

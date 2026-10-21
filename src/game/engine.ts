import balance from '../data/balance.json';
import actions from '../data/actions.json';
import cards from '../data/cards.json';
import { allowedTransitions } from './machine';
import { isBuildableCell } from './board';
import { biayaAksi, biayaKartu, firstOpenBuildableCell, kodeKartu, statusAksi, statusKartu } from './cards';
import { applyMeterEffect } from './meters';
import { scheduleEffects, takeDueEffects } from './pending';
import { drawHand, exchangePolicy, finishHand } from './deck';
import type { Efek, GameState, Phase, TahapRonde } from './types';
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
  | { type: 'TEMPATKAN_KEBIJAKAN'; kartuIdx: number; selIdx: number }
  | { type: 'MAIN_KARTU'; kartuIdx: number; selIdx?: number }
  | { type: 'MAIN_AKSI'; aksiId: string; kartuIdx?: number }
  | { type: 'TERAPKAN_HUJAN_EKSTREM' }
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
      if (action.type === 'TEMPATKAN_KEBIJAKAN') {
        if (
          state.fase !== 'ronde' ||
          state.tahapRonde !== 'tangan' ||
          state.kartuDimainkanRondeIni !== null
        ) {
          return false;
        }

        const { kartuIdx, selIdx } = action;
        const cardCode = kodeKartu(kartuIdx);
        if (!Number.isInteger(kartuIdx) || kartuIdx < 0 || cardCode === undefined ||
            !state.tangan.includes(kartuIdx) || state.milik.includes(kartuIdx) || state.papan.ubin.includes(kartuIdx)) {
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
        nextState.kartuDimainkanRondeIni = cardCode;
        return commit(nextState);
      }
      if (action.type === 'MAIN_KARTU') {
        const nextState = playPolicy(state, action.kartuIdx, action.selIdx);
        if (nextState === null) return false;
        return commit(nextState);
      }
      if (action.type === 'MAIN_AKSI') {
        const nextState = playAction(state, action.aksiId, action.kartuIdx);
        if (nextState === null) return false;
        return commit(nextState);
      }
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
        if (stage === 'tangan') drawHand(nextState);
        if (stage === 'resolusi') resolveRoundEffects(nextState);
        return commit(nextState);
      }

      if (action.type === 'TERAPKAN_HUJAN_EKSTREM') {
        if (state.fase !== 'event' || state.eventAktif?.id !== 'E01' || state.eventTerpakai.includes('E01')) return false;
        const nextState = structuredClone(state);
        const protectedFromRain = nextState.milik.some((index) => cards.kebijakan[index]?.id === 'K07') ||
          nextState.kartuDimainkanRondeIni === 'ACT03';
        const rain = balance.event.hujanEkstrem;
        const damageFactor = protectedFromRain ? (100 - rain.mitigasiPersen) / 100 : 1;
        const result = applyMeterEffect(nextState.meter, {
          akses: rain.kerusakan.akses * damageFactor,
          warga: rain.kerusakan.warga * damageFactor,
        });
        nextState.meter = result.meter;
        nextState.eventTerpakai.push('E01');
        nextState.catatan.push({
          ronde: nextState.ronde,
          kartuIdx: null,
          delta: result.delta,
          meter: { ...nextState.meter },
          anggaran: nextState.anggaran,
          eventId: 'E01',
        });
        return commit(nextState);
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
type DelayedCardEffect = { setelahRonde: number; efek: Efek; catatan?: string; syarat?: string };

function resolveRoundEffects(state: GameState): void {
  const roundStart = { ...state.meter };
  const roundDelta: Efek = {};
  const apply = (effect: Efek) => {
    const result = applyMeterEffect(state.meter, effect);
    state.meter = result.meter;
    for (const [key, amount] of Object.entries(result.delta) as Array<[keyof Efek, number]>) {
      roundDelta[key] = (roundDelta[key] ?? 0) + amount;
    }
  };

  const pending = takeDueEffects(state.antrian, state.ronde);
  state.antrian = pending.remaining;
  const ownedCodes = new Set(state.milik.map((index) => cards.kebijakan[index]?.id).filter((id): id is string => id !== undefined));
  for (const effect of pending.due) {
    if (synergySatisfied(effect.sumber, effect.syarat, ownedCodes)) apply(effect.efek);
  }

  const playedCode = state.kartuDimainkanRondeIni;
  if (playedCode !== null) {
    const policy = cards.kebijakan.find((card) => card.id === playedCode);
    const action = actions.aksi.find((item) => item.id === playedCode);
    const effectData = policy?.efek ?? action?.efek;
    if (effectData) {
      apply(effectData.langsung);
      state.antrian = scheduleEffects(state.antrian, playedCode, state.ronde, effectData.tertunda as DelayedCardEffect[]);
    }
  }

  for (const key of Object.keys(roundDelta) as Array<keyof Efek>) {
    if (roundDelta[key] === 0 || state.meter[key] === roundStart[key]) delete roundDelta[key];
  }
  state.catatan.push({
    ronde: state.ronde,
    kartuIdx: playedCode?.startsWith('K') ? Number(playedCode.slice(1)) - 1 : null,
    delta: roundDelta,
    meter: { ...state.meter },
    anggaran: state.anggaran,
  });
}

function synergySatisfied(source: string, condition: string | undefined, owned: Set<string>): boolean {
  if (condition === undefined) return true;
  switch (`${source}:${condition}`) {
    case 'K03:K04 tidak ada':
      return !owned.has('K04');
    case 'K04:K01 sudah ada':
      return owned.has('K01');
    case 'K06:K07 dan K08 tidak ada':
      return !owned.has('K07') && !owned.has('K08');
    case 'K11:K15 dan K02 tidak ada':
      return !owned.has('K15') && !owned.has('K02');
    case 'K08:K10 ada':
      return owned.has('K10');
    case 'K14:K07 atau K08 ada':
      return owned.has('K07') || owned.has('K08');
    case 'K14:K07 dan K08 tidak ada':
      return !owned.has('K07') && !owned.has('K08');
    case 'K16:Tidak ada kios sementara dan informasi':
      return true;
    default:
      return false;
  }
}

import balance from '../data/balance.json';
import events from '../data/events.json';
import eventConditions from '../data/event-conditions.json';
import actions from '../data/actions.json';
import cards from '../data/cards.json';
import { allowedTransitions } from './machine';
import { isBuildableCell } from './board';
import { biayaAksi, biayaKartu, firstOpenBuildableCell, kodeKartu, statusAksi, statusKartu } from './cards';
import { applyMeterEffect } from './meters';
import { scheduleEffects, takeDueEffects } from './pending';
import { drawHand, exchangePolicy, finishHand } from './deck';
import type { Efek, GameState, Phase } from './types';

export type GameAction =
  | { type: 'TRANSISI_FASE'; fase: Phase }
  | { type: 'SELESAI_RONDE' }
  | { type: 'LEWATI_RONDE' }
  | { type: 'PILIH_EVENT'; eventId: string; pilihanId: string }
  | { type: 'MAIN_KARTU'; kartuIdx: number; selIdx?: number }
  | { type: 'MAIN_AKSI'; aksiId: string; kartuIdx?: number }
  | { type: 'SETELAN_AUDIO'; aktif: boolean }
  | { type: 'SIMPAN_TIKET'; teks: [string, string, string]; url: string; nama?: string };

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
  if (reconcileSavedRound(state)) {
    state.waktuSimpan = now();
    onStateChange?.(state);
  }

  function commit(nextState: GameState): boolean {
    nextState.waktuSimpan = now();
    state = nextState;
    onStateChange?.(state);
    return true;
  }

  return {
    getState: () => state,
    dispatch(action) {
      if (action.type === 'MAIN_KARTU') {
        const nextState = playPolicy(state, action.kartuIdx, action.selIdx);
        if (nextState === null) return false;
        resolveRoundAndShowRecap(nextState);
        return commit(nextState);
      }
      if (action.type === 'MAIN_AKSI') {
        const nextState = playAction(state, action.aksiId, action.kartuIdx);
        if (nextState === null) return false;
        resolveRoundAndShowRecap(nextState);
        return commit(nextState);
      }
      if (action.type === 'PILIH_EVENT') {
        const nextState = chooseScheduledEvent(state, action.eventId, action.pilihanId);
        if (nextState === null) return false;
        return commit(nextState);
      }
      if (action.type === 'LEWATI_RONDE') {
        if (state.fase !== 'ronde' || state.tahapRonde !== 'tangan' || state.kartuDimainkanRondeIni !== null) return false;
        const nextState = structuredClone(state);
        resolveRoundAndShowRecap(nextState);
        return commit(nextState);
      }
      if (action.type === 'SIMPAN_TIKET') {
        if (
          state.fase !== 'tiket' ||
          state.ronde !== 10 ||
          action.teks.length !== 3 ||
          !action.teks.every((text) => typeof text === 'string' && text.length > 0) ||
          action.url.length === 0 ||
          action.url.length > 1500
        ) return false;

        const nextState = structuredClone(state);
        nextState.tiket = { teks: [...action.teks], url: action.url, dibuat: now() };
        if (action.nama) nextState.nama = action.nama;
        else delete nextState.nama;
        return commit(nextState);
      }
      if (action.type === 'SETELAN_AUDIO') {
        const nextState = structuredClone(state);
        nextState.setelan.audio = action.aktif;
        return commit(nextState);
      }
      if (action.type === 'SELESAI_RONDE') {
        if (state.fase !== 'ringkasan' || state.tahapRonde !== 'transisi' || state.ronde < 1 || state.ronde > 10) return false;

        const nextState = structuredClone(state);
        finishHand(nextState);
        nextState.kartuDimainkanRondeIni = null;
        if (nextState.ronde === 10) {
          nextState.fase = 'laporan';
        } else {
          nextState.anggaran += balance.ekonomi.pendapatan_per_ronde;
          nextState.ronde += 1;
          beginRound(nextState);
        }
        return commit(nextState);
      }
      if (action.type !== 'TRANSISI_FASE') return false;
      if (action.fase === 'ronde') {
        if (state.fase !== 'menu' && state.fase !== 'tutorial') return false;
        const nextState = structuredClone(state);
        beginRound(nextState);
        return commit(nextState);
      }
      if (action.fase === 'event' || action.fase === 'ringkasan' || action.fase === 'laporan') return false;
      if (!allowedTransitions[state.fase].includes(action.fase)) return false;

      const nextState = structuredClone(state);
      nextState.fase = action.fase;
      return commit(nextState);
    },
  };
}

type DelayedGameEffect = { setelahRonde: number; efek: Efek; catatan?: string; syarat?: string };

type EventChoice = {
  id: string;
  biaya: number;
  efek: Efek;
  penutup: string;
  efek_kondisional?: Array<{ syarat: string; efek: Efek }>;
  efek_tertunda?: DelayedGameEffect[];
};

type ScheduledEvent = {
  id: string;
  ronde: number;
  jenis: 'interaktif' | 'naratif';
  pilihan: EventChoice[];
  jika_semua_pilihan_tidak_terjangkau?: string;
};

function scheduledEvent(round: number): ScheduledEvent | undefined {
  return events.event.find((event) => event.ronde === round) as unknown as ScheduledEvent | undefined;
}

function allEventChoicesUnaffordable(event: ScheduledEvent, budget: number): boolean {
  return event.pilihan.length > 0 && event.pilihan.every((choice) => choice.biaya > budget);
}

function beginRound(state: GameState): void {
  const event = scheduledEvent(state.ronde);
  state.tahapRonde = 'berita';
  state.eventAktif = null;
  if (event?.jenis === 'interaktif' && !state.eventTerpakai.includes(event.id)) {
    if (allEventChoicesUnaffordable(event, state.anggaran) &&
        event.jika_semua_pilihan_tidak_terjangkau === 'lewati_tanpa_efek') {
      finishUnchosenEvent(state, event);
      return;
    }
    state.fase = 'event';
    state.eventAktif = { id: event.id, dipilih: null };
    return;
  }
  state.fase = 'ronde';
  state.tahapRonde = 'tangan';
  if (state.tangan.length === 0) drawHand(state);
}

function finishUnchosenEvent(state: GameState, event: ScheduledEvent): void {
  state.eventTerpakai.push(event.id);
  state.eventAktif = null;
  state.catatan.push({
    ronde: state.ronde,
    kartuIdx: null,
    delta: {},
    meter: { ...state.meter },
    anggaran: state.anggaran,
    eventId: event.id,
    pilihanEvent: 'lewati_tanpa_efek',
  });
  if (state.kartuDimainkanRondeIni !== null) {
    resolveRoundAndShowRecap(state);
    return;
  }
  state.fase = 'ronde';
  state.tahapRonde = 'tangan';
  if (state.tangan.length === 0) drawHand(state);
}

function chooseScheduledEvent(state: GameState, eventId: string, choiceId: string): GameState | null {
  const event = scheduledEvent(state.ronde);
  const choice = event?.pilihan.find((item) => item.id === choiceId);
  if (
    state.fase !== 'event' ||
    event?.jenis !== 'interaktif' ||
    event.id !== eventId ||
    state.eventAktif?.id !== eventId ||
    state.eventTerpakai.includes(eventId) ||
    choice === undefined ||
    choice.biaya > state.anggaran
  ) return null;

  const nextState = structuredClone(state);
  nextState.anggaran -= choice.biaya;
  const delta: Efek = {};
  const apply = (effect: Efek): void => {
    const result = applyMeterEffect(nextState.meter, effect);
    nextState.meter = result.meter;
    addEffects(delta, result.delta);
  };
  apply(choice.efek);
  const source = event.id;
  const ownedCodes = new Set(nextState.milik.map((index) => cards.kebijakan[index]?.id)
    .filter((id): id is string => id !== undefined));
  for (const conditional of choice.efek_kondisional ?? []) {
    if (evaluateCondition(source, conditional.syarat, ownedCodes) === true) apply(conditional.efek);
  }
  nextState.antrian = scheduleEffects(
    nextState.antrian,
    source,
    nextState.ronde,
    choice.efek_tertunda ?? [],
    nextState.ronde,
  );
  nextState.eventTerpakai.push(event.id);
  nextState.eventAktif = null;
  nextState.catatan.push({
    ronde: nextState.ronde,
    kartuIdx: null,
    delta,
    meter: { ...nextState.meter },
    anggaran: nextState.anggaran,
    eventId: event.id,
    pilihanEvent: choice.id,
  });
  if (nextState.kartuDimainkanRondeIni !== null) {
    resolveRoundAndShowRecap(nextState);
  } else {
    nextState.fase = 'ronde';
    nextState.tahapRonde = 'tangan';
    if (nextState.tangan.length === 0) drawHand(nextState);
  }
  return nextState;
}

function addEffects(total: Efek, addition: Efek): void {
  for (const [key, amount] of Object.entries(addition) as Array<[keyof Efek, number]>) {
    const combined = (total[key] ?? 0) + amount;
    if (combined === 0) delete total[key];
    else total[key] = combined;
  }
}

function resolveRoundAndShowRecap(state: GameState): void {
  resolveRoundEffects(state);
  state.fase = 'ringkasan';
  state.tahapRonde = 'transisi';
  state.eventAktif = null;
}

function reconcileSavedRound(state: GameState): boolean {
  if (state.fase !== 'ronde' && state.fase !== 'event' && state.fase !== 'ringkasan') return false;
  const event = scheduledEvent(state.ronde);
  const eventResolved = event === undefined
    ? undefined
    : state.catatan.find((note) => note.ronde === state.ronde && note.eventId === event.id);
  let changed = false;
  if (event !== undefined && eventResolved && !state.eventTerpakai.includes(event.id)) {
    state.eventTerpakai.push(event.id);
    changed = true;
  }
  const roundResolved = state.catatan.find((note) => note.ronde === state.ronde && note.eventId === undefined);
  if (roundResolved) {
    changed ||= state.fase !== 'ringkasan' || state.tahapRonde !== 'transisi' || state.eventAktif !== null;
    state.fase = 'ringkasan';
    state.tahapRonde = 'transisi';
    state.eventAktif = null;
    return changed;
  }
  if (event?.jenis === 'interaktif' && !state.eventTerpakai.includes(event.id) && eventResolved === undefined) {
    if (allEventChoicesUnaffordable(event, state.anggaran) &&
        event.jika_semua_pilihan_tidak_terjangkau === 'lewati_tanpa_efek') {
      finishUnchosenEvent(state, event);
      return true;
    }
    changed ||= state.fase !== 'event' || state.tahapRonde !== 'berita' ||
      state.eventAktif?.id !== event.id || state.eventAktif.dipilih !== null;
    state.fase = 'event';
    state.tahapRonde = 'berita';
    state.eventAktif = { id: event.id, dipilih: null };
    return changed;
  }
  if (state.kartuDimainkanRondeIni !== null) {
    resolveRoundAndShowRecap(state);
    return true;
  }
  if (state.tahapRonde === 'berita') {
    beginRound(state);
    return true;
  }
  changed ||= state.fase !== 'ronde' || state.tahapRonde !== 'tangan' || state.eventAktif !== null;
  const needsHand = state.tahapRonde !== 'tangan';
  state.fase = 'ronde';
  state.tahapRonde = 'tangan';
  state.eventAktif = null;
  if (needsHand && state.tangan.length === 0) drawHand(state);
  return changed || needsHand && state.tangan.length > 0;
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

function resolveRoundEffects(state: GameState): void {
  const roundStart = { ...state.meter };
  const roundDelta: Efek = {};
  const ownedCodes = new Set(state.milik.map((index) => cards.kebijakan[index]?.id).filter((id): id is string => id !== undefined));
  const apply = (effect: Efek): Efek => {
    const result = applyMeterEffect(state.meter, effect);
    state.meter = result.meter;
    for (const [key, amount] of Object.entries(result.delta) as Array<[keyof Efek, number]>) {
      roundDelta[key] = (roundDelta[key] ?? 0) + amount;
    }
    return result.delta;
  };
  const recordAttribution = (round: number, horizon: 'langsung' | 'tertunda', delta: Efek) => {
    const decision = state.atribusiKeputusan?.find((entry) => entry.ronde === round);
    if (decision === undefined) return;
    const totals = decision[horizon];
    for (const [key, amount] of Object.entries(delta) as Array<[keyof Efek, number]>) {
      const total = (totals[key] ?? 0) + amount;
      if (total === 0) delete totals[key];
      else totals[key] = total;
    }
  };
  const applyDueEffects = () => {
    const pending = takeDueEffects(state.antrian, state.ronde);
    state.antrian = pending.remaining;
    for (const effect of pending.due) {
      if (evaluateCondition(effect.sumber, effect.syarat, ownedCodes) !== true) continue;
      const delta = apply(effect.efek);
      if (effect.rondeAsal !== undefined) recordAttribution(effect.rondeAsal, 'tertunda', delta);
    }
  };

  applyDueEffects();

  const playedCode = state.kartuDimainkanRondeIni;
  if (playedCode !== null) {
    const policy = cards.kebijakan.find((card) => card.id === playedCode);
    const action = actions.aksi.find((item) => item.id === playedCode);
    const effectData = policy?.efek ?? action?.efek;
    if (effectData) {
      if (state.atribusiKeputusan !== undefined &&
          !state.atribusiKeputusan.some((entry) => entry.ronde === state.ronde)) {
        state.atribusiKeputusan.push({ ronde: state.ronde, langsung: {}, tertunda: {} });
      }
      recordAttribution(state.ronde, 'langsung', apply(effectData.langsung));
      state.antrian = scheduleEffects(
        state.antrian,
        playedCode,
        state.ronde,
        effectData.tertunda as DelayedGameEffect[],
        state.ronde,
      );
      applyDueEffects();
    }
  }

  for (const key of Object.keys(roundDelta) as Array<keyof Efek>) {
    if (roundDelta[key] === 0 || state.meter[key] === roundStart[key]) delete roundDelta[key];
  }
  const cardIndex = playedCode === null ? -1 : cards.kebijakan.findIndex((card) => card.id === playedCode);
  state.catatan.push({
    ronde: state.ronde,
    kartuIdx: cardIndex < 0 ? null : cardIndex,
    delta: roundDelta,
    meter: { ...state.meter },
    anggaran: state.anggaran,
  });
}

export function evaluateCondition(source: string, condition: string | undefined, owned: Set<string>): boolean | undefined {
  if (condition === undefined) return true;
  const eventRules = eventConditions[source as keyof typeof eventConditions];
  if (eventRules !== undefined) {
    for (const rule of eventRules) {
      if (rule.syarat !== condition) continue;
      if (rule.operator === 'none') {
        for (const card of rule.cards) if (owned.has(card)) return false;
        return true;
      }
      for (const card of rule.cards) if (owned.has(card)) return true;
      return false;
    }
  }
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
      return undefined;
  }
}

import actions from '../data/actions.json';
import cards from '../data/cards.json';
import { isBuildableCell } from './board';
import { biayaAksi, biayaKartu, kodeKartu, statusAksi } from './cards';
import { createGameEngine, evaluateCondition } from './engine';
import { takeDueEffects } from './pending';
import type { Efek, GameState, KunciMeter } from './types';

export type PreviewCandidate =
  | { type: 'policy'; kartuIdx: number; selIdx?: number | null }
  | { type: 'action'; aksiId: string; kartuIdx?: number };

export interface PreviewHorizon {
  id: 'sekarang' | '+5' | 'akhir';
  label: string;
  ronde: number;
  delta: Efek;
  lengkap: boolean;
}

export interface PreviewJadwal {
  ronde: number;
  delta: Efek;
  lengkap: boolean;
}

export interface PreviewResult {
  status: 'ready' | 'invalid';
  reason: string | null;
  biaya: number | null;
  dapatDimainkan: boolean;
  tanpaPerubahan: boolean;
  horizons: PreviewHorizon[];
  jadwal: PreviewJadwal[];
  catatan: string[];
}

const meterKeys: readonly KunciMeter[] = ['udara', 'akses', 'hijau', 'warga'];
const horizonIds: PreviewHorizon['id'][] = ['sekarang', '+5', 'akhir'];
const horizonLabels: Record<PreviewHorizon['id'], string> = { sekarang: 'Sekarang', '+5': '+5 ronde', akhir: 'Akhir' };

export function hitungPreview(state: GameState, candidate: PreviewCandidate): PreviewResult {
  const invalid = (reason: string, biaya: number | null = null): PreviewResult => ({
    status: 'invalid', reason, biaya, dapatDimainkan: false, tanpaPerubahan: false, horizons: [], jadwal: [], catatan: [],
  });
  try {
    if (!Number.isInteger(state.ronde) || state.ronde < 1 || state.ronde > 10) return invalid('Ronde tidak valid.');
    const initial = structuredClone(state);
    let source: string;
    let cost: number;
    let playable = true;
    const notes = ['Perkiraan tidak mencakup event, undian kartu, atau pilihan masa depan.'];
    if (candidate.type === 'policy') {
      source = kodeKartu(candidate.kartuIdx) ?? '';
      cost = biayaKartu(candidate.kartuIdx) ?? Number.NaN;
      if (!Number.isInteger(candidate.kartuIdx) || !source || !initial.tangan.includes(candidate.kartuIdx)) return invalid('Kartu tidak ada di tangan.', Number.isFinite(cost) ? cost : null);
      if (initial.milik.includes(candidate.kartuIdx) || initial.papan.ubin.includes(candidate.kartuIdx)) return invalid('Kartu sudah ditempatkan.', cost);
      const cell = candidate.selIdx === undefined
        ? initial.papan.ubin.findIndex((value, index) => value === null && isBuildableCell(index))
        : candidate.selIdx;
      if (!Number.isInteger(cell) || cell === null || cell < 0 || cell >= initial.papan.ubin.length || cell >= initial.papan.lebar * initial.papan.tinggi || !isBuildableCell(cell) || initial.papan.ubin[cell] !== null) return invalid('Pilih sel kosong yang dapat dibangun.', cost);
      if (initial.fase !== 'ronde' || initial.tahapRonde !== 'tangan' || initial.kartuDimainkanRondeIni !== null) return invalid('Kartu tidak tersedia pada tahap ini.', cost);
      if (initial.anggaran < cost) playable = false;
      else {
        initial.tangan = initial.tangan.filter((index) => index !== candidate.kartuIdx);
        initial.anggaran -= cost;
      }
      initial.kartuDimainkanRondeIni = source;
      initial.papan.ubin[cell] = candidate.kartuIdx;
      initial.milik.push(candidate.kartuIdx);
      for (const item of (cards.kebijakan[candidate.kartuIdx]?.efek.tertunda ?? []) as Array<{ syarat?: string }>) {
        if (item.syarat !== undefined) notes.push(conditionNote(source, item.syarat, initial));
      }
    } else {
      source = candidate.aksiId;
      const action = actions.aksi.find((item) => item.id === source);
      cost = biayaAksi(source) ?? Number.NaN;
      if (!action) return invalid('Aksi tidak dikenal.');
      const actionStatus = statusAksi(initial, source, candidate.kartuIdx);
      if (!actionStatus.available && actionStatus.reason !== 'Dana kurang.') return invalid(actionStatus.reason ?? 'Aksi tidak tersedia.', cost);
      if (initial.anggaran < cost) playable = false;
      else initial.anggaran -= cost;
      initial.aksiTerpakai.push(source);
      initial.kartuDimainkanRondeIni = source;
      for (const item of action.efek.tertunda as Array<{ syarat?: string }>) {
        if (item.syarat !== undefined) notes.push(conditionNote(source, item.syarat, initial));
      }
    }
    for (const effect of initial.antrian) {
      if (effect.syarat !== undefined && effect.ronde <= 10) notes.push(conditionNote(effect.sumber, effect.syarat, initial));
    }
    if (!playable) notes.push('Dana kurang; angka dihitung sebagai perkiraan, aksi tidak dapat dimainkan.');

    const jadwal = buildSchedule(source, state.ronde, initial);
    let simulated = createGameEngine(initial, undefined, () => initial.waktuSimpan).getState();
    const firstNote = simulated.catatan.slice(initial.catatan.length).at(-1);
    const baselineMeter = { ...initial.meter };
    const targetRounds = [state.ronde, Math.min(state.ronde + 5, 10), 10];
    const deltas: Efek[] = [firstNote?.delta ?? {}];

    const skippedEventRounds = new Set<number>();
    const completeness = [!hasUnsupportedDue(initial.antrian, state.ronde, initial) && !hasUnsupportedCandidate(source, state.ronde, initial)];
    for (const target of targetRounds.slice(1)) {
      while (simulated.ronde < target) {
        const nextRound = createGameEngine(simulated, undefined, () => simulated.waktuSimpan);
        if (!nextRound.dispatch({ type: 'SELESAI_RONDE' })) return invalid('Preview tidak dapat melanjutkan ronde.');
        simulated = structuredClone(nextRound.getState());
        if (simulated.fase === 'event' && simulated.eventAktif !== null) {
          skippedEventRounds.add(simulated.ronde);
          simulated.eventTerpakai.push(simulated.eventAktif.id);
          simulated.eventAktif = null;
        }
        const nextHand = createGameEngine(simulated, undefined, () => simulated.waktuSimpan);
        simulated = structuredClone(nextHand.getState());
        const resolve = createGameEngine(simulated, undefined, () => simulated.waktuSimpan);
        if (!resolve.dispatch({ type: 'LEWATI_RONDE' })) return invalid('Preview tidak dapat menyelesaikan ronde simulasi.');
        simulated = resolve.getState();
      }
      const delta: Efek = {};
      for (const key of meterKeys) if (simulated.meter[key] !== baselineMeter[key]) delta[key] = simulated.meter[key] - baselineMeter[key];
      deltas.push(delta);
      const skippedInteractiveChoice = [...skippedEventRounds].some((round) => round <= target);
      completeness.push(!skippedInteractiveChoice &&
        !hasUnsupportedDue(initial.antrian, target, initial) &&
        !hasUnsupportedCandidate(source, target, initial));
    }
    const horizons = horizonIds.map((id, index) => ({ id, label: horizonLabels[id], ronde: targetRounds[index] ?? 10, delta: deltas[index] ?? {}, lengkap: completeness[index] ?? true }));
    const tanpaPerubahan = horizons.every(({ delta }) => meterKeys.every((key) => delta[key] === undefined || delta[key] === 0));
    if (tanpaPerubahan) notes.push('Tanpa perubahan meter.');
    return { status: 'ready', reason: null, biaya: cost, dapatDimainkan: playable, tanpaPerubahan, horizons, jadwal, catatan: notes };
  } catch {
    return invalid('Preview tidak dapat dihitung sekarang.');
  }
}

function effectsFor(source: string): { langsung?: Efek; tertunda?: Array<{ setelahRonde: number; efek: Efek; syarat?: string }> } | undefined {
  return cards.kebijakan.find((item) => item.id === source)?.efek ?? actions.aksi.find((item) => item.id === source)?.efek;
}

function buildSchedule(source: string, round: number, state: GameState): PreviewJadwal[] {
  const effects = effectsFor(source);
  if (!effects) return [];
  const rows = new Map<number, { delta: Efek; lengkap: boolean }>();
  const add = (dueRound: number, delta: Efek, complete: boolean) => {
    const row = rows.get(dueRound) ?? { delta: {}, lengkap: true };
    for (const key of meterKeys) {
      const value = delta[key];
      if (value !== undefined) row.delta[key] = (row.delta[key] ?? 0) + value;
    }
    row.lengkap &&= complete;
    rows.set(dueRound, row);
  };
  add(round, effects.langsung ?? {}, true);
  for (const item of effects.tertunda ?? []) {
    const outcome = item.syarat === undefined ? true : evaluateCondition(source, item.syarat, state);
    const dueRound = Math.min(10, round + item.setelahRonde);
    if (outcome === true) add(dueRound, item.efek, true);
    else if (outcome === undefined) add(dueRound, {}, false);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, row]) => Object.values(row.delta).some((value) => value !== 0))
    .map(([ronde, row]) => ({ ronde, delta: row.delta, lengkap: row.lengkap }));
}

function conditionNote(source: string, condition: string, state: GameState): string {
  const outcome = evaluateCondition(source, condition, state);
  const status = outcome === true ? 'berlaku' : outcome === false ? 'tidak berlaku' : 'tidak diketahui';
  const reason = source === 'K04' && condition === 'K01 sudah ada'
    ? outcome === true ? 'K01 dan K04 berdampingan.' : 'K01 dan K04 belum berdampingan.'
    : source === 'K08' && condition === 'K10 ada'
      ? outcome === true ? 'K08 dan K10 berdampingan.' : 'K08 dan K10 belum berdampingan.'
      : outcome === undefined
        ? 'Aturan ini belum didukung oleh pratinjau.'
        : outcome ? 'Syarat terpenuhi.' : 'Syarat belum terpenuhi.';
  return `Syarat “${condition}”: ${status}. ${reason}`;
}

function hasUnsupportedDue(queue: GameState['antrian'], round: number, state: GameState): boolean {
  const due = takeDueEffects(queue, round).due;
  return due.some((effect) => evaluateCondition(effect.sumber, effect.syarat, state) === undefined);
}

function hasUnsupportedCandidate(source: string, targetRound: number, state: GameState): boolean {
  const effects = effectsFor(source);
  return (effects?.tertunda ?? []).some((item) => item.syarat !== undefined &&
    evaluateCondition(source, item.syarat, state) === undefined &&
    Math.min(10, state.ronde + item.setelahRonde) <= targetRound);
}

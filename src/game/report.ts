import balance from '../data/balance.json';
import type { Efek, GameState, KunciMeter } from './types';
import cards from '../data/cards.json';
import actionsData from '../data/actions.json';

export type KeputusanLaporan = {
  ronde: number;
  nama: string;
  biaya: number;
  delta: Efek;
  kondisi: string | null;
};

export interface LaporanKota {
  sections: [
    { id: 'ringkasan'; meterAwal: Record<KunciMeter, number>; meterAkhir: Record<KunciMeter, number>; cakrawala: Array<{ id: 'sekarang' | '+5' | 'akhir'; meter: Record<KunciMeter, number> | null; disimulasikan: boolean }> },
    { id: 'keputusan'; tersedia: boolean; item: KeputusanLaporan[]; aksiTerpilih: Array<{ nama: string; biaya: number; ronde: null }> },
    { id: 'pihak-terdampak'; tersedia: boolean; kondisi: string[] },
    { id: 'refleksi'; prompt: string },
  ];
}

function meterCopy(meter: Record<KunciMeter, number>): Record<KunciMeter, number> {
  return { udara: meter.udara, akses: meter.akses, hijau: meter.hijau, warga: meter.warga };
}

export function composeLaporanKota(state: GameState): LaporanKota {
  const entries = Array.isArray(state.catatan) ? state.catatan : [];
  const journal = state.atribusiKeputusan;
  const decisions = journal === undefined ? [] : entries.flatMap((entry) => {
    if (!Number.isInteger(entry.ronde) || entry.kartuIdx === null) return [];
    const card = cards.kebijakan[entry.kartuIdx];
    const attribution = journal.find((item) => item.ronde === entry.ronde);
    if (!card || !attribution) return [];
    const delta: Efek = {};
    for (const key of METER_KEYS) {
      const amount = (attribution.langsung[key] ?? 0) + (attribution.tertunda[key] ?? 0);
      if (amount !== 0) delta[key] = amount;
    }
    return [{ ronde: entry.ronde, nama: card.nama, biaya: card.biaya, delta, kondisi: card.kondisi ?? null }];
  }).sort((a, b) => Object.values(b.delta).reduce((sum, value) => sum + Math.abs(value), 0) -
    Object.values(a.delta).reduce((sum, value) => sum + Math.abs(value), 0) || a.ronde - b.ronde).slice(0, 3);
  const chosenActions = [...new Set(state.aksiTerpakai ?? [])].flatMap((id) => {
    const action = actionsData.aksi.find((item) => item.id === id);
    return action ? [{ nama: action.nama, biaya: action.biaya, ronde: null as null }] : [];
  });
  const conditions = [...new Set(entries.flatMap((entry) => {
    const condition = entry.kartuIdx === null ? undefined : cards.kebijakan[entry.kartuIdx]?.kondisi;
    return condition ? [condition] : [];
  }))];
  const decisionConditions = new Set(decisions.flatMap((decision) => decision.kondisi ? [decision.kondisi] : []));
  const additionalConditions = conditions.filter((condition) => !decisionConditions.has(condition));
  const meterStart = meterCopy(balance.awal.meter);
  const meterEnd = meterCopy(state.meter);
  return {
    sections: [
      { id: 'ringkasan', meterAwal: meterStart, meterAkhir: meterEnd, cakrawala: [
        { id: 'sekarang', meter: meterCopy(state.meter), disimulasikan: true },
        { id: '+5', meter: null, disimulasikan: false },
        { id: 'akhir', meter: meterCopy(state.meter), disimulasikan: true },
      ] },
      { id: 'keputusan', tersedia: state.atribusiKeputusan !== undefined, item: decisions, aksiTerpilih: chosenActions },
      { id: 'pihak-terdampak', tersedia: additionalConditions.length > 0, kondisi: additionalConditions },
      { id: 'refleksi', prompt: 'Keputusan mana yang paling sulit kamu timbang, dan informasi apa yang ingin kamu pertimbangkan berikutnya?' },
    ],
  };
}

export type SkorAkhir =
  | { status: 'siap'; t: number; c: number; bintang: 1 | 2 | 3 | 4 | 5; mi: number }
  | { status: 'mi-tidak-tersedia' | 'tidak-valid'; t?: number; c?: number; alasan: string };

const METER_KEYS: readonly KunciMeter[] = ['udara', 'akses', 'hijau', 'warga'];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validEfek(value: unknown): value is Efek {
  return record(value) && Object.entries(value).every(([key, amount]) =>
    METER_KEYS.includes(key as KunciMeter) && typeof amount === 'number' && Number.isFinite(amount));
}

function bintangUntuk(t: number, c: number, mi: number): 1 | 2 | 3 | 4 | 5 {
  const { bintang } = balance.skor;
  if (t === bintang['5'].t && c === bintang['5'].c && mi <= bintang['5'].miMaks) return 5;
  if (t >= bintang['4'].t && c === bintang['4'].c && mi <= bintang['4'].miMaks) return 4;
  if (t >= bintang['3'].t && c <= bintang['3'].c) return 3;
  if (t >= bintang['2'].t && c <= bintang['2'].c) return 2;
  return 1;
}

export function hitungSkorAkhir(state: GameState): SkorAkhir {
  const input: unknown = state;
  if (!record(input) || input.ronde !== 10 || !Number.isInteger(input.ronde)) {
    return { status: 'tidak-valid', alasan: 'Skor akhir hanya tersedia setelah ronde 10.' };
  }
  if (input.fase !== 'ringkasan' && input.fase !== 'laporan' && input.fase !== 'tiket') {
    return { status: 'tidak-valid', alasan: 'Skor akhir hanya tersedia setelah ronde 10.' };
  }

  const meter = input.meter;
  if (!record(meter) || Object.keys(meter).length !== METER_KEYS.length ||
      !METER_KEYS.every((key) => typeof meter[key] === 'number' && Number.isInteger(meter[key]) &&
        (meter[key] as number) >= 0 && (meter[key] as number) <= 100)) {
    return { status: 'tidak-valid', alasan: 'Nilai meter harus berupa bilangan bulat dari 0 sampai 100.' };
  }

  const meters = meter as Record<KunciMeter, number>;

  const thresholds = balance.skor.ambang_meter;
  const t = METER_KEYS.reduce((count, key) => count + (meters[key] >= thresholds[key] ? 1 : 0), 0);
  const c = METER_KEYS.reduce((count, key) => count + (meters[key] < balance.skor.meter_kritis ? 1 : 0), 0);
  const journal = input.atribusiKeputusan;
  if (journal === undefined) {
    return { status: 'mi-tidak-tersedia', t, c, alasan: 'Riwayat atribusi efek keputusan tidak tersedia pada save ini.' };
  }
  if (!Array.isArray(journal)) {
    return { status: 'tidak-valid', t, c, alasan: 'Riwayat atribusi efek keputusan tidak valid.' };
  }

  let sumS = 0;
  let sumL = 0;
  const decisionRounds = new Set<number>();
  for (const entry of journal) {
    if (!record(entry) || !Number.isInteger(entry.ronde) || (entry.ronde as number) < 1 || (entry.ronde as number) > 10 ||
        decisionRounds.has(entry.ronde as number) || !validEfek(entry.langsung) || !validEfek(entry.tertunda)) {
      return { status: 'tidak-valid', t, c, alasan: 'Riwayat atribusi efek keputusan tidak valid.' };
    }
    decisionRounds.add(entry.ronde as number);
    for (const amount of Object.values(entry.langsung)) sumS += amount as number;
    for (const amount of Object.values(entry.tertunda)) sumL += amount as number;
  }
  if (!Number.isFinite(sumS) || !Number.isFinite(sumL)) {
    return { status: 'tidak-valid', t, c, alasan: 'Jumlah efek atribusi tidak dapat dihitung.' };
  }

  const miConfig = balance.skor.mi;
  const mi = Math.max(miConfig.minimum, Math.min(miConfig.maksimum,
    Math.round(miConfig.pengali * (sumS - sumL) /
      (Math.abs(sumS) + Math.abs(sumL) + miConfig.offsetPenyebut))));
  if (!Number.isFinite(mi)) {
    return { status: 'tidak-valid', t, c, alasan: 'Jumlah efek atribusi tidak dapat dihitung.' };
  }
  return { status: 'siap', t, c, bintang: bintangUntuk(t, c, mi), mi };
}

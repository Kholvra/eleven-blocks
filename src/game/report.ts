import balance from '../data/balance.json';
import type { Efek, GameState, KunciMeter } from './types';

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

import type { TiketPayload } from './tiket';

export function buildTiketText(payload: TiketPayload, url?: string): string {
  const lines = [
    'Tiket Keluar',
    ...(payload.n ? [`Nama: ${payload.n}`] : []),
    `1. ${payload.t[0]}`,
    `2. ${payload.t[1]}`,
    `3. ${payload.t[2]}`,
    `Meter permainan akhir: udara ${payload.m[0]}/100, akses ${payload.m[1]}/100, hijau ${payload.m[2]}/100, warga ${payload.m[3]}/100.`,
    'Nilai memakai skala permainan, bukan ukuran kondisi kota nyata.',
  ];
  if (url) lines.push(url);
  return lines.join('\n');
}


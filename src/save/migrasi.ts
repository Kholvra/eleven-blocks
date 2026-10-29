import type { GameState } from '../game/types';

export const VERSI_STATE_TERBARU = 1;

const FASE = ['menu', 'tutorial', 'ronde', 'event', 'ringkasan', 'laporan'] as const;
const TAHAP = ['berita', 'tangan', 'resolusi', 'reaksi', 'transisi'] as const;
const METER = ['udara', 'akses', 'hijau', 'warga'] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function numberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(finite);
}

function meterValid(value: unknown): boolean {
  if (!record(value) || Object.keys(value).length !== METER.length) return false;
  return METER.every((key) => finite(value[key]) && (value[key] as number) >= 0 && (value[key] as number) <= 100);
}

function efekValid(value: unknown): boolean {
  return record(value) && Object.entries(value).every(([key, amount]) =>
    (METER as readonly string[]).includes(key) && finite(amount));
}
function attributionValid(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const rounds = new Set<number>();
  return value.every((entry) => {
    if (!record(entry) || !finite(entry.ronde) || !Number.isInteger(entry.ronde) ||
        entry.ronde < 1 || entry.ronde > 10 || rounds.has(entry.ronde) ||
        !efekValid(entry.langsung) || !efekValid(entry.tertunda)) return false;
    rounds.add(entry.ronde);
    return true;
  });
}


function stateValid(value: unknown): value is GameState {
  if (!record(value)) return false;
  if (value.versi !== 1 || typeof value.seed !== 'string' || !finite(value.rngS)) return false;
  if (!(FASE as readonly unknown[]).includes(value.fase) || !(TAHAP as readonly unknown[]).includes(value.tahapRonde)) return false;
  if (!finite(value.ronde) || value.ronde < 1 || value.ronde > 10 || !Number.isInteger(value.ronde)) return false;
  if (value.ronde < 10 && value.fase === 'laporan') return false;
  if (!finite(value.anggaran) || value.anggaran < 0 || !meterValid(value.meter)) return false;
  if (!record(value.papan) || value.papan.lebar !== 8 || value.papan.tinggi !== 8 || value.papan.selBuildable !== 24 ||
      !Array.isArray(value.papan.ubin) || value.papan.ubin.length !== 256 ||
      !value.papan.ubin.every((tile) => tile === null || finite(tile))) return false;
  if (!numberArray(value.deck) || !numberArray(value.tangan) || !numberArray(value.discard) ||
      !stringArray(value.aksiTerpakai) || !numberArray(value.milik) || !Array.isArray(value.perRondeAktif) || value.perRondeAktif.length !== 0 ||
      !stringArray(value.eventTerpakai) || !Array.isArray(value.catatan) || !Array.isArray(value.antrian)) return false;
  if (!(value.kartuCadanganACT04 === null || finite(value.kartuCadanganACT04)) ||
      !(value.kartuDimainkanRondeIni === null || typeof value.kartuDimainkanRondeIni === 'string')) return false;
  if (!(value.eventAktif === null || (record(value.eventAktif) && typeof value.eventAktif.id === 'string' &&
      (value.eventAktif.dipilih === null || typeof value.eventAktif.dipilih === 'string')))) return false;
  if (!value.antrian.every((entry) => record(entry) && finite(entry.ronde) && typeof entry.sumber === 'string' &&
      efekValid(entry.efek) &&
      (entry.rondeAsal === undefined || (finite(entry.rondeAsal) && Number.isInteger(entry.rondeAsal) && entry.rondeAsal >= 1 && entry.rondeAsal <= 10)) &&
      (entry.catatan === undefined || typeof entry.catatan === 'string') &&
      (entry.syarat === undefined || typeof entry.syarat === 'string'))) return false;
  if (value.atribusiKeputusan !== undefined && !attributionValid(value.atribusiKeputusan)) return false;
  if (!value.catatan.every((entry) => record(entry) && finite(entry.ronde) &&
      (entry.kartuIdx === null || finite(entry.kartuIdx)) && efekValid(entry.delta) && meterValid(entry.meter) && finite(entry.anggaran) &&
      (entry.eventId === undefined || typeof entry.eventId === 'string') &&
      (entry.pilihanEvent === undefined || typeof entry.pilihanEvent === 'string'))) return false;
  if (!record(value.setelan) || typeof value.setelan.audio !== 'boolean' || !finite(value.waktuSimpan)) return false;
  return true;
}

export function migrasikanSave(value: unknown): GameState | null {
  if (!record(value) || value.versi !== VERSI_STATE_TERBARU || !record(value.state)) return null;
  const source = value.state;
  const legacyTicketPhase = source.fase === 'tiket';
  if (!legacyTicketPhase && !('tiket' in source) && !('nama' in source)) {
    return stateValid(source) ? source : null;
  }
  const state = { ...source };
  if (legacyTicketPhase) state.fase = 'laporan';
  delete state.tiket;
  delete state.nama;
  return stateValid(state) ? state : null;
}

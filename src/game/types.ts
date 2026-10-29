export type Phase =
  | 'menu'
  | 'tutorial'
  | 'ronde'
  | 'event'
  | 'ringkasan'
  | 'laporan'

export type TahapRonde = 'berita' | 'tangan' | 'resolusi' | 'reaksi' | 'transisi';

export type KunciMeter = 'udara' | 'akses' | 'hijau' | 'warga';

export type Efek = Partial<Record<KunciMeter, number>>;

export interface AtribusiKeputusan {
  ronde: number;
  langsung: Efek;
  tertunda: Efek;
}

export interface GameState {
  versi: 1;
  seed: string;
  rngS: number;
  fase: Phase;
  tahapRonde: TahapRonde;
  ronde: number;
  anggaran: number;
  meter: Record<KunciMeter, number>;
  papan: {
    lebar: 8;
    tinggi: 8;
    selBuildable: 24;
    ubin: Array<number | null>;
  };
  deck: number[];
  tangan: number[];
  discard: number[];
  aksiTerpakai: string[];
  kartuCadanganACT04: number | null;
  kartuDimainkanRondeIni: string | null;
  milik: number[];
  perRondeAktif: never[];
  antrian: Array<{
    ronde: number;
    sumber: string;
    efek: Efek;
    rondeAsal?: number;
    catatan?: string;
    syarat?: string;
  }>;
  atribusiKeputusan?: AtribusiKeputusan[];
  eventAktif: { id: string; dipilih: string | null } | null;
  eventTerpakai: string[];
  catatan: Array<{
    ronde: number;
    kartuIdx: number | null;
    delta: Efek;
    meter: Record<KunciMeter, number>;
    anggaran: number;
    eventId?: string;
    pilihanEvent?: string;
  }>;
  setelan: { audio: boolean };
  waktuSimpan: number;
}

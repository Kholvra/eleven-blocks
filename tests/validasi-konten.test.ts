import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const validator = resolve('tools/validasi-konten.mjs');
const temporaryDirectories: string[] = [];

interface PolicyRecord {
  id: string;
  nama?: string;
  kategori?: string;
  biaya: number;
  deskripsi: string;
  kenapa_penting?: string;
  kondisi?: string | number;
  efek: { langsung: Record<string, number>; tertunda?: unknown[] };
  sumber: { teks: string; url: string; akses: string }[];
  [key: string]: unknown;
}

interface ActionRecord {
  id: string;
  nama?: string;
  biaya: number;
  deskripsi: string;
  kenapa_penting?: string;
  efek: { langsung: Record<string, number>; tertunda?: unknown[] };
  sumber: { teks: string; url: string; akses: string }[];
  [key: string]: unknown;
}

interface TargetFixtures {
  cards: { _meta: { mode: string }; kebijakan: PolicyRecord[] };
  actions: { _meta: { mode: string }; aksi: ActionRecord[] };
}

function dataDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'validasi-konten-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function policy(id: string, idx: number): PolicyRecord {
  return {
    id,
    idx,
    nama: `Kebijakan ${id}`,
    kategori: 'transport',
    biaya: 1,
    deskripsi: 'Deskripsi kebijakan.',
    kenapa_penting: 'Konteks kebijakan.',
    efek: { langsung: { udara: 1 } },
    sumber: [{ teks: 'Rujukan', url: 'https://example.org/rujukan', akses: '2026-10-17' }],
  };
}

function action(id: string): ActionRecord {
  return {
    id,
    nama: `Aksi ${id}`,
    biaya: 0,
    deskripsi: 'Deskripsi aksi.',
    kenapa_penting: 'Konteks aksi.',
    efek: { langsung: { hijau: 1 } },
    sumber: [{ teks: 'Rujukan', url: 'https://example.org/rujukan', akses: '2026-10-17' }],
  };
}
function writeTarget(directory: string, cards: TargetFixtures['cards'], actions: TargetFixtures['actions']): void {
  writeFileSync(join(directory, 'cards.json'), JSON.stringify(cards));
  writeFileSync(join(directory, 'actions.json'), JSON.stringify(actions));
}

function targetFixtures(): TargetFixtures {
  return {
    cards: JSON.parse(readFileSync(resolve('src/data/cards.json'), 'utf8')) as unknown as TargetFixtures['cards'],
    actions: JSON.parse(readFileSync(resolve('src/data/actions.json'), 'utf8')) as unknown as TargetFixtures['actions'],
  };
}
interface EventChoice {
  id: string;
  teks: string;
  penutup: string;
  biaya: number;
  efek: Record<string, unknown>;
  efek_kondisional?: Array<{ syarat: string; efek: Record<string, unknown> }>;
  efek_tertunda?: Array<{ setelahRonde: number; efek: Record<string, unknown>; catatan: string; syarat?: string }>;
}

interface EventFixtures {
  event: {
    id: string;
    ronde: number;
    pilihan: EventChoice[];
    [key: string]: unknown;
  }[];
}

function eventFixtures(): EventFixtures {
  return JSON.parse(readFileSync(resolve('src/data/events.json'), 'utf8')) as EventFixtures;
}

interface FactRecord {
  id: string;
  baris: number;
  nilai: string;
  satuan: string;
  arti: string;
  konteks: string;
  penerbit: string;
  tahun: string;
  akses: string;
  url: string;
  link_pendek: string;
  [key: string]: unknown;
}

interface FactFixtures {
  fakta: FactRecord[];
}


function writeEvents(directory: string, events: EventFixtures, facts?: FactFixtures): void {
  const registry = facts ?? (JSON.parse(readFileSync(resolve('src/data/fakta.json'), 'utf8')) as FactFixtures);
  writeFileSync(join(directory, 'events.json'), JSON.stringify(events));
  writeFileSync(join(directory, 'fakta.json'), JSON.stringify(registry));
}

function writeFullPackage(directory: string, events: EventFixtures, facts?: FactFixtures): void {
  const fixtures = targetFixtures();
  writeTarget(directory, fixtures.cards, fixtures.actions);
  writeEvents(directory, events, facts);
}

describe('validasi registry fakta REQ-016', () => {
  it('menolak nilai yang tidak cocok dengan baris kanonis dan menyebut ID serta baris', () => {
    const directory = dataDirectory();
    const facts = JSON.parse(readFileSync(resolve('src/data/fakta.json'), 'utf8')) as FactFixtures;
    facts.fakta.find(fact => fact.id === 'rth-jakarta')!.nilai = '5,31%';
    writeFullPackage(directory, eventFixtures(), facts);
    const result = run(directory);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('rth-jakarta');
    expect(result.stderr).toContain('baris 17');
    expect(result.stderr).toContain('nilai');
  });
  it('menolak referensi factIds yang tidak ada di registry', () => {
    const directory = dataDirectory();
    writeFullPackage(directory, eventFixtures());
    writeFileSync(join(directory, 'hud.json'), JSON.stringify({ meter: { udara: { factIds: ['fakta-tidak-ada'] } } }));
    const result = run(directory);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('fakta-tidak-ada');
    expect(result.stderr).toContain('factIds');
  });
});

describe('validasi jadwal event REQ-015', () => {
  it('menerima paket event dengan jadwal, ID, tipe, dan pilihan kanonis', () => {
    const directory = dataDirectory();
    writeFullPackage(directory, eventFixtures());
    const result = run(directory);
    expect(result.status).toBe(0);
  });

  it('menolak jadwal atau ID event yang berubah', () => {
    const cases = [
      { mutate: (events: EventFixtures) => { events.event[0].ronde = 2; }, field: 'ronde' },
      { mutate: (events: EventFixtures) => { events.event[1].id = events.event[0].id; }, field: 'id' },
    ];
    for (const { mutate, field } of cases) {
      const directory = dataDirectory();
      const events = eventFixtures();
      mutate(events);
      writeFullPackage(directory, events);
      const result = run(directory);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(field);
    }
  });

  it('menolak biaya atau jumlah pilihan interaktif yang menyimpang', () => {
    const cases = [
      { mutate: (events: EventFixtures) => { events.event[2].pilihan[0].biaya = 7; }, field: 'biaya' },
      { mutate: (events: EventFixtures) => { events.event[2].pilihan.pop(); }, field: 'pilihan' },
    ];
    for (const { mutate, field } of cases) {
      const directory = dataDirectory();
      const events = eventFixtures();
      mutate(events);
      writeFullPackage(directory, events);
      const result = run(directory);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(field);
    }
  });
  it('menolak efek kondisional yang bentuknya tidak lengkap atau efeknya tidak dikenal', () => {
    const directory = dataDirectory();
    const events = eventFixtures();
    events.event[2]!.pilihan[0]!.efek_kondisional = [{ syarat: '', efek: { tanah: 1 } }];
    writeFullPackage(directory, events);
    const result = run(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pilihan[0].efek_kondisional[0].syarat');
    expect(result.stderr).toContain('pilihan[0].efek_kondisional[0].efek');
  });
  it('menolak efek tertunda event dengan ronde jatuh tempo invalid', () => {
    const directory = dataDirectory();
    const events = eventFixtures();
    events.event[5]!.pilihan[1]!.efek_tertunda![0]!.setelahRonde = 0;
    writeFullPackage(directory, events);
    const result = run(directory);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pilihan[1].efek_tertunda[0].setelahRonde');
  });

  it('menolak syarat event yang tidak didukung resolver', () => {
    const directory = dataDirectory();
    const events = eventFixtures();
    events.event[2]!.pilihan[0]!.efek_kondisional![0]!.syarat = 'K07 atau K08 ada';
    writeFullPackage(directory, events);
    const result = run(directory);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pilihan[0].efek_kondisional[0].syarat');
  });
  it('menolak syarat tertunda event yang tidak didukung resolver', () => {
    const directory = dataDirectory();
    const events = eventFixtures();
    events.event[5]!.pilihan[1]!.efek_tertunda![0]!.syarat = 'K07 atau K08 ada';
    writeFullPackage(directory, events);
    const result = run(directory);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pilihan[1].efek_tertunda[0].syarat');
  });



  it('menolak pilihan pada event naratif', () => {
    const directory = dataDirectory();
    const events = eventFixtures();
    events.event[0].pilihan.push({ id: 'tambahan', teks: 'Tambahan', penutup: 'Selesai', biaya: 0, efek: {} });
    writeFullPackage(directory, events);
    const result = run(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pilihan');
  });
});
function run(directory: string, ...args: string[]) {
  return spawnSync(process.execPath, [validator, '--data-dir', directory, ...args], { encoding: 'utf8' });
}


describe('validasi konten kartu REQ-014', () => {
  it('accepts complete target policy and action inventories in cards-only mode', () => {
    const directory = dataDirectory();
    const { cards, actions } = targetFixtures();
    writeTarget(directory, cards, actions);
    const result = run(directory, '--cards-only');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('cards.json');
    expect(result.stdout).toContain('actions.json');
  });

  it('accepts policy with optional non-empty kondisi and actual action shape', () => {
    const directory = dataDirectory();
    const { cards, actions } = targetFixtures();
    cards.kebijakan[0].kondisi = 'Jika anggaran tersedia';
    writeTarget(directory, cards, actions);
    expect(run(directory, '--cards-only').status).toBe(0);
  });

  it('accepts omitted delayed effects and a valid syarat', () => {
    const directory = dataDirectory();
    const { cards, actions } = targetFixtures();
    delete cards.kebijakan[0].efek.tertunda;
    cards.kebijakan[1].efek.tertunda = [{ setelahRonde: 2, efek: { warga: 1 }, catatan: 'Manfaat berlanjut.', syarat: 'Jika disepakati' }];
    writeTarget(directory, cards, actions);
    expect(run(directory, '--cards-only').status).toBe(0);
  });

  it('rejects malformed delayed syarat and numeric source claims absent from the registry', () => {
    const directory = dataDirectory();
    const { cards, actions } = targetFixtures();
    cards.kebijakan[0].efek.tertunda = [{ setelahRonde: 2, efek: { warga: 1 }, catatan: 'Manfaat berlanjut.', syarat: '' }];
    cards.kebijakan[1].sumber[0].teks = 'Klaim 987654% tidak terdaftar.';
    writeTarget(directory, cards, actions);
    const result = run(directory, '--cards-only');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('syarat');
    expect(result.stderr).toContain('987654');
  });

  it('rejects an action missing nama and kenapa_penting', () => {
    const directory = dataDirectory();
    const { cards, actions } = targetFixtures();
    delete actions.aksi[0].nama;
    delete actions.aksi[0].kenapa_penting;
    writeTarget(directory, cards, actions);
    const result = run(directory, '--cards-only');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nama');
    expect(result.stderr).toContain('kenapa_penting');
  });

  it('rejects action penempatan and empty or non-string policy kondisi', () => {
    for (const kondisi of ['', 42]) {
      const directory = dataDirectory();
      const { cards, actions } = targetFixtures();
      cards.kebijakan[0].kondisi = kondisi;
      (actions.aksi[0] as ActionRecord & { penempatan?: unknown }).penempatan = {};
      writeTarget(directory, cards, actions);
      const result = run(directory, '--cards-only');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('kondisi');
      expect(result.stderr).toContain('penempatan');
    }
  });

  it('rejects incorrect IDs and missing required fields with diagnostics', () => {
    const directory = dataDirectory();
    const { cards, actions } = targetFixtures();
    cards.kebijakan[0].id = 'K99';
    delete cards.kebijakan[0].nama;
    writeTarget(directory, cards, actions);
    const result = run(directory, '--cards-only');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('id');
    expect(result.stderr).toContain('nama');
  });

  it('rejects duplicate policy IDs without changing inventory length or idx values', () => {
    const directory = dataDirectory();
    const { cards, actions } = targetFixtures();
    const originalLength = cards.kebijakan.length;
    const originalIndices = cards.kebijakan.map(({ idx }) => idx);
    cards.kebijakan[1].id = cards.kebijakan[0].id;
    expect(cards.kebijakan).toHaveLength(originalLength);
    expect(cards.kebijakan.map(({ idx }) => idx)).toEqual(originalIndices);
    writeTarget(directory, cards, actions);
    const result = run(directory, '--cards-only');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('id');
  });

  it('rejects malformed source URLs with a field-specific diagnostic', () => {
    const directory = dataDirectory();
    const { cards, actions } = targetFixtures();
    cards.kebijakan[0].sumber[0].url = 'not-a-url';
    writeTarget(directory, cards, actions);
    const result = run(directory, '--cards-only');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sumber[0].url');
  });

  it('keeps the default full gate closed when events and facts are absent', () => {
    const directory = dataDirectory();
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'cards.json'), JSON.stringify({ kebijakan: [], aksi: [] }));
    const result = run(directory);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('events.json');
    expect(result.stderr).toContain('fakta.json');
  });
});

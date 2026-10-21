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

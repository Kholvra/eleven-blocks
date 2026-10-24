#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eventConditionRules = JSON.parse(readFileSync(join(root, 'src/data/event-conditions.json'), 'utf8'));
const meters = new Set(['udara', 'akses', 'hijau', 'warga']);
const categories = new Set(['transport', 'tata-guna-lahan', 'air', 'sampah', 'hijau', 'energi', 'permukiman', 'ekonomi']);
const numericTokenPattern = /\b\d+(?:[.,]\d+)?%?\b/g;
const errors = [];
let registryNumbers;
let dataDirectory = join(root, 'src/data');
let dataLabel = 'src/data';
let cardsOnly = false;
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--cards-only') {
    cardsOnly = true;
    continue;
  }
  if (process.argv[index] !== '--data-dir' || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) {
    console.error('Penggunaan: node tools/validasi-konten.mjs [--cards-only] [--data-dir <path>]');
    process.exit(2);
  }
  dataDirectory = resolve(process.cwd(), process.argv[index + 1]);
  dataLabel = relative(process.cwd(), dataDirectory) || '.';
  index += 1;
}

function fail(file, field, detail, idx) {
  const identity = idx === undefined ? '' : ` (idx ${String(idx)})`;
  errors.push(`${file}: ${field}${identity}: ${detail}`);
}

function loadJson(filename) {
  const path = join(dataDirectory, filename);
  const label = `${dataLabel}/${basename(filename)}`;
  if (!existsSync(path)) {
    fail(label, '$', 'berkas wajib tidak ditemukan');
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const location = Number.isInteger(error?.lineNumber) ? ` baris ${error.lineNumber}` : '';
    fail(label, '$', `JSON tidak valid${location}: ${error.message}`);
    return null;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(record, field, file, idx) {
  if (typeof record?.[field] !== 'string' || record[field].trim() === '') {
    fail(file, field, 'wajib berupa teks yang tidak kosong', idx);
  }
}

function numericTokens(text) {
  return text.match(numericTokenPattern) ?? [];
}

function loadRegistryNumbers(file, field, idx) {
  if (registryNumbers) return registryNumbers;
  const registryFile = 'docs/game/04-angka-dan-sumber.md';
  const path = join(root, registryFile);
  if (!existsSync(path)) {
    fail(file, field, `${registryFile} §1 tidak dapat dibaca untuk pemeriksaan klaim angka`, idx);
    registryNumbers = new Set();
    return registryNumbers;
  }
  const content = readFileSync(path, 'utf8');
  const start = content.match(/^## 1\..*$/m)?.index ?? -1;
  const end = start < 0 ? -1 : content.indexOf('\n## ', start + 1);
  if (start < 0) {
    fail(file, field, `${registryFile} §1 tidak ditemukan untuk pemeriksaan klaim angka`, idx);
    registryNumbers = new Set();
  } else {
    const section = content.slice(start, end < 0 ? undefined : end);
    registryNumbers = new Set(numericTokens(section));
  }
  return registryNumbers;
}

function validateNumericClaims(record, file, idx) {
  const whyTokens = numericTokens(typeof record.kenapa_penting === 'string' ? record.kenapa_penting : '');
  const sourceTexts = Array.isArray(record.sumber) ? record.sumber.map(source => source?.teks).filter(text => typeof text === 'string') : [];
  if (whyTokens.length) {
    const citedTokens = new Set(sourceTexts.flatMap(numericTokens));
    for (const token of whyTokens) {
      if (!citedTokens.has(token)) fail(file, 'kenapa_penting', `token angka "${token}" tidak tercantum dalam teks sumber record ini`, idx);
    }
  }
  sourceTexts.forEach((text, sourceIndex) => {
    const tokens = numericTokens(text);
    if (!tokens.length) return;
    const allowed = loadRegistryNumbers(file, `sumber[${sourceIndex}].teks`, idx);
    for (const token of tokens) {
      if (!allowed.has(token)) fail(file, `sumber[${sourceIndex}].teks`, `token angka "${token}" tidak ditemukan di docs/game/04-angka-dan-sumber.md §1`, idx);
    }
  });
}
function validateSources(record, file, idx) {
  if (!Array.isArray(record?.sumber) || record.sumber.length === 0) {
    fail(file, 'sumber', 'wajib berupa array dengan minimal satu sumber', idx);
    return;
  }
  record.sumber.forEach((source, sourceIndex) => {
    const field = `sumber[${sourceIndex}]`;
    if (!isObject(source)) {
      fail(file, field, 'wajib berupa objek', idx);
      return;
    }
    requiredString(source, 'teks', file, idx);
    if (typeof source.url !== 'string' || !/^https?:\/\//i.test(source.url)) {
      fail(file, `${field}.url`, 'wajib diawali http:// atau https://', idx);
    } else {
      try {
        const url = new URL(source.url);
        if (!url.hostname) fail(file, `${field}.url`, 'URL harus memiliki host', idx);
      } catch {
        fail(file, `${field}.url`, 'format URL tidak valid', idx);
      }
    }
    if (typeof source.akses !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.akses) || !validDate(source.akses)) {
      fail(file, `${field}.akses`, 'wajib berupa tanggal valid berformat YYYY-MM-DD', idx);
    }
  });
}

function validateEventCondition(syarat, file, field, idx, eventId) {
  if (typeof syarat !== 'string' || syarat.trim() === '') {
    fail(file, field, 'wajib berupa teks yang tidak kosong', idx);
  } else if (!(eventConditionRules[eventId] ?? []).some((rule) => rule.syarat === syarat)) {
    fail(file, field, `syarat tidak didukung untuk event ${eventId}`, idx);
  }
}
function validateDelayed(effects, file, field, idx, eventId) {
  if (effects === undefined) return;
  if (!Array.isArray(effects)) {
    fail(file, field, 'wajib berupa array', idx);
    return;
  }
  effects.forEach((entry, position) => {
    const entryField = `${field}[${position}]`;
    if (!isObject(entry)) {
      fail(file, entryField, 'wajib berupa objek', idx);
      return;
    }
    if (!Number.isInteger(entry.setelahRonde) || entry.setelahRonde < 1 || entry.setelahRonde > 6) {
      fail(file, `${entryField}.setelahRonde`, 'wajib berupa bilangan bulat 1..6', idx);
    }
    validateEffect(entry.efek, file, `${entryField}.efek`, idx);
    requiredString(entry, 'catatan', file, idx);
    if (entry.syarat !== undefined) validateEventCondition(entry.syarat, file, `${entryField}.syarat`, idx, eventId);
    for (const key of Object.keys(entry)) {
      if (!['setelahRonde', 'efek', 'catatan', 'syarat'].includes(key)) fail(file, `${entryField}.${key}`, 'kunci tertunda tidak dikenal', idx);
    }
  });
}

function validateConditionalEffects(effects, file, field, idx, eventId) {
  if (effects === undefined) return;
  if (!Array.isArray(effects)) {
    fail(file, field, 'wajib berupa array', idx);
    return;
  }
  effects.forEach((entry, position) => {
    const entryField = `${field}[${position}]`;
    if (!isObject(entry)) {
      fail(file, entryField, 'wajib berupa objek', idx);
      return;
    }
    validateEventCondition(entry.syarat, file, `${entryField}.syarat`, idx, eventId);
    validateEffect(entry.efek, file, `${entryField}.efek`, idx);
    for (const key of Object.keys(entry)) {
      if (!['syarat', 'efek'].includes(key)) fail(file, `${entryField}.${key}`, 'kunci efek kondisional tidak dikenal', idx);
    }
  });
}

function validDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateEffect(effect, file, field, idx) {
  if (!isObject(effect)) {
    fail(file, field, 'wajib berupa objek efek', idx);
    return;
  }
  for (const [key, amount] of Object.entries(effect)) {
    if (key === 'perRonde') {
      fail(file, `${field}.perRonde`, 'efek per ronde/pasif dilarang', idx);
      continue;
    }
    if (!meters.has(key) && key !== 'anggaran') {
      if (!key.startsWith('_')) fail(file, `${field}.${key}`, 'kunci meter/efek tidak dikenal', idx);
      continue;
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < -15 || amount > 15) {
      fail(file, `${field}.${key}`, 'nilai efek wajib berupa angka dalam rentang -15..+15', idx);
    }
  }
}


function validateTargetMeta(data, file, collection) {
  if (!isObject(data)) {
    fail(file, '$', 'akar JSON wajib berupa objek', undefined);
    return false;
  }
  if (!isObject(data._meta) || data._meta.mode !== 'target') {
    fail(file, '_meta.mode', "wajib bernilai 'target'", undefined);
  } else if (Object.keys(data._meta).some(key => key !== 'mode')) {
    fail(file, '_meta', 'hanya field mode yang diizinkan', undefined);
  }
  for (const key of Object.keys(data)) {
    if (key !== '_meta' && key !== collection) fail(file, key, `kunci akar tidak dikenal; yang diizinkan _meta dan ${collection}`, undefined);
  }
  return true;
}

function validateTargetEffect(effect, file, field, idx) {
  if (!isObject(effect)) {
    fail(file, field, 'wajib berupa objek efek', idx);
    return;
  }
  for (const key of Object.keys(effect)) {
    if (key === 'perRonde') fail(file, `${field}.perRonde`, 'efek per ronde/pasif dilarang', idx);
    else if (!meters.has(key)) fail(file, `${field}.${key}`, 'kunci meter/efek tidak dikenal', idx);
    else {
      const amount = effect[key];
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < -15 || amount > 15) {
        fail(file, `${field}.${key}`, 'nilai efek wajib berupa angka dalam rentang -15..+15', idx);
      }
    }
  }
}

function validateTargetDelayed(effects, file, field, idx) {
  if (effects === undefined) return;
  if (!Array.isArray(effects)) {
    fail(file, field, 'wajib berupa array', idx);
    return;
  }
  effects.forEach((entry, position) => {
    const entryField = `${field}[${position}]`;
    if (!isObject(entry)) {
      fail(file, entryField, 'wajib berupa objek', idx);
      return;
    }
    if (!Number.isInteger(entry.setelahRonde) || entry.setelahRonde < 1 || entry.setelahRonde > 6) {
      fail(file, `${entryField}.setelahRonde`, 'wajib berupa bilangan bulat 1..6', idx);
    }
    validateTargetEffect(entry.efek, file, `${entryField}.efek`, idx);
    requiredString(entry, 'catatan', file, idx);
    if (entry.syarat !== undefined) requiredString(entry, 'syarat', file, idx);
    for (const key of Object.keys(entry)) {
      if (!['setelahRonde', 'efek', 'catatan', 'syarat'].includes(key)) fail(file, `${entryField}.${key}`, 'kunci tertunda tidak dikenal', idx);
    }
  });
}
function validateTargetRecord(record, file, expectedId, expectedIdx) {
  const idx = record?.idx ?? expectedId;
  if (!isObject(record)) {
    fail(file, expectedId, 'setiap kartu wajib berupa objek', idx);
    return;
  }
  if (record.id !== expectedId) fail(file, 'id', `urutan wajib ${expectedId}; ditemukan ${String(record.id)}`, idx);
  if (expectedIdx !== undefined && record.idx !== expectedIdx) {
    fail(file, 'idx', `wajib ${expectedIdx} sesuai urutan kartu`, idx);
  }
  for (const field of ['nama', 'deskripsi', 'kenapa_penting']) requiredString(record, field, file, idx);
  if (expectedIdx !== undefined) {
    requiredString(record, 'kategori', file, idx);
    if (!categories.has(record.kategori)) fail(file, 'kategori', 'kategori tidak dikenal', idx);
    if (record.kondisi !== undefined) requiredString(record, 'kondisi', file, idx);
  }
  if (typeof record.biaya !== 'number' || !Number.isInteger(record.biaya) || record.biaya < 0) {
    fail(file, 'biaya', 'wajib berupa bilangan bulat non-negatif (poin abstrak)', idx);
  }
  if (!isObject(record.efek)) {
    fail(file, 'efek', 'wajib berupa objek', idx);
  } else {
    validateTargetEffect(record.efek.langsung, file, 'efek.langsung', idx);
    validateTargetDelayed(record.efek.tertunda, file, 'efek.tertunda', idx);
    for (const key of Object.keys(record.efek)) {
      if (!['langsung', 'tertunda'].includes(key)) fail(file, `efek.${key}`, 'kunci efek tidak dikenal', idx);
    }
  }
  if (Array.isArray(record.sumber)) {
    record.sumber.forEach((source, sourceIndex) => {
      if (!isObject(source)) return;
      for (const key of Object.keys(source)) {
        if (!['teks', 'url', 'akses'].includes(key)) {
          fail(file, `sumber[${sourceIndex}].${key}`, 'field sumber tidak dikenal', idx);
        }
      }
    });
  }
  validateSources(record, file, idx);
  validateNumericClaims(record, file, idx);
  const allowedFields = expectedIdx === undefined
    ? ['id', 'nama', 'biaya', 'deskripsi', 'kenapa_penting', 'efek', 'sumber']
    : ['id', 'idx', 'nama', 'kategori', 'kondisi', 'biaya', 'deskripsi', 'kenapa_penting', 'efek', 'sumber'];
  for (const key of Object.keys(record)) {
    if (!allowedFields.includes(key)) fail(file, key, 'field kartu tidak dikenal', idx);
  }
}

function validateTargetInventory(data, file, collection, prefix, count, hasIdx) {
  if (!validateTargetMeta(data, file, collection)) return;
  if (!Array.isArray(data[collection])) {
    fail(file, collection, 'wajib berupa array', undefined);
    return;
  }
  const records = data[collection];
  if (records.length !== count) fail(file, collection, `wajib tepat ${count} kartu; ditemukan ${records.length}`, undefined);
  const seen = new Set();
  records.forEach((record, position) => {
    const expectedId = `${prefix}${String(position + 1).padStart(2, '0')}`;
    const idx = record?.idx ?? expectedId;
    if (record?.id !== undefined) {
      if (seen.has(record.id)) fail(file, 'id', 'id kartu harus unik', idx);
      seen.add(record.id);
    }
    validateTargetRecord(record, file, expectedId, hasIdx ? position + 1 : undefined);
  });
}

function validateTargetPackage() {
  validateTargetInventory(loadJson('cards.json'), `${dataLabel}/cards.json`, 'kebijakan', 'K', 19, true);
  validateTargetInventory(loadJson('actions.json'), `${dataLabel}/actions.json`, 'aksi', 'ACT', 4, false);
}

const expectedEventSchedule = [
  ['E04', 'naratif'],
  ['E05', 'naratif'],
  ['E01', 'interaktif'],
  ['E06', 'naratif'],
  ['E07', 'naratif'],
  ['E02', 'interaktif'],
  ['E08', 'naratif'],
  ['E09', 'naratif'],
  ['E03', 'interaktif'],
  ['E10', 'naratif'],
];
const expectedChoiceContracts = {
  E01: { ids: ['posko_siaga', 'gotong_royong', 'evakuasi'], costs: [8, 2, 5] },
  E02: { ids: ['dialog', 'tertibkan', 'tunda'], costs: [4, 2, 0] },
  E03: { ids: ['walking_bus', 'tambah_lajur', 'pasrah'], costs: [3, 10, 0] },
};

function validateEvents(data, file) {
  if (!isObject(data) || !Array.isArray(data.event)) {
    fail(file, 'event', 'akar JSON wajib memuat array event', undefined);
    return;
  }
  if (data.event.length !== 10) fail(file, 'event', `wajib tepat 10 record; ditemukan ${data.event.length}`, undefined);
  const ids = new Set();
  const rounds = new Set();
  const interactiveRounds = new Set();
  data.event.forEach((event, position) => {
    const idx = event?.id ?? position + 1;
    if (!isObject(event)) {
      fail(file, 'event', 'setiap record wajib berupa objek', idx);
      return;
    }
    const [expectedId, expectedType] = expectedEventSchedule[position] ?? [];
    if (event.id !== expectedId) fail(file, 'id', `urutan wajib ${expectedId}; ditemukan ${String(event.id)}`, idx);
    if (event.jenis !== expectedType) fail(file, 'jenis', `wajib ${expectedType} untuk ${expectedId}`, idx);
    if (event.ronde !== position + 1) fail(file, 'ronde', `wajib ${position + 1} sesuai urutan event`, idx);
    for (const field of ['id', 'judul', 'jenis', 'narasi', 'kenapa_penting']) requiredString(event, field, file, idx);
    if (event.id === 'E01' || event.id === 'E02' || event.id === 'E03') {
      requiredString(event, 'jika_semua_pilihan_tidak_terjangkau', file, idx);
    }
    if (event.id && ids.has(event.id)) fail(file, 'id', 'id event harus unik', idx);
    if (event.id) ids.add(event.id);
    if (Number.isInteger(event.ronde)) rounds.add(event.ronde);
    if (!['interaktif', 'naratif'].includes(event.jenis)) fail(file, 'jenis', 'hanya mendukung interaktif atau naratif', idx);
    if (!Number.isInteger(event.ronde) || event.ronde < 1 || event.ronde > 10) fail(file, 'ronde', 'wajib berupa bilangan bulat 1..10', idx);
    if (!Array.isArray(event.pilihan)) fail(file, 'pilihan', 'wajib berupa array (gunakan [] untuk event naratif)', idx);
    else {
      const contract = expectedChoiceContracts[event.id];
      if (contract && event.pilihan.length !== 3) fail(file, 'pilihan', `event ${event.id} wajib tepat 3 pilihan`, idx);
      if (!contract && event.pilihan.length !== 0) fail(file, 'pilihan', 'event naratif wajib memiliki pilihan kosong', idx);
      const choiceIds = new Set();
      event.pilihan.forEach((choice, position) => {
        const field = `pilihan[${position}]`;
        if (!isObject(choice)) {
          fail(file, field, 'wajib berupa objek', idx);
          return;
        }
        for (const key of ['id', 'teks', 'penutup']) requiredString(choice, key, file, idx);
        if (choice.id && choiceIds.has(choice.id)) fail(file, `${field}.id`, 'id pilihan harus unik dalam event', idx);
        if (choice.id) choiceIds.add(choice.id);
        if (contract && contract.ids[position] !== choice.id) fail(file, `${field}.id`, `wajib ${contract.ids[position]} untuk ${event.id}`, idx);
        if (!Number.isInteger(choice.biaya) || choice.biaya < 0) fail(file, `${field}.biaya`, 'wajib berupa bilangan bulat non-negatif (poin abstrak)', idx);
        if (contract && contract.costs[position] !== choice.biaya) fail(file, `${field}.biaya`, `wajib ${contract.costs[position]} untuk ${event.id}`, idx);
        validateEffect(choice.efek, file, `${field}.efek`, idx);
        if (choice.efek_tertunda !== undefined) validateDelayed(choice.efek_tertunda, file, `${field}.efek_tertunda`, idx, event.id);
        if (choice.efek_kondisional !== undefined) validateConditionalEffects(choice.efek_kondisional, file, `${field}.efek_kondisional`, idx, event.id);
      });
    }
    validateSources(event, file, idx);
  });
}

function canonicalFactRows(file) {
  const canonicalFile = 'docs/game/04-angka-dan-sumber.md';
  const path = join(root, canonicalFile);
  if (!existsSync(path)) {
    fail(file, 'baris', `${canonicalFile} §1 tidak dapat dibaca untuk pencocokan fakta`, undefined);
    return null;
  }
  const content = readFileSync(path, 'utf8');
  const start = content.match(/^## 1\..*$/m)?.index ?? -1;
  const end = start < 0 ? -1 : content.indexOf('\n## ', start + 1);
  if (start < 0) {
    fail(file, 'baris', `${canonicalFile} §1 tidak ditemukan untuk pencocokan fakta`, undefined);
    return null;
  }
  const section = content.slice(start, end < 0 ? undefined : end);
  const rows = new Map();
  for (const line of section.split('\n')) {
    const match = line.match(/^\|\s*(\d+)\s*\|(.+)\|\s*$/);
    if (!match) continue;
    const cells = match[2].split('|').map(cell => cell.trim());
    if (cells.length >= 6) rows.set(Number(match[1]), cells);
  }
  const indexStart = content.match(/^## 9\..*$/m)?.index ?? -1;
  const index = indexStart < 0 ? '' : content.slice(indexStart);
  return { rows, index };
}

function validateFactReferences(facts) {
  const knownIds = new Set(facts.filter(isObject).map(fact => fact.id).filter(id => typeof id === 'string'));
  const visit = directory => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'fakta.json') {
        let content;
        try {
          content = JSON.parse(readFileSync(path, 'utf8'));
        } catch {
          continue;
        }
        const scan = (value, location = '$') => {
          if (Array.isArray(value)) {
            value.forEach((item, index) => scan(item, `${location}[${index}]`));
          } else if (isObject(value)) {
            for (const [key, child] of Object.entries(value)) {
              if (key === 'factIds') {
                if (!Array.isArray(child)) {
                  fail(relative(root, path), `${location}.factIds`, 'wajib berupa daftar ID fakta', undefined);
                } else {
                  child.forEach((id, index) => {
                    if (typeof id !== 'string' || !knownIds.has(id)) {
                      fail(relative(root, path), `${location}.factIds[${index}]`, `ID fakta tidak dikenal "${String(id)}"`, id);
                    }
                  });
                }
              } else {
                scan(child, `${location}.${key}`);
              }
            }
          }
        };
        scan(content);
      }
    }
  };
  visit(dataDirectory);
}

function validateFacts(data, file) {
  if (!isObject(data) || !Array.isArray(data.fakta)) {
    fail(file, 'fakta', 'akar JSON wajib memuat array fakta', undefined);
    return;
  }
  const canonical = canonicalFactRows(file);
  const ids = new Set();
  data.fakta.forEach((fact, position) => {
    const factId = fact?.id ?? `(record ${position + 1})`;
    const rowNumber = fact?.baris;
    const idx = factId;
    if (!isObject(fact)) {
      fail(file, 'fakta', 'setiap record wajib berupa objek', idx);
      return;
    }
    if (typeof fact.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fact.id)) {
      fail(file, 'id', `fakta ${fact.id} baris ${String(rowNumber)}: wajib berupa ID kebab-case yang tidak kosong`, idx);
    } else if (ids.has(fact.id)) {
      fail(file, 'id', `fakta ${fact.id} baris ${String(rowNumber)}: id fakta harus unik`, idx);
    } else {
      ids.add(fact.id);
    }
    for (const field of ['nilai', 'satuan', 'arti', 'konteks', 'penerbit', 'tahun', 'url', 'link_pendek']) {
      if (typeof fact[field] !== 'string' || fact[field].trim() === '') {
        fail(file, field, `fakta ${fact.id} baris ${String(rowNumber)}: wajib berupa teks yang tidak kosong`, idx);
      }
    }
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 28) {
      fail(file, 'baris', `fakta ${fact.id} baris ${String(rowNumber)}: wajib berupa nomor baris kanonis 1–28`, idx);
    }
    if (typeof fact.akses !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fact.akses) || !validDate(fact.akses)) {
      fail(file, 'akses', `fakta ${fact.id} baris ${String(rowNumber)}: wajib berupa tanggal ISO valid YYYY-MM-DD`, idx);
    } else if (fact.akses !== '2026-10-17') {
      fail(file, 'akses', `fakta ${fact.id} baris ${String(rowNumber)}: tanggal akses harus sesuai kanon 2026-10-17`, idx);
    }
    if (typeof fact.url !== 'string' || !/^https?:\/\//i.test(fact.url)) {
      fail(file, 'url', `fakta ${fact.id} baris ${String(rowNumber)}: wajib berupa URL sumber lengkap`, idx);
    } else {
      try {
        if (!new URL(fact.url).hostname) fail(file, 'url', `fakta ${fact.id} baris ${String(rowNumber)}: URL harus memiliki host`, idx);
      } catch {
        fail(file, 'url', `fakta ${fact.id} baris ${String(rowNumber)}: format URL tidak valid`, idx);
      }
    }
    if (typeof fact.link_pendek === 'string' && /^https?:\/\//i.test(fact.link_pendek.trim())) {
      fail(file, 'link_pendek', `fakta ${fact.id} baris ${String(rowNumber)}: gunakan label tautan, bukan URL lengkap`, idx);
    }

    const canonicalRow = canonical?.rows.get(rowNumber);
    if (!canonicalRow) {
      fail(file, 'baris', `fakta ${fact.id} baris ${String(rowNumber)}: tidak ada sebagai baris tabel dalam docs/game/04-angka-dan-sumber.md §1`, idx);
      return;
    }
    const [canonicalName, canonicalValue, canonicalUnit, canonicalContext, canonicalSource] = canonicalRow;
    const mappingError = field => fail(file, field, `fakta ${fact.id} baris ${String(rowNumber)}: nilai tidak cocok dengan baris kanonis #${rowNumber}`, idx);
    if (fact.nilai !== canonicalValue) mappingError('nilai');
    if (fact.satuan !== canonicalUnit) mappingError('satuan');
    if (typeof fact.penerbit === 'string' && !canonicalSource.includes(fact.penerbit)) {
      fail(file, 'penerbit', `fakta ${fact.id} baris ${String(rowNumber)}: penerbit tidak cocok dengan sumber kanonis #${rowNumber}`, idx);
    }
    const canonicalYearText = `${canonicalName} ${canonicalValue} ${canonicalUnit} ${canonicalSource}`;
    const yearIsListed = canonicalYearText.includes(fact.tahun);
    if (typeof fact.tahun === 'string' && fact.tahun !== 'Tidak dicantumkan' && !yearIsListed) {
      fail(file, 'tahun', `fakta ${fact.id} baris ${String(rowNumber)}: tahun tidak tercantum pada nilai, satuan, atau sumber kanonis #${rowNumber}`, idx);
    }
    const canonicalYears = canonicalYearText.match(/\b(?:19|20)\d{2}\b/g) ?? [];
    const dataYears = canonicalYears.filter(year => !new RegExp(`(?:target|pada)\\s+${year}`).test(canonicalValue));
    if (fact.tahun === 'Tidak dicantumkan' && dataYears.length > 0) {
      fail(file, 'tahun', `fakta ${fact.id} baris ${String(rowNumber)}: tahun data tercantum pada baris kanonis #${rowNumber}`, idx);
    }
    const publisherKey = typeof fact.penerbit === 'string' ? fact.penerbit.split(' (')[0] : '';
    const sourceIndexLine = canonical?.index.split('\n').find(line => line.startsWith('|') && line.includes(publisherKey));
    const sourceUrls = canonicalSource.match(/https?:\/\/[^\s|]+/g) ?? [];
    if (sourceUrls.length === 0 && sourceIndexLine) sourceUrls.push(...(sourceIndexLine.match(/https?:\/\/[^\s|]+/g) ?? []));
    if (typeof fact.url === 'string' && !sourceUrls.includes(fact.url)) {
      fail(file, 'url', `fakta ${fact.id} baris ${String(rowNumber)}: URL tidak cocok dengan sumber kanonis #${rowNumber}`, idx);
    }
  });
  validateFactReferences(data.fakta);
}

if (cardsOnly) {
  validateTargetPackage();
} else {
  validateTargetPackage();
  validateEvents(loadJson('events.json'), `${dataLabel}/events.json`);
  validateFacts(loadJson('fakta.json'), `${dataLabel}/fakta.json`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`Validasi konten gagal: ${error}`);
  process.exitCode = 1;
} else {
  console.log(cardsOnly
    ? 'Validasi konten berhasil: cards.json dan actions.json valid.'
    : 'Validasi konten berhasil: cards.json, actions.json, events.json, dan fakta.json valid.');
}


#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const meters = new Set(['udara', 'akses', 'hijau', 'warga']);
const errors = [];
let dataDirectory = join(root, 'src/data');
let dataLabel = 'src/data';
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] !== '--data-dir' || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) {
    console.error('Penggunaan: node tools/validasi-konten.mjs [--data-dir <path>]');
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

function validateDelayed(effects, file, field, idx) {
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
  });
}

function validateCard(card, file, idx) {
  if (!isObject(card)) {
    fail(file, '$', 'setiap kartu wajib berupa objek', idx);
    return;
  }
  for (const field of ['id', 'nama', 'kategori', 'deskripsi', 'kenapa_penting']) requiredString(card, field, file, idx);
  if (typeof card.biaya !== 'number' || !Number.isFinite(card.biaya) || card.biaya < 0) {
    fail(file, 'biaya', 'wajib berupa angka non-negatif (poin abstrak)', idx);
  }
  if (!isObject(card.efek)) fail(file, 'efek', 'wajib berupa objek', idx);
  else {
    validateEffect(card.efek.langsung, file, 'efek.langsung', idx);
    if (card.efek.tertunda !== undefined) validateDelayed(card.efek.tertunda, file, 'efek.tertunda', idx);
    if (Object.hasOwn(card.efek, 'perRonde')) fail(file, 'efek.perRonde', 'efek per ronde/pasif dilarang', idx);
  }
  if (card.horizon_note !== undefined) {
    if (!isObject(card.horizon_note)) fail(file, 'horizon_note', 'wajib berupa objek', idx);
    else for (const key of Object.keys(card.horizon_note)) {
      if (!['r1', 'r5', 'r10'].includes(key) && !key.startsWith('_')) fail(file, `horizon_note.${key}`, 'kunci yang diizinkan hanya r1, r5, r10', idx);
      else if (!key.startsWith('_')) requiredString(card.horizon_note, key, file, idx);
    }
  }
  if (card.penempatan !== undefined && isObject(card.penempatan) && card.penempatan.aset3d !== undefined) {
    const asset = card.penempatan.aset3d;
    if (typeof asset !== 'string' || asset.trim() === '') fail(file, 'penempatan.aset3d', 'wajib berupa nama aset', idx);
    else {
      const assetPath = join(root, 'src/assets/3d', `${asset}.glb`);
      if (!existsSync(assetPath)) fail(file, 'penempatan.aset3d', `GLB tidak ditemukan: src/assets/3d/${asset}.glb`, idx);
    }
  }
  validateSources(card, file, idx);
}

function validateCards(data, file) {
  if (!isObject(data)) {
    fail(file, '$', 'akar JSON wajib berupa objek', undefined);
    return;
  }
  const policies = Array.isArray(data.kebijakan) ? data.kebijakan : data.kartu;
  const actionCards = data.aksi;
  if (!Array.isArray(policies)) fail(file, 'kebijakan/kartu', 'wajib berupa array kartu kebijakan', undefined);
  if (!Array.isArray(actionCards)) fail(file, 'aksi', 'wajib berupa array kartu aksi', undefined);
  const policyCards = Array.isArray(policies) ? policies : [];
  const actionEntries = Array.isArray(actionCards) ? actionCards : [];
  if (policyCards.length !== 19) fail(file, 'kebijakan/kartu', `wajib tepat 19 kartu kebijakan; ditemukan ${policyCards.length}`, undefined);
  if (actionEntries.length !== 4) fail(file, 'aksi', `wajib tepat 4 kartu aksi; ditemukan ${actionEntries.length}`, undefined);
  const seen = new Set();
  const cardIds = new Set();
  for (const [kind, entries] of [['kebijakan', policyCards], ['aksi', actionEntries]]) {
    entries.forEach((card, position) => {
      const idx = card?.idx ?? `${kind}-${position + 1}`;
      if (card?.id && cardIds.has(card.id)) fail(file, 'id', 'id kartu harus unik', idx);
      if (card?.id) cardIds.add(card.id);
      if (kind === 'kebijakan') {
        if (!Number.isInteger(card?.idx) || card.idx < 1 || card.idx > 19) fail(file, 'idx', 'kartu kebijakan wajib memiliki idx bilangan bulat 1..19', idx);
        else if (seen.has(card.idx)) fail(file, 'idx', 'nilai idx kartu kebijakan harus unik', card.idx);
        else seen.add(card.idx);
      }
      validateCard(card, file, idx);
    });
  }
}

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
    for (const field of ['id', 'judul', 'jenis', 'narasi', 'kenapa_penting', 'jika_semua_pilihan_tidak_terjangkau']) requiredString(event, field, file, idx);
    if (ids.has(event.id)) fail(file, 'id', 'id event harus unik', idx);
    if (event.id) ids.add(event.id);
    if (Number.isInteger(event.ronde)) {
      if (rounds.has(event.ronde)) fail(file, 'ronde', 'ronde event harus unik', idx);
      rounds.add(event.ronde);
    }
    if (!['interaktif', 'naratif'].includes(event.jenis)) fail(file, 'jenis', 'hanya mendukung interaktif atau naratif', idx);
    if (event.jenis === 'interaktif') {
      if (![3, 6, 9].includes(event.ronde)) fail(file, 'ronde', 'event interaktif hanya diizinkan pada ronde 3, 6, atau 9', idx);
      if (interactiveRounds.has(event.ronde)) fail(file, 'ronde', 'hanya satu event interaktif per ronde', idx);
      if (Number.isInteger(event.ronde)) interactiveRounds.add(event.ronde);
    }
    if (!Number.isInteger(event.ronde) || event.ronde < 1 || event.ronde > 10) fail(file, 'ronde', 'wajib berupa bilangan bulat 1..10', idx);
    if (!Array.isArray(event.pilihan)) fail(file, 'pilihan', 'wajib berupa array (gunakan [] untuk event naratif)', idx);
    else {
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
        if (typeof choice.biaya !== 'number' || !Number.isFinite(choice.biaya) || choice.biaya < 0) fail(file, `${field}.biaya`, 'wajib berupa angka non-negatif (poin abstrak)', idx);
        validateEffect(choice.efek, file, `${field}.efek`, idx);
        if (choice.efek_tertunda !== undefined) validateDelayed(choice.efek_tertunda, file, `${field}.efek_tertunda`, idx);
      });
    }
    validateSources(event, file, idx);
  });
}

function validateFacts(data, file) {
  if (!isObject(data) || !Array.isArray(data.fakta)) {
    fail(file, 'fakta', 'akar JSON wajib memuat array fakta', undefined);
    return;
  }
  const ids = new Set();
  data.fakta.forEach((fact, position) => {
    const idx = fact?.id ?? position + 1;
    if (!isObject(fact)) {
      fail(file, 'fakta', 'setiap record wajib berupa objek', idx);
      return;
    }
    if (fact.id) {
      if (ids.has(fact.id)) fail(file, 'id', 'id fakta harus unik', idx);
      ids.add(fact.id);
    }
    for (const field of ['id', 'target', 'teks', 'konteks']) requiredString(fact, field, file, idx);
    if (!meters.has(fact.link_meter)) fail(file, 'link_meter', 'wajib berupa salah satu kunci meter yang diizinkan', idx);
    if (!Array.isArray(fact.ditampilkan) || fact.ditampilkan.length === 0 || fact.ditampilkan.some(item => typeof item !== 'string' || item.trim() === '')) {
      fail(file, 'ditampilkan', 'wajib berupa array teks yang tidak kosong', idx);
    }
    validateSources(fact, file, idx);
  });
}

validateCards(loadJson('cards.json'), `${dataLabel}/cards.json`);
validateEvents(loadJson('events.json'), `${dataLabel}/events.json`);
validateFacts(loadJson('fakta.json'), `${dataLabel}/fakta.json`);

if (errors.length > 0) {
  for (const error of errors) console.error(`Validasi konten gagal: ${error}`);
  process.exitCode = 1;
} else {
  console.log('Validasi konten berhasil: cards.json, events.json, dan fakta.json valid.');
}

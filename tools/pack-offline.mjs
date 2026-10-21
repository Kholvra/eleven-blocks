#!/usr/bin/env node
import { access, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'offline/eleven-blocks-offline.html');
const output = resolve(root, 'offline/eleven-blocks-offline.zip');
const instructionName = 'OFFLINE-INSTRUCTIONS.txt';
const threeDLimitBytes = 2_000_000;
const audioLimitBytes = 400_000;
const totalAssetsLimitBytes = 6_000_000;

async function sourceBytes(directory, includeFile = () => true) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  let total = 0;
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) total += await sourceBytes(path, includeFile);
    else if (entry.isFile() && includeFile(path)) total += (await stat(path)).size;
  }
  return total;
}

const threeDExtensions = new Set(['.glb', '.gltf']);
const audioExtensions = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav', '.webm']);

function instructionsFor(htmlBytes, threeDBytes, audioBytes, sourceInventoryBytes) {
  return `Eleven Blocks — Offline build

Open eleven-blocks-offline.html in a supported desktop/laptop browser. This package is intended for laptop use; offline mobile use is not supported.

The app requires WebGL2. If WebGL2 is unavailable, it displays the information screen. Audio may require a user gesture and may be unavailable or delayed depending on browser settings. Initial loading can take time.

Measured source inventory sizes (bytes; not proven imports/runtime assets):
- Generated HTML: ${htmlBytes}
- 3D source inventory under src/assets/ (.glb, .gltf): ${threeDBytes}
- Audio source inventory under src/audio/ (recognized audio extensions): ${audioBytes}
- Total source inventory (all files under src/assets/ plus recognized audio under src/audio/): ${sourceInventoryBytes}

OFFLINE-1 reference limits (imported 3D assets <= ${threeDLimitBytes} bytes / 2 MB; audio <= ${audioLimitBytes} bytes / 400 KB; aggregate assets < ${totalAssetsLimitBytes} bytes / 6 MB):
- These limits refer to imported/runtime assets, which this source inventory does not establish.

This report is not import-graph analysis; measurements are informational and packaging is not blocked if a reference limit is exceeded. Source files are not included in this ZIP.
`;
}

function fail(message) {
  console.error(`pack-offline: ${message}`);
  process.exitCode = 1;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name, data, offset) {
  const filename = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30 + filename.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(0x0800, 6);
  local.writeUInt32LE(0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  filename.copy(local, 30);
  const central = Buffer.alloc(46 + filename.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt32LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(offset, 42);
  filename.copy(central, 46);
  return { local: Buffer.concat([local, data]), central };
}

function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const entry = zipEntry(name, data, offset);
    locals.push(entry.local);
    centrals.push(entry.central);
    offset += entry.local.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

try {
  await access(source);
} catch {
  fail(`required HTML not found: ${source}\nRun pnpm build:offline first.`);
}
if (!process.exitCode) {
  try {
    const html = await readFile(source);
    const assetsDirectory = resolve(root, 'src/assets');
    const audioDirectory = resolve(root, 'src/audio');
    const threeDBytes = await sourceBytes(assetsDirectory, path => threeDExtensions.has(extname(path).toLowerCase()));
    const audioBytes = await sourceBytes(audioDirectory, path => audioExtensions.has(extname(path).toLowerCase()));
    const sourceInventoryBytes = await sourceBytes(assetsDirectory) + audioBytes;
    const zip = makeZip([
      ['eleven-blocks-offline.html', html],
      [instructionName, Buffer.from(instructionsFor(html.length, threeDBytes, audioBytes, sourceInventoryBytes), 'utf8')],
    ]);
    await writeFile(output, zip);
    console.log(`Created ${output}`);
  } catch (error) {
    fail(`could not create output ${output}: ${error.message}`);
  }
}

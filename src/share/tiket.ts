import { fromBase64url, toBase64url } from './base64url';

export interface TiketPayload {
  k: string;
  s: string;
  c?: number[];
  m: [number, number, number, number];
  n?: string;
  r?: 1;
  e?: string[];
  t: [string, string, string];
}

const allowedKeys: Record<string, true> = { k: true, s: true, c: true, m: true, n: true, r: true, e: true, t: true };
const MAX_URL_LENGTH = 1500;
const MAX_FRAGMENT_LENGTH = MAX_URL_LENGTH;
const MAX_DECOMPRESSED_BYTES = 8192;

export function sanitizeNickname(value: string): string | undefined {
  const cleaned = Array.from(value)
    .filter((character) => !/[\u0000-\u001f\u007f-\u009f<>&]/u.test(character))
    .join('').trim();
  const limited = Array.from(cleaned).slice(0, 24).join('');
  return limited || undefined;
}

function validatePayload(value: unknown): TiketPayload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Payload tiket tidak valid');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => allowedKeys[key] !== true)) throw new Error('Kunci payload tiket tidak dikenal');
  if (typeof input.k !== 'string' || !/^[0-9a-f]{4}$/.test(input.k)) throw new Error('Hash konten tiket tidak valid');
  if (typeof input.s !== 'string' || !/^[0-9a-z]{6}$/.test(input.s)) throw new Error('Seed tiket tidak valid');
  if (!Array.isArray(input.m) || input.m.length !== 4 || input.m.some((meter) => !Number.isInteger(meter) || meter < 0 || meter > 100)) throw new Error('Meter tiket tidak valid');
  if (!Array.isArray(input.t) || input.t.length !== 3 || input.t.some((answer) => typeof answer !== 'string' || Array.from(answer).length > 500)) throw new Error('Jawaban tiket tidak valid');
  if (input.c !== undefined && (!Array.isArray(input.c) || input.c.length > 10 || input.c.some((choice) => !Number.isInteger(choice) || choice < 0 || choice > 63))) throw new Error('Pilihan tiket tidak valid');
  if (input.n !== undefined && (typeof input.n !== 'string' || Array.from(input.n).length > 24 || sanitizeNickname(input.n) !== input.n)) throw new Error('Nama tiket tidak valid');
  if (input.r !== undefined && input.r !== 1) throw new Error('Mode tiket tidak valid');
  if (input.e !== undefined && (!Array.isArray(input.e) || input.e.some((eventId) => typeof eventId !== 'string' || eventId.length > 100))) throw new Error('Event tiket tidak valid');
  if (input.r === 1 && input.c !== undefined) throw new Error('Mode ringkas tidak boleh berisi pilihan');
  if (input.c === undefined && input.r !== 1) throw new Error('Payload tanpa pilihan harus ringkas');
  return {
    k: input.k,
    s: input.s,
    ...(input.c === undefined ? {} : { c: input.c as number[] }),
    m: input.m as TiketPayload['m'],
    ...(input.n === undefined ? {} : { n: input.n as string }),
    ...(input.r === undefined ? {} : { r: 1 as const }),
    ...(input.e === undefined ? {} : { e: input.e as string[] }),
    t: input.t as TiketPayload['t'],
  };
}

async function transform(bytes: Uint8Array<ArrayBuffer>, stream: Pick<TransformStream<BufferSource, Uint8Array>, 'writable' | 'readable'>, maxOutputBytes = Number.POSITIVE_INFINITY): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const writing = writer.write(bytes).then(() => writer.close());
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxOutputBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Isi tiket terlalu besar');
      }
      chunks.push(value);
    }
    await writing;
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    await writing.catch(() => undefined);
    throw error;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function encodeTiket(payload: TiketPayload): Promise<string> {
  const valid = validatePayload(payload);
  const bytes = new TextEncoder().encode(JSON.stringify(valid));
  if (typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined') {
    try {
      return `1.${toBase64url(await transform(bytes, new CompressionStream('deflate-raw')))}`;
    } catch {
      // Browsers that expose CompressionStream may not implement deflate-raw.
    }
  }
  return `0.${toBase64url(bytes)}`;
}

export async function decodeTiket(fragment: string): Promise<TiketPayload> {
  if (fragment.length > MAX_FRAGMENT_LENGTH) throw new Error('Tautan tiket terlalu besar');
  const match = /^(0|1)\.([A-Za-z0-9_-]+)$/.exec(fragment);
  if (!match) throw new Error('Tautan tiket tidak valid');
  let bytes = fromBase64url(match[2]);
  if (match[1] === '1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Kompresi tiket tidak didukung');
    try {
      bytes = await transform(bytes, new DecompressionStream('deflate-raw'), MAX_DECOMPRESSED_BYTES);
    } catch {
      throw new Error('Isi tiket terkompresi tidak valid atau terlalu besar');
    }
  } else if (bytes.length > MAX_DECOMPRESSED_BYTES) {
    throw new Error('Isi tiket terlalu besar');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('Isi tiket bukan JSON UTF-8 yang valid');
  }
  return validatePayload(parsed);
}

export async function buildTiketUrl(payload: TiketPayload, baseUrl: string): Promise<{ url: string; payload: TiketPayload }> {
  let current = validatePayload(payload);
  const makeUrl = async () => `${baseUrl.replace(/#.*$/, '')}#tiket=${await encodeTiket(current)}`;
  let url = await makeUrl();
  if (url.length < MAX_URL_LENGTH) return { url, payload: current };
  if (current.n !== undefined) {
    const { n: _nickname, ...withoutNickname } = current;
    current = withoutNickname;
    url = await makeUrl();
    if (url.length <= MAX_URL_LENGTH) return { url, payload: current };
  }
  if (current.e !== undefined) {
    current = { ...current, e: [] };
    url = await makeUrl();
    if (url.length <= MAX_URL_LENGTH) {
      const { e: _events, ...withoutEvents } = current;
      current = withoutEvents;
      url = await makeUrl();
      if (url.length <= MAX_URL_LENGTH) return { url, payload: current };
    }
    while (current.e && current.e.length > 0) {
      current = { ...current, e: current.e.slice(0, -1) };
      url = await makeUrl();
      if (url.length <= MAX_URL_LENGTH) {
        if (current.e?.length === 0) {
          const { e: _events, ...withoutEvents } = current;
          current = withoutEvents;
          url = await makeUrl();
          if (url.length <= MAX_URL_LENGTH) return { url, payload: current };
          break;
        }
        return { url, payload: current };
      }
    }
    const { e: _events, ...withoutEvents } = current;
    current = withoutEvents;
  }
  if (current.r !== 1) {
    const { c: _choices, ...compact } = current;
    current = { ...compact, r: 1 };
  }
  url = await makeUrl();
  if (url.length > MAX_URL_LENGTH) throw new Error('Tautan tiket melebihi batas aman');
  return { url, payload: current };
}

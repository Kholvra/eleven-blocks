import { describe, expect, it, vi } from 'vitest';
import { decodeTiket, encodeTiket, buildTiketUrl, sanitizeNickname } from '../src/share/tiket';
import { buildTiketText } from '../src/share/teks';
import type { TiketPayload } from '../src/share/tiket';

const sample: TiketPayload = {
  k: '4f2a', s: 'k7f3a9', c: [3, 7, 12, 4, 9, 15, 6, 2, 1, 5],
  m: [62, 58, 71, 49], t: ['Jalur sepeda paling mengubah udara', 'Taman vs jalan: dana cuma satu', 'Saya akan pakai transport umum'],
};
const compactPayload: TiketPayload = { ...sample, c: undefined, r: 1 };
describe('tiket share codec', () => {
  it('round-trips plain base64url payloads and falls back when compression is unavailable', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);
    try {
      const encoded = await encodeTiket(sample);
      expect(encoded.startsWith('0.')).toBe(true);
      expect(await decodeTiket(encoded)).toEqual(sample);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('round-trips compressed payloads when deflate-raw is supported', async () => {
    if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') return;
    const encoded = await encodeTiket(sample);
    if (encoded.startsWith('1.')) expect(await decodeTiket(encoded)).toEqual(sample);
    else expect(encoded.startsWith('0.')).toBe(true);
  });

  it('validates payload keys, shapes, and field boundaries', async () => {
    const invalid = [
      { ...sample, extra: true }, { ...sample, k: 'ABCD' }, { ...sample, s: 'bad' },
      { ...sample, m: [0, 0, 101, 0] }, { ...sample, c: [-1] }, { ...sample, c: [64] },
      { ...sample, t: ['one', 'two'] }, { ...sample, n: 'x'.repeat(25) },
    ];
    for (const payload of invalid) await expect(encodeTiket(payload as TiketPayload)).rejects.toThrow();
    expect(sanitizeNickname('  A\u0000<&> B  ')).toBe('A B');
    expect(sanitizeNickname('x'.repeat(30))).toBe('x'.repeat(24));
  });

  it('rejects malformed encodings, JSON, unknown prefixes, and extra keys', async () => {
    const unknownKey = btoa('{"k":"4f2a","s":"k7f3a9","m":[1,2,3,4],"t":["a","b","c"],"x":1}')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const invalidJson = btoa('not json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    for (const fragment of ['2.abc', '0.***', `0.${unknownKey}`, `0.${invalidJson}`]) {
      await expect(decodeTiket(fragment)).rejects.toThrow();
    }
  });
  it('rejects an incoming fragment above the size cap', async () => {
    await expect(decodeTiket(`0.${'a'.repeat(1500)}`)).rejects.toThrow();
  });
  it('rejects compressed payloads that inflate beyond the decoder limit', async () => {
    if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') return;
    const payload = { ...sample, e: Array.from({ length: 100 }, () => 'x'.repeat(100)) };
    const encoded = await encodeTiket(payload);
    if (!encoded.startsWith('1.')) return;
    expect(encoded.length).toBeLessThan(1500);
    await expect(decodeTiket(encoded)).rejects.toThrow('terlalu besar');
  });

  it('keeps a realistic full-session URL intact and measures the complete copied URL', async () => {
    const fullSession = { ...sample, n: 'Ayu', e: ['E01', 'E02'] };
    const { url, payload } = await buildTiketUrl(fullSession, 'https://example.test/game');
    expect(url).toContain('#tiket=');
    expect(await decodeTiket(url.slice(url.indexOf('#tiket=') + '#tiket='.length))).toEqual(payload);
    expect(url.length).toBeLessThan(1500);
    expect(payload).toEqual(fullSession);
  });
  it('starts pruning at 1500 and accepts a final URL of exactly 1500', async () => {
    const named = { ...compactPayload, n: 'Ayu' };
    const encoded = await encodeTiket(named);
    const prefix = 'https://example.test/#tiket=';
    const baseUrl = (length: number) => `https://example.test/${'x'.repeat(length - prefix.length - encoded.length)}`;
    const at1499 = await buildTiketUrl(named, baseUrl(1499));
    const at1500 = await buildTiketUrl(named, baseUrl(1500));
    expect(at1499.url.length).toBe(1499);
    expect(at1499.payload.n).toBe('Ayu');
    expect(await decodeTiket(at1499.url.slice(at1499.url.indexOf('#tiket=') + '#tiket='.length))).toEqual(at1499.payload);
    expect(await decodeTiket(at1500.url.slice(at1500.url.indexOf('#tiket=') + '#tiket='.length))).toEqual(at1500.payload);
    const compactEncoded = await encodeTiket(at1500.payload);
    const exactBase = `https://example.test/${'x'.repeat(1500 - prefix.length - compactEncoded.length)}`;
    const exact = await buildTiketUrl(at1500.payload, exactBase);
    expect(exact.url.length).toBe(1500);
    expect(await decodeTiket(exact.url.slice(exact.url.indexOf('#tiket=') + '#tiket='.length))).toEqual(exact.payload);
  });

  it('prunes name, then event detail, then compact choices while preserving meters and answers', async () => {
    const noEventsEncoded = await encodeTiket(sample);
    const compactEncoded = await encodeTiket(compactPayload);
    const baseLength = 1501 - '#tiket='.length - noEventsEncoded.length;
    const baseUrl = `https://example.test/${'x'.repeat(baseLength - 'https://example.test/'.length)}`;
    const large = {
      ...sample,
      n: 'N'.repeat(24),
      e: Array.from({ length: 300 }, (_, i) => {
        let seed = i + 1;
        const id = Array.from({ length: 94 }, () => {
          seed = (seed * 16807) % 2147483647;
          return (seed % 36).toString(36);
        }).join('');
        return `event-${id}`;
      }),
    };
    const initialUrl = `${baseUrl}#tiket=${await encodeTiket(large)}`;
    expect(initialUrl.length).toBeGreaterThanOrEqual(1500);
    expect(`${baseUrl}#tiket=${noEventsEncoded}`.length).toBeGreaterThan(1500);
    expect(`${baseUrl}#tiket=${compactEncoded}`.length).toBeLessThan(1500);
    const result = await buildTiketUrl(large, baseUrl);
    const fragment = result.url.slice(result.url.indexOf('#tiket=') + '#tiket='.length);
    expect(await decodeTiket(fragment)).toEqual(result.payload);
    expect(result.url.length).toBeLessThan(1500);
    expect(result.payload.n).toBeUndefined();
    expect(result.payload.e).toBeUndefined();
    expect(result.payload.r).toBe(1);
    expect(result.payload.c).toBeUndefined();
    expect(result.payload.m).toEqual(sample.m);
    expect(result.payload.t).toEqual(sample.t);
  });
  it('continues to compact after removing events when the URL is still over the cap', async () => {
    const compactEncoded = await encodeTiket(compactPayload);
    const noEventsEncoded = await encodeTiket(sample);
    const baseLength = 1501 - '#tiket='.length - noEventsEncoded.length;
    const baseUrl = `https://example.test/${'x'.repeat(baseLength - 'https://example.test/'.length)}`;
    const noEventsUrl = `${baseUrl}#tiket=${noEventsEncoded}`;
    expect(noEventsUrl.length).toBe(1501);
    expect(`${baseUrl}#tiket=${compactEncoded}`.length).toBeLessThan(1500);
    const eventHeavy = {
      ...sample,
      e: Array.from({ length: 80 }, (_, i) => {
        let seed = i + 1;
        const id = Array.from({ length: 90 }, () => {
          seed = (seed * 16807) % 2147483647;
          return (seed % 36).toString(36);
        }).join('');
        return `event-${id}`;
      }),
    };
    expect((await encodeTiket(eventHeavy)).length + baseUrl.length + '#tiket='.length).toBeGreaterThanOrEqual(1500);
    const result = await buildTiketUrl(eventHeavy, baseUrl);
    const fragment = result.url.slice(result.url.indexOf('#tiket=') + '#tiket='.length);
    expect(await decodeTiket(fragment)).toEqual(result.payload);
    expect(result.url.length).toBeLessThanOrEqual(1500);
    expect(result.payload.e).toBeUndefined();
    expect(result.payload.r).toBe(1);
    expect(result.payload.c).toBeUndefined();
  });


  it('refuses an over-cap URL rather than truncating required answers', async () => {
    const longBase = `https://example.test/${'x'.repeat(1500)}`;
    await expect(buildTiketUrl({ ...sample, t: ['a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400)] }, longBase)).rejects.toThrow();
  });

  it('builds a concise summary with optional name, labeled meters, answers, and URL', () => {
    const named = buildTiketText({ ...sample, n: 'Ayu' }, 'https://example.test/#tiket=0.abc');
    expect(named).toContain('Nama: Ayu');
    expect(named).toContain('Meter permainan akhir:');
    expect(named).toContain('Nilai memakai skala permainan, bukan ukuran kondisi kota nyata.');
    expect(named).toContain('udara 62/100');
    expect(named).toContain('akses 58/100');
    expect(named).toContain('hijau 71/100');
    expect(named).toContain('warga 49/100');
    for (const answer of sample.t) expect(named).toContain(answer);
    expect(named).toContain('https://example.test/#tiket=0.abc');
    expect(buildTiketText(sample)).not.toContain('Nama:');
  });
});

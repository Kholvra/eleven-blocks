import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettingsRepository, type SettingsStorage } from '../src/save/settings';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: SettingsStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { storage, values };
}

describe('settings repository', () => {
  it('defaults missing settings and audio to enabled', () => {
    expect(createSettingsRepository(null).load()).toEqual({ audio: true });
    expect(createSettingsRepository(memoryStorage().storage).load()).toEqual({ audio: true });
  });

  it('defaults malformed audio only while preserving other settings', () => {
    const { storage } = memoryStorage({
      'elevenblocks.v1.settings': JSON.stringify({ audio: 'off', volume: 0.4, theme: 'dark' }),
    });

    expect(createSettingsRepository(storage).load()).toEqual({ audio: true, volume: 0.4, theme: 'dark' });
  });

  it('read-modify-writes without dropping unknown settings', () => {
    const { storage, values } = memoryStorage({
      'elevenblocks.v1.settings': JSON.stringify({ audio: false, volume: 0.25, future: { mode: 'quiet' } }),
    });
    const repository = createSettingsRepository(storage);

    expect(repository.update({ audio: true })).toBe(true);
    expect(JSON.parse(values.get('elevenblocks.v1.settings')!)).toEqual({
      audio: true, volume: 0.25, future: { mode: 'quiet' },
    });
  });

  it('retains updates in page memory when storage is unavailable or quota fails', () => {
    const blocked: SettingsStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    const unavailable = createSettingsRepository(blocked);
    expect(unavailable.update({ audio: false, custom: 'kept' })).toBe(true);
    expect(unavailable.load()).toEqual({ audio: false, custom: 'kept' });

    const quotaStorage: SettingsStorage = {
      ...memoryStorage({ 'elevenblocks.v1.settings': JSON.stringify({ audio: true, custom: 7 }) }).storage,
      setItem: () => { throw new Error('quota'); },
    };
    const quota = createSettingsRepository(quotaStorage);
    expect(quota.update({ audio: false })).toBe(true);
    expect(quota.load()).toEqual({ audio: false, custom: 7 });
  });

  it('uses the current stored audio choice for a new audio controller', async () => {
    const storedValues = new Map([['elevenblocks.v1.settings', JSON.stringify({ audio: false })]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storedValues.get(key) ?? null,
      setItem: (key: string, value: string) => { storedValues.set(key, value); },
      removeItem: (key: string) => { storedValues.delete(key); },
    });
    // Load audio after installing storage so its module-level repository captures this instance.
    await vi.resetModules();
    const { createAudioController } = await import('../src/audio/audio');

    const controller = createAudioController();
    expect(controller.isEnabled()).toBe(false);
    controller.setEnabled(true);
    expect(controller.isEnabled()).toBe(true);
    expect(JSON.parse(storedValues.get('elevenblocks.v1.settings')!).audio).toBe(true);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

export interface SaveSettings {
  audio: boolean;
  [key: string]: unknown;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SETTINGS_KEY = 'elevenblocks.v1.settings';
const DEFAULT_SETTINGS: SaveSettings = { audio: true };

function browserStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createSettingsRepository(storage: SettingsStorage | null = browserStorage()): {
  load(): SaveSettings;
  update(changes: Partial<SaveSettings>): boolean;
} {
  let memoryFallback = storage === null;
  let memory: SaveSettings = { ...DEFAULT_SETTINGS };

  function read(): SaveSettings {
    if (!storage || memoryFallback) return { ...memory };
    try {
      const raw = storage.getItem(SETTINGS_KEY);
      if (raw === null) return { ...DEFAULT_SETTINGS };
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ...DEFAULT_SETTINGS };
      }
      const settings = parsed as Record<string, unknown>;
      return {
        ...settings,
        audio: typeof settings.audio === 'boolean' ? settings.audio : DEFAULT_SETTINGS.audio,
      };
    } catch {
      return { ...memory };
    }
  }

  function load(): SaveSettings {
    memory = read();
    return { ...memory };
  }

  function update(changes: Partial<SaveSettings>): boolean {
    memory = { ...load(), ...changes };
    if (typeof memory.audio !== 'boolean') memory.audio = DEFAULT_SETTINGS.audio;
    if (storage) {
      try {
        storage.setItem(SETTINGS_KEY, JSON.stringify(memory));
        memoryFallback = false;
      } catch {
        memoryFallback = true;
        // Keep the change in page memory when browser storage is blocked or full.
      }
    } else {
      memoryFallback = true;
    }
    return true;
  }

  return { load, update };
}

const settingsRepository = createSettingsRepository();

export function loadSettings(): SaveSettings {
  return settingsRepository.load();
}

export function saveSettings(changes: Partial<SaveSettings>): boolean {
  return settingsRepository.update(changes);
}

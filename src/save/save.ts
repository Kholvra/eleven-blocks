import type { GameState } from '../game/types';
import { migrasikanSave, VERSI_STATE_TERBARU } from './migrasi';

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveRepository {
  load(): { status: 'empty' } | { status: 'valid'; state: GameState } | { status: 'invalid'; message: string };
  save(state: GameState): boolean;
  clear(): void;
}

const SAVE_KEY = 'elevenblocks.v1.save';
const NEXT_ACTION = 'Simpan rusak atau tidak didukung. Mulai permainan baru untuk melanjutkan.';

function browserStorage(): SaveStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createSaveRepository(storage: SaveStorage | null = browserStorage()): SaveRepository {
  let memory: string | null = null;
  let memoryFallback = false;
  return {
    load() {
      let raw: string | null = null;
      if (memoryFallback) {
        raw = memory;
      } else {
        try {
          raw = storage?.getItem(SAVE_KEY) ?? null;
        } catch {
          memoryFallback = true;
          raw = memory;
        }
      }
      if (raw === null && memoryFallback) raw = memory;
      if (raw === null) return { status: 'empty' };
      try {
        const parsed = JSON.parse(raw) as { state?: unknown };
        const state = migrasikanSave(parsed);
        if (state !== null) {
          if (parsed.state !== state) {
            const normalized = JSON.stringify({ versi: VERSI_STATE_TERBARU, state });
            if (normalized !== undefined) {
              memory = normalized;
              if (storage === null || memoryFallback) {
                memoryFallback = true;
              } else {
                try {
                  storage.setItem(SAVE_KEY, normalized);
                  memoryFallback = false;
                } catch {
                  memoryFallback = true;
                }
              }
            }
          }
          return { status: 'valid', state };
        }
      } catch {
        // Invalid JSON is handled like every other invalid save.
      }
      try { storage?.removeItem(SAVE_KEY); } catch { /* Best effort cleanup. */ }
      memory = null;
      memoryFallback = false;
      return { status: 'invalid', message: NEXT_ACTION };
    },
    save(state) {
      let serialized: string;
      try {
        serialized = JSON.stringify({ versi: VERSI_STATE_TERBARU, state });
      } catch {
        return false;
      }
      memory = serialized;
      try {
        if (storage === null) {
          memoryFallback = true;
          return false;
        }
        storage.setItem(SAVE_KEY, serialized);
        memoryFallback = false;
        return true;
      } catch {
        // Keep the in-memory copy available for this page session.
        memoryFallback = true;
        return false;
      }
    },
    clear() {
      memory = null;
      memoryFallback = false;
      try { storage?.removeItem(SAVE_KEY); } catch { /* Best effort cleanup. */ }
    },
  };
}

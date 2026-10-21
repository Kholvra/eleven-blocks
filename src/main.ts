import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout-hp.css';
import { createGameEngine } from './game/engine';
import { createGameMachine } from './game/machine';
import { baruGame } from './game/state';
import type { GameState, Phase } from './game/types';
import type { GameAction } from './game/engine';
import { createSaveRepository } from './save/save';
import { loadSettings } from './save/settings';
import { createScreenRouter, type ScreenRouter } from './ui/router';
import { hitungSkorAkhir } from './game/report';
import { renderWebGLFallback } from './ui/webglFallback';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Elemen aplikasi #app tidak ditemukan.');
}

function createSessionSeed(): string {
  const limit = Math.floor(2 ** 32 / 36 ** 6) * 36 ** 6;
  const random = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(random);
    value = random[0];
  } while (value >= limit);
  return value.toString(36).padStart(6, '0');
}

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

if (!supportsWebGL2()) {
  renderWebGLFallback(app);
} else {
  // Scene setup imports Three.js; defer it until WebGL2 support is known.
  const [{ setupScene }, { loadBuildingModels }] = await Promise.all([
    import('./scene/setup'),
    import('./scene/assets'),
  ]);
  const models = await loadBuildingModels();
  const saveRepository = createSaveRepository();
  const loadResult = saveRepository.load();
  const initialState = loadResult.status === 'valid'
    ? loadResult.state
    : baruGame(createSessionSeed());
  if (loadResult.status !== 'valid') {
    initialState.setelan.audio = loadSettings().audio;
  }

  let router: ScreenRouter | null = null;
  let machine: ReturnType<typeof createGameMachine> | null = null;
  const saveState = (state: GameState): void => {
    const saved = saveRepository.save(state);
    if (machine && machine.getPhase() !== state.fase) {
      machine.restore(state.fase);
      router?.render();
    }
    router?.setStatus(saved ? '' : 'Simpanan perangkat tidak tersedia. Sesi ini tetap berjalan selama halaman terbuka.');
  };
  let engine = createGameEngine(initialState, saveState);

  machine = createGameMachine(initialState.fase);
  setupScene(app, () => engine.getState(), undefined, models);

  const completed = loadResult.status === 'valid' && loadResult.state.ronde === 10 &&
    ['ringkasan', 'laporan', 'tiket'].includes(loadResult.state.fase);

  router = createScreenRouter(app, machine, {
    getState: () => engine.getState(),
    dispatch(action: GameAction) {
      return engine.dispatch(action);
    },
    canContinue: loadResult.status === 'valid',
    continueLabel: completed
      ? 'Lihat hasil tersimpan'
      : `Lanjutkan (ronde ${loadResult.status === 'valid' ? loadResult.state.ronde : 1})`,
    statusMessage: loadResult.status === 'invalid' ? loadResult.message : undefined,
    onStartNew() {
      saveRepository.clear();
      const state = baruGame(createSessionSeed());
      state.setelan.audio = loadSettings().audio;
      engine = createGameEngine(state, saveState);
      engine.dispatch({ type: 'TRANSISI_FASE', fase: 'tutorial' });
      return engine.getState().fase;
    },
    onContinue(): Phase | null {
      const result = saveRepository.load();
      if (result.status !== 'valid') {
        router?.setStatus(result.status === 'invalid'
          ? result.message
          : 'Simpanan tidak ditemukan. Mulai sesi baru untuk bermain.');
        return null;
      }
      engine = createGameEngine(result.state, saveState);
      return engine.getState().fase;
    },
    onAudioChange(enabled) {
      engine.dispatch({ type: 'SETELAN_AUDIO', aktif: enabled });
    },
    getGameState: () => engine.getState(),
    hitungSkorAkhir,
  });
  router.render();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveState(engine.getState());
  });
  window.addEventListener('pagehide', () => {
    saveState(engine.getState());
  });
}

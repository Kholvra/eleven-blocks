import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout-hp.css';
import { baruGame } from './game/state';
import { createGameMachine } from './game/machine';
import { createScreenRouter } from './ui/router';
import { renderWebGLFallback } from './ui/webglFallback';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Elemen aplikasi #app tidak ditemukan.');
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
  // A static import would evaluate Three.js before the WebGL2 probe.
  const { setupScene } = await import('./scene/setup');
  const state = baruGame('eleven-blocks');
  setupScene(app, () => state);
  const machine = createGameMachine();
  const router = createScreenRouter(app, machine);
  router.render();
}

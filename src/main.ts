import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import { createGameMachine } from './game/machine';
import { createScreenRouter } from './ui/router';
import { setupScene } from './scene/setup';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Elemen aplikasi #app tidak ditemukan.');
}

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

if (!supportsWebGL2()) {
  const fallback = document.createElement('main');
  fallback.className = 'webgl-fallback';

  const title = document.createElement('h1');
  title.textContent = 'WebGL 2 tidak tersedia';

  const explanation = document.createElement('p');
  explanation.textContent =
    'Eleven Blocks membutuhkan dukungan WebGL 2 untuk menampilkan pengalaman 3D. Tidak ada adegan 3D yang dimulai pada perangkat ini.';

  const suggestion = document.createElement('p');
  suggestion.append('Coba perbarui peramban atau gunakan peramban yang mendukung WebGL 2. ');
  const link = document.createElement('a');
  link.href = 'https://get.webgl.org/webgl2/';
  link.textContent = 'Periksa dukungan WebGL 2';
  link.rel = 'noreferrer';
  suggestion.append(link);

  fallback.append(title, explanation, suggestion);
  app.replaceChildren(fallback);
} else {
  setupScene(app);
  const machine = createGameMachine();
  const router = createScreenRouter(app, machine);
  router.render();
}

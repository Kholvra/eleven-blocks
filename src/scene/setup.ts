import { Color, OrthographicCamera, Scene, WebGLRenderer } from 'three';

export function setupScene(root: HTMLElement): void {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const pageColor = getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim();
  renderer.setClearColor(new Color(pageColor));
  renderer.domElement.className = 'scene-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  root.prepend(renderer.domElement);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  function render(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', render);
  render();
}

import { AmbientLight, Color, DirectionalLight, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import buildableCells from '../data/board.json';
import type { GameState } from '../game/types';
import { createBoardGrid } from './grid';
import { cellAtPointer } from './placement';

export function setupScene(root: HTMLElement, getState: () => GameState, onPlace?: (selIdx: number) => void): void {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.domElement.className = 'scene-canvas';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  const pageColor = getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim();
  const surfaceColor = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--color-meter-green').trim();
  const focusColor = getComputedStyle(document.documentElement).getPropertyValue('--color-focus').trim();
  renderer.setClearColor(new Color(pageColor));
  renderer.domElement.setAttribute('role', 'group');
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    onPlace
      ? 'Papan permainan. Gunakan tombol panah untuk berpindah, Enter atau Spasi untuk mencoba menempatkan, Escape untuk menghapus pratinjau.'
      : 'Papan permainan. Gunakan tombol panah untuk berpindah, Escape untuk menghapus pratinjau.',
  );
  renderer.domElement.setAttribute(
    'aria-keyshortcuts',
    onPlace ? 'ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space Escape' : 'ArrowUp ArrowDown ArrowLeft ArrowRight Escape',
  );
  root.prepend(renderer.domElement);

  const scene = new Scene();
  const grid = createBoardGrid(pageColor, surfaceColor, accentColor, focusColor);
  scene.add(grid.group);
  scene.add(new AmbientLight(0xffffff, 1.8));
  const keyLight = new DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(-5, 10, 6);
  scene.add(keyLight);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
  const yaw = Math.PI / 4;
  const pitch = Math.atan(1 / Math.sqrt(2));
  const distance = 18;
  camera.position.set(
    distance * Math.cos(pitch) * Math.sin(yaw),
    distance * Math.sin(pitch),
    distance * Math.cos(pitch) * Math.cos(yaw),
  );
  camera.lookAt(new Vector3(0, 0, 0));

  const buildable: Record<number, true> = {};
  for (const cellIndex of buildableCells) buildable[cellIndex] = true;
  let logicalCellIndex = buildableCells[0] ?? 0;
  let lastPointerEvent: PointerEvent | null = null;
  let focusedCell: number | null = null;

  function render(): void {
    const state = getState();
    grid.updateOccupancy(state.papan.ubin);
    const rowMajorCell = logicalCellIndex + 1;
    const isBuildable = Boolean(buildable[logicalCellIndex]);
    const isOccupied = state.papan.ubin[logicalCellIndex] !== null && state.papan.ubin[logicalCellIndex] !== undefined;
    const status = isOccupied ? 'terisi' : isBuildable ? 'dapat dibangun' : 'tidak dapat dibangun';
    renderer.domElement.setAttribute(
      'aria-label',
      `Papan permainan, sel ${rowMajorCell} dari 64, ${status}. ` +
        (onPlace
          ? 'Gunakan tombol panah untuk berpindah, Enter atau Spasi untuk mencoba menempatkan, Escape untuk menghapus pratinjau.'
          : 'Gunakan tombol panah untuk berpindah, Escape untuk menghapus pratinjau.'),
    );
    const bounds = renderer.domElement.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const aspect = width / height;
    const halfHeight = Math.max(6, 6.4 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
  }

  function updateFocus(event: PointerEvent): void {
    lastPointerEvent = event;
    focusedCell = cellAtPointer(event, renderer.domElement, camera, grid.tiles);
    if (focusedCell !== null) logicalCellIndex = focusedCell;
    grid.updateFocus(focusedCell, getState().papan.ubin);
    render();
  }

  renderer.domElement.addEventListener('focus', () => {
    focusedCell = logicalCellIndex;
    grid.updateFocus(focusedCell, getState().papan.ubin);
    render();
  });
  renderer.domElement.addEventListener('blur', () => {
    focusedCell = null;
    grid.updateFocus(null, getState().papan.ubin);
    render();
  });
  renderer.domElement.addEventListener('pointermove', updateFocus);
  renderer.domElement.addEventListener('pointerleave', () => {
    focusedCell = null;
    grid.updateFocus(null, getState().papan.ubin);
    render();
  });

  renderer.domElement.addEventListener('keydown', (event) => {
    const row = Math.floor(logicalCellIndex / 8);
    const column = logicalCellIndex % 8;
    let nextRow = row;
    let nextColumn = column;

    switch (event.key) {
      case 'ArrowUp':
        nextRow = Math.max(0, row - 1);
        break;
      case 'ArrowDown':
        nextRow = Math.min(7, row + 1);
        break;
      case 'ArrowLeft':
        nextColumn = Math.max(0, column - 1);
        break;
      case 'ArrowRight':
        nextColumn = Math.min(7, column + 1);
        break;
      case 'Enter':
      case ' ':
        if (!onPlace) return;
        onPlace(logicalCellIndex);
        event.preventDefault();
        render();
        return;
      case 'Escape':
        lastPointerEvent = null;
        focusedCell = null;
        grid.updateFocus(null, getState().papan.ubin);
        event.preventDefault();
        render();
        return;
      default:
        return;
    }

    logicalCellIndex = nextRow * 8 + nextColumn;
    focusedCell = logicalCellIndex;
    grid.updateFocus(focusedCell, getState().papan.ubin);
    event.preventDefault();
    render();
  });

  renderer.domElement.addEventListener('pointerup', (event) => {
    updateFocus(event);
    const cellIndex = focusedCell;
    if (cellIndex !== null && onPlace) {
      onPlace(cellIndex);
      render();
    }
  });

  const resizeScene = (): void => {
    render();
    if (lastPointerEvent) updateFocus(lastPointerEvent);
  };
  const resizeObserver = new ResizeObserver(resizeScene);
  resizeObserver.observe(root);
  window.addEventListener('resize', resizeScene);
  render();
}

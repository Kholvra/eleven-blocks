import { AmbientLight, Color, DirectionalLight, OrthographicCamera, Scene, Vector3, WebGLRenderer, type Object3D } from 'three';
import { cellAtPointer, isPlacementCellAvailable } from './placement';
import buildableCells from '../data/board.json';
import { hashSeed } from '../game/rng';
import type { GameState } from '../game/types';
import { createBoardGrid } from './grid';
import { createBuildingLayer } from './buildings';
import { createAdaptiveQuality } from './perf';

export function setupScene(
  root: HTMLElement,
  getState: () => GameState,
  onPlace?: (selIdx: number) => void,
  models: ReadonlyMap<string, Object3D> = new Map(),
): { setPlacementMode(active: boolean): void; focusBoard(): void } {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.domElement.className = 'scene-canvas';
  const initialPixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(initialPixelRatio);
  renderer.shadowMap.enabled = false;
  const debugOutput = document.createElement('output');
  debugOutput.className = 'scene-debug';
  debugOutput.hidden = window.location.hash !== '#debug';
  debugOutput.setAttribute('aria-live', 'off');
  debugOutput.textContent = 'Mengukur kinerja papan…';
  root.append(debugOutput);
  const adaptiveQuality = createAdaptiveQuality(renderer, initialPixelRatio, debugOutput.hidden ? null : debugOutput);
  const rootStyles = getComputedStyle(document.documentElement);
  const grassDotColor = rootStyles.getPropertyValue('--color-tile-grass-dot').trim();
  const buildableDotColor = rootStyles.getPropertyValue('--color-page').trim();
  const airColor = rootStyles.getPropertyValue('--color-meter-air').trim();
  const accessColor = rootStyles.getPropertyValue('--color-meter-access').trim();
  const accentColor = rootStyles.getPropertyValue('--color-meter-green').trim();
  const soilColor = rootStyles.getPropertyValue('--color-soil').trim();
  const occupiedColor = rootStyles.getPropertyValue('--card-policy').trim();
  const borderColor = rootStyles.getPropertyValue('--color-border').trim();
  const focusColor = rootStyles.getPropertyValue('--color-focus').trim();
  renderer.setClearColor(new Color(rootStyles.getPropertyValue('--color-sky').trim() || '#bce9f8'));
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
  const grid = createBoardGrid(grassDotColor, buildableDotColor, accentColor, soilColor, occupiedColor, focusColor, hashSeed(getState().seed));
  const buildings = createBuildingLayer(models, grid.tiles, airColor, borderColor);
  scene.add(buildings.group, grid.group);
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
  camera.lookAt(new Vector3(0, 0.15, 0));
  const buildable: Record<number, true> = {};
  for (const cellIndex of buildableCells) buildable[cellIndex] = true;
  let logicalCellIndex = buildableCells[0] ?? 0;
  let lastPointerEvent: PointerEvent | null = null;
  let focusedCell: number | null = null;
  let keyboardFocusActive = false;
  function setFocusedCell(cellIndex: number | null): void {
    const occupancy = getState().papan.ubin;
    const nextCell = cellIndex !== null && isPlacementCellAvailable(cellIndex, occupancy) ? cellIndex : null;
    if (focusedCell === nextCell) return;
    focusedCell = nextCell;
  }
  function render(): void {
    const state = getState();
    if (focusedCell !== null && !isPlacementCellAvailable(focusedCell, state.papan.ubin)) setFocusedCell(null);
    buildings.sync(state);
    grid.updateOccupancy(state.papan.ubin);
    grid.updateFocus(focusedCell, state.papan.ubin);
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
    renderer.render(scene, camera);
  }

  function updateFocus(event: PointerEvent): void {
    lastPointerEvent = event;
    const hitCell = cellAtPointer(event, renderer.domElement, camera, grid.tiles);
    setFocusedCell(hitCell);
    if (hitCell !== null) logicalCellIndex = hitCell;
    grid.updateFocus(hitCell, getState().papan.ubin);
    render();
  }
  function setPlacementMode(active: boolean): void {
    grid.setPlacementMode(active, getState().papan.ubin);
    render();
  }
  function focusBoard(): void {
    const occupancy = getState().papan.ubin;
    if (!isPlacementCellAvailable(logicalCellIndex, occupancy)) {
      logicalCellIndex = buildableCells.find((cell) => isPlacementCellAvailable(cell, occupancy)) ?? logicalCellIndex;
    }
    renderer.domElement.focus();
  }

  renderer.domElement.addEventListener('focus', () => {
    keyboardFocusActive = true;
    const occupancy = getState().papan.ubin;
    if (!isPlacementCellAvailable(logicalCellIndex, occupancy)) {
      logicalCellIndex = buildableCells.find((cell) => isPlacementCellAvailable(cell, occupancy)) ?? logicalCellIndex;
    }
    setFocusedCell(logicalCellIndex);
    grid.updateFocus(focusedCell, occupancy);
    render();
  });
  renderer.domElement.addEventListener('blur', () => {
    keyboardFocusActive = false;
    setFocusedCell(null);
    grid.updateFocus(null, getState().papan.ubin);
    render();
  });
  renderer.domElement.addEventListener('pointermove', updateFocus);
  renderer.domElement.addEventListener('pointerleave', () => {
    lastPointerEvent = null;
    const occupancy = getState().papan.ubin;
    setFocusedCell(keyboardFocusActive && isPlacementCellAvailable(logicalCellIndex, occupancy)
      ? logicalCellIndex
      : null);
    grid.updateFocus(focusedCell, occupancy);
    render();
  });

  renderer.domElement.addEventListener('keydown', (event: KeyboardEvent) => {
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
      case ' ':
      case 'Enter': {
        if (focusedCell === null || !onPlace || !isPlacementCellAvailable(focusedCell, getState().papan.ubin)) return;
        onPlace(focusedCell);
        event.preventDefault();
        render();
        return;
      }
      case 'Escape':
        keyboardFocusActive = false;
        lastPointerEvent = null;
        setFocusedCell(null);
        grid.updateFocus(null, getState().papan.ubin);
        event.preventDefault();
        render();
        return;
      default:
        return;
    }

    keyboardFocusActive = true;
    logicalCellIndex = nextRow * 8 + nextColumn;
    setFocusedCell(logicalCellIndex);
    grid.updateFocus(focusedCell, getState().papan.ubin);
    event.preventDefault();
    render();
  });

  renderer.domElement.addEventListener('pointerup', (event: PointerEvent) => {
    updateFocus(event);
    const cellIndex = focusedCell;
    if (cellIndex !== null && onPlace) {
      onPlace(cellIndex);
      render();
    }
  });

  const resizeScene = (): void => {
    const bounds = renderer.domElement.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const aspect = width / height;
    const halfHeight = Math.max(7.2, 7.4 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
    if (lastPointerEvent) updateFocus(lastPointerEvent);
  };
  const resizeObserver = new ResizeObserver(resizeScene);
  resizeObserver.observe(root);
  window.addEventListener('resize', resizeScene);
  resizeScene();

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animate = (now: number): void => {
    grid.animatePlacementTargets(now, reducedMotionQuery.matches);
    renderer.render(scene, camera);
    adaptiveQuality.sample(now, document.hidden);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
  return { setPlacementMode, focusBoard };
}

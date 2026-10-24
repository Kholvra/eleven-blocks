import { Raycaster, Vector2, type Camera, type Intersection, type Object3D } from 'three';
import buildableCells from '../data/board.json';
import type { BoardTile } from './grid';

export function isPlacementCellAvailable(
  cellIndex: number,
  occupancy: readonly (number | null)[],
): boolean {
  const occupied = occupancy[cellIndex];
  return buildableCells.includes(cellIndex) && (occupied === null || occupied === undefined);
}

const pointer = new Vector2();
const raycaster = new Raycaster();
const intersections: Intersection<Object3D>[] = [];

export function cellAtPointer(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  camera: Camera,
  tiles: readonly BoardTile[],
): number | null {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return null;

  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  intersections.length = 0;
  raycaster.intersectObjects(tiles as BoardTile[], false, intersections);
  const hit = intersections[0]?.object as BoardTile | undefined;
  return hit?.userData.cellIndex ?? null;
}

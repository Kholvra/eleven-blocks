import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial } from 'three';
import buildableCells from '../data/board.json';

export const BOARD_SIZE = 8;
const TILE_SIZE = 0.96;
const TILE_HEIGHT = 0.12;
const TILE_Y = TILE_HEIGHT / 2;

export interface BoardTile extends Mesh<BoxGeometry, MeshStandardMaterial> {
  readonly userData: { cellIndex: number };
}

export interface BoardGrid {
  readonly group: Group;
  readonly tiles: readonly BoardTile[];
  updateOccupancy(occupancy: readonly (number | null)[]): void;
  updateFocus(cellIndex: number | null, occupancy: readonly (number | null)[]): void;
  dispose(): void;
}

export function createBoardGrid(pageColor: string, surfaceColor: string, accentColor: string, focusColor: string): BoardGrid {
  const group = new Group();
  const tiles: BoardTile[] = [];
  const buildable: Record<number, true> = {};
  for (const cellIndex of buildableCells) buildable[cellIndex] = true;
  const geometry = new BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE);
  const plainMaterial = new MeshStandardMaterial({ color: surfaceColor, roughness: 1 });
  const buildableMaterial = new MeshStandardMaterial({ color: pageColor, roughness: 1 });
  const occupiedMaterial = new MeshStandardMaterial({ color: accentColor, roughness: 1 });
  const focusGeometry = new EdgesGeometry(new BoxGeometry(TILE_SIZE * 0.9, 0.01, TILE_SIZE * 0.9));
  const focusMaterial = new LineBasicMaterial({ color: focusColor });
  const previewMaterial = new MeshStandardMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    roughness: 1,
  });
  const focus = new LineSegments(focusGeometry, focusMaterial);
  focus.visible = false;
  focus.position.y = TILE_HEIGHT + 0.012;
  const preview = new Mesh(new BoxGeometry(TILE_SIZE * 0.88, 0.008, TILE_SIZE * 0.88), previewMaterial);
  preview.visible = false;
  preview.position.y = TILE_HEIGHT + 0.006;
  group.add(preview, focus);

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const cellIndex = row * BOARD_SIZE + column;
      const tile = new Mesh(geometry, buildable[cellIndex] ? buildableMaterial : plainMaterial) as BoardTile;
      tile.position.set(
        column - (BOARD_SIZE - 1) / 2,
        TILE_Y,
        row - (BOARD_SIZE - 1) / 2,
      );
      tile.userData.cellIndex = cellIndex;
      group.add(tile);
      tiles.push(tile);
    }
  }

  return {
    group,
    tiles,
    updateOccupancy(occupancy) {
      for (const tile of tiles) {
        const cellIndex = tile.userData.cellIndex;
        if (occupancy[cellIndex] !== null && occupancy[cellIndex] !== undefined) {
          tile.material = occupiedMaterial;
        } else {
          tile.material = buildable[cellIndex] ? buildableMaterial : plainMaterial;
        }
      }
    },
    updateFocus(cellIndex, occupancy) {
      if (cellIndex === null) {
        focus.visible = false;
        preview.visible = false;
        return;
      }
      const tile = tiles[cellIndex];
      if (!tile) {
        focus.visible = false;
        preview.visible = false;
        return;
      }
      focus.position.x = tile.position.x;
      focus.position.z = tile.position.z;
      focus.material.color.set(focusColor);
      focus.visible = true;
      const valid = Boolean(buildable[cellIndex]) && (occupancy[cellIndex] === null || occupancy[cellIndex] === undefined);
      preview.position.x = tile.position.x;
      preview.position.z = tile.position.z;
      preview.visible = valid;
    },
    dispose() {
      geometry.dispose();
      focusGeometry.dispose();
      preview.geometry.dispose();
      plainMaterial.dispose();
      buildableMaterial.dispose();
      occupiedMaterial.dispose();
      focusMaterial.dispose();
      previewMaterial.dispose();
    },
  };
}


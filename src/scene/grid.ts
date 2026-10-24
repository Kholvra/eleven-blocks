import { BoxGeometry, BufferGeometry, CircleGeometry, DoubleSide, EdgesGeometry, ExtrudeGeometry, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Shape } from 'three';
import buildableCells from '../data/board.json';

export const BOARD_SIZE = 8;
const TILE_SIZE = 1;
const SOIL_TOP = 0.02;
const SOIL_MIN_DEPTH = 0.36;
const SOIL_DEPTH_VARIATION = 0.34;
const TILE_HEIGHT = 0.12;
const TILE_Y = TILE_HEIGHT / 2;
const DOTS_PER_SIDE = 11;
const DOTS_PER_TILE = DOTS_PER_SIDE * DOTS_PER_SIDE;
const DOT_SPACING = 1 / DOTS_PER_SIDE;
const DOT_JITTER = 0.018;

function visualRandom(seed: number): number {
  let value = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

const VISUAL_MIN_COLUMN = -1;
const VISUAL_COLUMN_COUNT = BOARD_SIZE + 2;

interface RowSpan {
  readonly firstColumn: number;
  readonly endColumn: number;
}

function createSoilGeometry(visibleCells: readonly boolean[], seed: number): BufferGeometry {
  const positions: number[] = [];
  const depthAt = (x: number, z: number): number => {
    const gridX = Math.round(x);
    const gridZ = Math.round(z);
    const pointSeed = seed ^ Math.imul(gridX, 0x9e3779b1) ^ Math.imul(gridZ, 0x85ebca77);
    return SOIL_MIN_DEPTH + visualRandom(pointSeed) * SOIL_DEPTH_VARIATION;
  };
  const addSide = (x1: number, z1: number, x2: number, z2: number): void => {
    const bottomY1 = SOIL_TOP - depthAt(x1, z1);
    const bottomY2 = SOIL_TOP - depthAt(x2, z2);
    positions.push(
      x1, SOIL_TOP, z1,
      x1, bottomY1, z1,
      x2, SOIL_TOP, z2,
      x2, SOIL_TOP, z2,
      x1, bottomY1, z1,
      x2, bottomY2, z2,
    );
  };

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = VISUAL_MIN_COLUMN; column <= BOARD_SIZE; column += 1) {
      const visualIndex = row * VISUAL_COLUMN_COUNT + column - VISUAL_MIN_COLUMN;
      if (!visibleCells[visualIndex]) continue;
      const x = column - (BOARD_SIZE - 1) / 2;
      const z = row - (BOARD_SIZE - 1) / 2;
      if (row === 0 || !visibleCells[visualIndex - VISUAL_COLUMN_COUNT]) addSide(x - 0.5, z - 0.5, x + 0.5, z - 0.5);
      if (column === BOARD_SIZE || !visibleCells[visualIndex + 1]) addSide(x + 0.5, z - 0.5, x + 0.5, z + 0.5);
      if (row === BOARD_SIZE - 1 || !visibleCells[visualIndex + VISUAL_COLUMN_COUNT]) addSide(x + 0.5, z + 0.5, x - 0.5, z + 0.5);
      if (column === VISUAL_MIN_COLUMN || !visibleCells[visualIndex - 1]) addSide(x - 0.5, z + 0.5, x - 0.5, z - 0.5);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createRowSpans(seed: number): RowSpan[] {
  return Array.from({ length: BOARD_SIZE }, (_, row) => {
    const rowSeed = seed + Math.imul(row + 1, 0x9e3779b9);
    if (row === 0 || row === BOARD_SIZE - 1) {
      const width = 2 + Math.floor(visualRandom(rowSeed) * 5);
      const firstColumn = Math.floor(visualRandom(rowSeed ^ 0x85ebca6b) * (BOARD_SIZE + 1 - width));
      return { firstColumn, endColumn: firstColumn + width };
    }
    const firstColumn = visualRandom(rowSeed ^ 0x85ebca6b) < 0.3 ? -1 : 0;
    const endColumn = visualRandom(rowSeed ^ 0xc2b2ae35) < 0.3 ? BOARD_SIZE + 1 : BOARD_SIZE;
    return { firstColumn, endColumn };
  });
}

function createFootprintGeometry(rowSpans: readonly RowSpan[]): ExtrudeGeometry {
  const shape = new Shape();
  const leftColumns = rowSpans.map((span) => span.firstColumn);
  const rightColumns = rowSpans.map((span) => span.endColumn);
  const xAtColumn = (column: number): number => column - BOARD_SIZE / 2;
  const yAtRow = (row: number): number => BOARD_SIZE / 2 - row;
  shape.moveTo(xAtColumn(leftColumns[0]), yAtRow(0));
  shape.lineTo(xAtColumn(rightColumns[0]), yAtRow(0));

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    const boundaryY = yAtRow(row + 1);
    shape.lineTo(xAtColumn(rightColumns[row]), boundaryY);
    if (row < BOARD_SIZE - 1) shape.lineTo(xAtColumn(rightColumns[row + 1]), boundaryY);
  }

  shape.lineTo(xAtColumn(leftColumns[BOARD_SIZE - 1]), yAtRow(BOARD_SIZE));
  for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
    const boundaryY = yAtRow(row);
    shape.lineTo(xAtColumn(leftColumns[row]), boundaryY);
    if (row > 0) shape.lineTo(xAtColumn(leftColumns[row - 1]), boundaryY);
  }
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, { depth: TILE_HEIGHT + 0.002, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}


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

export function createBoardGrid(grassDotColor: string, buildableDotColor: string, grassColor: string, soilColor: string, occupiedColor: string, focusColor: string, shapeSeed: number): BoardGrid {
  const group = new Group();
  const tiles: BoardTile[] = [];
  const tileByCellIndex: Array<BoardTile | undefined> = new Array(BOARD_SIZE * BOARD_SIZE);
  const occupiedSurfaces: Array<Mesh | undefined> = new Array(BOARD_SIZE * BOARD_SIZE);
  const buildable: Record<number, true> = {};
  for (const cellIndex of buildableCells) buildable[cellIndex] = true;

  const rowSpans = createRowSpans(shapeSeed);
  const visibleCells = new Array<boolean>(BOARD_SIZE * VISUAL_COLUMN_COUNT).fill(false);
  const visibleGameCells = new Array<boolean>(BOARD_SIZE * BOARD_SIZE).fill(false);
  let visibleCellCount = 0;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = rowSpans[row].firstColumn; column < rowSpans[row].endColumn; column += 1) {
      const visualIndex = row * VISUAL_COLUMN_COUNT + column - VISUAL_MIN_COLUMN;
      visibleCells[visualIndex] = true;
      visibleCellCount += 1;
      if (column >= 0 && column < BOARD_SIZE) visibleGameCells[row * BOARD_SIZE + column] = true;
    }
  }
  for (const cellIndex of buildableCells) {
    const row = Math.floor(cellIndex / BOARD_SIZE);
    const column = cellIndex % BOARD_SIZE;
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        const neighborRow = row + rowOffset;
        const neighborColumn = column + columnOffset;
        const neighborIndex = neighborRow * BOARD_SIZE + neighborColumn;
        if (neighborRow < 0 || neighborRow >= BOARD_SIZE || neighborColumn < 0 || neighborColumn >= BOARD_SIZE || !visibleGameCells[neighborIndex]) {
          throw new Error(`Buildable cell ${cellIndex} needs a one-tile border inside the board footprint.`);
        }
      }
    }
  }

  const geometry = new BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE);
  const tileMaterial = new MeshStandardMaterial({
    color: grassColor,
    colorWrite: false,
    depthWrite: false,
    roughness: 1,
  });
  const grassMaterial = new MeshStandardMaterial({ color: grassColor, roughness: 1 });
  const surfaceGeometry = createFootprintGeometry(rowSpans);
  const surface = new Mesh(surfaceGeometry, grassMaterial);
  group.add(surface);
  const soilGeometry = createSoilGeometry(visibleCells, shapeSeed);
  const soilMaterial = new MeshStandardMaterial({ color: soilColor, roughness: 1, side: DoubleSide });
  const soilMesh = new Mesh(soilGeometry, soilMaterial);
  group.add(soilMesh);

  const occupiedSurfaceGeometry = new BoxGeometry(TILE_SIZE, 0.002, TILE_SIZE);
  const occupiedMaterial = new MeshStandardMaterial({ color: occupiedColor, roughness: 1 });
  const focusGeometry = new EdgesGeometry(new BoxGeometry(TILE_SIZE * 0.9, 0.01, TILE_SIZE * 0.9));
  const focusMaterial = new LineBasicMaterial({ color: focusColor });
  const previewMaterial = new MeshStandardMaterial({
    color: grassColor,
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
  const dotGeometry = new CircleGeometry(0.015, 8);
  const grassDotMaterial = new MeshBasicMaterial({
    color: grassDotColor,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const buildableDotMaterial = new MeshBasicMaterial({
    color: buildableDotColor,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const grassDots = new InstancedMesh(
    dotGeometry,
    grassDotMaterial,
    (visibleCellCount - buildableCells.length) * DOTS_PER_TILE,
  );
  const buildableDots = new InstancedMesh(dotGeometry, buildableDotMaterial, buildableCells.length * DOTS_PER_TILE);
  grassDots.frustumCulled = false;
  buildableDots.frustumCulled = false;
  const dotTransform = new Object3D();
  dotTransform.rotation.x = -Math.PI / 2;
  let grassDotIndex = 0;
  let buildableDotIndex = 0;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = VISUAL_MIN_COLUMN; column <= BOARD_SIZE; column += 1) {
      const visualIndex = row * VISUAL_COLUMN_COUNT + column - VISUAL_MIN_COLUMN;
      if (!visibleCells[visualIndex]) continue;
      const gameCellIndex = column >= 0 && column < BOARD_SIZE ? row * BOARD_SIZE + column : -1;
      const isBuildable = gameCellIndex >= 0 && Boolean(buildable[gameCellIndex]);
      const targetDots = isBuildable ? buildableDots : grassDots;
      let dotIndex = isBuildable ? buildableDotIndex : grassDotIndex;
      for (let dotRow = 0; dotRow < DOTS_PER_SIDE; dotRow += 1) {
        for (let dotColumn = 0; dotColumn < DOTS_PER_SIDE; dotColumn += 1) {
          const dotSeed = visualIndex * DOTS_PER_TILE + dotRow * DOTS_PER_SIDE + dotColumn;
          const x = -BOARD_SIZE / 2 + (column * DOTS_PER_SIDE + dotColumn + 0.5) * DOT_SPACING;
          const z = -BOARD_SIZE / 2 + (row * DOTS_PER_SIDE + dotRow + 0.5) * DOT_SPACING;
          dotTransform.position.set(
            x + (visualRandom(dotSeed * 2) - 0.5) * DOT_JITTER * 2,
            TILE_HEIGHT + 0.004,
            z + (visualRandom(dotSeed * 2 + 1) - 0.5) * DOT_JITTER * 2,
          );
          dotTransform.updateMatrix();
          targetDots.setMatrixAt(dotIndex, dotTransform.matrix);
          dotIndex += 1;
        }
      }
      if (isBuildable) buildableDotIndex = dotIndex;
      else grassDotIndex = dotIndex;
    }
  }

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const cellIndex = row * BOARD_SIZE + column;
      if (!visibleGameCells[cellIndex]) continue;
      const tile = new Mesh(geometry, tileMaterial) as BoardTile;
      tile.position.set(
        column - (BOARD_SIZE - 1) / 2,
        TILE_Y,
        row - (BOARD_SIZE - 1) / 2,
      );
      tile.userData.cellIndex = cellIndex;
      tileByCellIndex[cellIndex] = tile;
      const occupiedSurface = new Mesh(occupiedSurfaceGeometry, occupiedMaterial);
      occupiedSurface.position.set(tile.position.x, TILE_HEIGHT + 0.0025, tile.position.z);
      occupiedSurface.visible = false;
      group.add(occupiedSurface, tile);
      occupiedSurfaces[cellIndex] = occupiedSurface;
      tiles.push(tile);
    }
  }

  grassDots.instanceMatrix.needsUpdate = true;
  buildableDots.instanceMatrix.needsUpdate = true;
  group.add(grassDots, buildableDots);

  return {
    group,
    tiles,
    updateOccupancy(occupancy) {
      for (const tile of tiles) {
        const cellIndex = tile.userData.cellIndex;
        const occupied = occupancy[cellIndex] !== null && occupancy[cellIndex] !== undefined;
        const occupiedSurface = occupiedSurfaces[cellIndex];
        if (occupiedSurface) occupiedSurface.visible = occupied;
      }
    },
    updateFocus(cellIndex, occupancy) {
      if (cellIndex === null) {
        focus.visible = false;
        preview.visible = false;
        return;
      }
      const tile = tileByCellIndex[cellIndex];
      const valid = Boolean(tile && buildable[cellIndex]) &&
        (occupancy[cellIndex] === null || occupancy[cellIndex] === undefined);
      if (!tile || !valid) {
        focus.visible = false;
        preview.visible = false;
        return;
      }
      focus.position.x = tile.position.x;
      focus.position.z = tile.position.z;
      focus.material.color.set(focusColor);
      focus.visible = true;
      preview.position.x = tile.position.x;
      preview.position.z = tile.position.z;
      preview.visible = valid;
    },
    dispose() {
      surfaceGeometry.dispose();
      occupiedSurfaceGeometry.dispose();
      geometry.dispose();
      dotGeometry.dispose();
      grassDots.dispose();
      buildableDots.dispose();
      focusGeometry.dispose();
      preview.geometry.dispose();
      grassMaterial.dispose();
      occupiedMaterial.dispose();
      grassDotMaterial.dispose();
      buildableDotMaterial.dispose();
      focusMaterial.dispose();
      previewMaterial.dispose();
      soilGeometry.dispose();
      soilMaterial.dispose();
    },
  };
}


import cells from '../data/board.json';

const BOARD_WIDTH = 8;
const BOARD_HEIGHT = 8;

export const BUILDABLE_CELLS = Object.freeze(cells);

export function isBuildableCell(index: number): boolean {
  return Number.isInteger(index) && BUILDABLE_CELLS.includes(index);
}

export function labelCell(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_WIDTH * BOARD_HEIGHT) return '';

  const row = Math.floor(index / BOARD_WIDTH) + 1;
  const column = String.fromCharCode(65 + (index % BOARD_WIDTH));
  return `${column}${row}`;
}

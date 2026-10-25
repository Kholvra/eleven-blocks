import cells from '../data/board.json';

const BOARD_WIDTH = 8;
const BOARD_HEIGHT = 8;

export const BUILDABLE_CELLS = Object.freeze(cells);

export function areCellsAdjacent(first: number, second: number): boolean {
  if (!Number.isInteger(first) || !Number.isInteger(second) ||
      first < 0 || second < 0 || first >= BOARD_WIDTH * BOARD_HEIGHT || second >= BOARD_WIDTH * BOARD_HEIGHT) return false;

  const difference = Math.abs(first - second);
  return difference === BOARD_WIDTH ||
    (difference === 1 && Math.floor(first / BOARD_WIDTH) === Math.floor(second / BOARD_WIDTH));
}

export function isBuildableCell(index: number): boolean {
  return Number.isInteger(index) && BUILDABLE_CELLS.includes(index);
}

export function labelCell(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_WIDTH * BOARD_HEIGHT) return '';

  const row = Math.floor(index / BOARD_WIDTH) + 1;
  const column = String.fromCharCode(65 + (index % BOARD_WIDTH));
  return `${column}${row}`;
}

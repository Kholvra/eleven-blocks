import { describe, expect, it } from 'vitest';
import { BUILDABLE_CELLS, isBuildableCell, labelCell } from '../src/game/board';

const expectedBuildableCells = [
  17, 18, 19, 20, 21, 22,
  25, 26, 27, 28, 29, 30,
  33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46,
];

describe('board layout', () => {
  it('defines 24 unique in-bounds buildable cells in the centered 4×6 rectangle', () => {
    expect(BUILDABLE_CELLS).toHaveLength(24);
    expect(new Set(BUILDABLE_CELLS).size).toBe(24);
    expect(BUILDABLE_CELLS).toEqual(expectedBuildableCells);
    expect(BUILDABLE_CELLS.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < 64)).toBe(true);
    expect(BUILDABLE_CELLS.every((cell) => isBuildableCell(cell))).toBe(true);
  });

  it('labels flat 8×8 indices with one-based rows and A–H columns', () => {
    expect(labelCell(0)).toBe('A1');
    expect(labelCell(7)).toBe('H1');
    expect(labelCell(8)).toBe('A2');
    expect(labelCell(17)).toBe('B3');
    expect(labelCell(46)).toBe('G6');
    expect(labelCell(63)).toBe('H8');
  });

  it('rejects invalid buildable indices and labels', () => {
    expect(isBuildableCell(-1)).toBe(false);
    expect(isBuildableCell(16)).toBe(false);
    expect(isBuildableCell(17.5)).toBe(false);
    expect(isBuildableCell(64)).toBe(false);
    expect(labelCell(-1)).toBe('');
    expect(labelCell(64)).toBe('');
    expect(labelCell(1.5)).toBe('');
  });
});

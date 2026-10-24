import { Box3, Group, InstancedMesh, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import buildableCells from '../data/board.json';
import cardArt from '../data/card-art.json';
import cardsData from '../data/cards.json';
import type { GameState } from '../game/types';
import type { BoardTile } from './grid';

interface CardVisual {
  readonly id: string;
  readonly category: string;
}

interface CellVisual {
  readonly cardIndex: number;
  readonly cardId: string;
  readonly modelKey: string;
  readonly matrix: Matrix4;
}

interface ModelPart {
  readonly modelKey: string;
  readonly mesh: InstancedMesh;
  readonly sourceMatrix: Matrix4;
}

const MODEL_BY_CATEGORY: Record<string, string> = cardArt.modelByCategory;
const MODEL_BY_CARD_ID: Record<string, string> = cardArt.modelByCardId;


const CARD_BY_INDEX: Record<number, CardVisual> = {};
for (const card of cardsData.kebijakan) {
  CARD_BY_INDEX[card.idx - 1] = { id: card.id, category: card.kategori };
}

const MAX_FOOTPRINT = 0.82;

export interface BuildingLayer {
  readonly group: Group;
  sync(state: GameState): void;
}

export function createBuildingLayer(models: ReadonlyMap<string, Object3D>, tiles: readonly BoardTile[]): BuildingLayer {
  const group = new Group();
  const parts: ModelPart[] = [];
  const buildable: Record<number, true> = {};
  for (const cellIndex of buildableCells) buildable[cellIndex] = true;
  const cells: Record<number, CellVisual> = {};
  const boundsByModel: Record<string, Box3> = {};
  const partsByModel: Record<string, ModelPart[]> = {};

  for (const [modelKey, model] of models) {
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model);
    const size = bounds.getSize(new Vector3());
    if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z) || size.x <= 0 || size.y <= 0 || size.z <= 0) {
      continue;
    }
    boundsByModel[modelKey] = bounds;
    const modelParts: ModelPart[] = [];
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const instanced = new InstancedMesh(object.geometry, object.material, tiles.length);
      instanced.count = 0;
      instanced.frustumCulled = false;
      group.add(instanced);
      const part = { modelKey, mesh: instanced, sourceMatrix: object.matrixWorld.clone() };
      modelParts.push(part);
      parts.push(part);
    });
    partsByModel[modelKey] = modelParts;
  }

  const temporary = new Matrix4();
  const scaleMatrix = new Matrix4();
  const offsetMatrix = new Matrix4();
  const translationMatrix = new Matrix4();
  const center = new Vector3();
  const tileTop = (tile: BoardTile): number => tile.position.y + tile.geometry.parameters.height / 2;

  function visualForCell(cardIndex: number, tile: BoardTile): CellVisual | null {
    const card = CARD_BY_INDEX[cardIndex];
    if (!card) return null;
    const modelKey = MODEL_BY_CARD_ID[card.id] ?? MODEL_BY_CATEGORY[card.category];
    const bounds = modelKey ? boundsByModel[modelKey] : undefined;
    const modelParts = modelKey ? partsByModel[modelKey] : undefined;
    if (!modelKey || !bounds || !modelParts?.length) return null;

    const size = bounds.getSize(new Vector3());
    const scale = Math.min(1, MAX_FOOTPRINT / size.x, MAX_FOOTPRINT / size.z);
    center.set((bounds.min.x + bounds.max.x) / 2, bounds.min.y, (bounds.min.z + bounds.max.z) / 2);
    scaleMatrix.makeScale(scale, scale, scale);
    offsetMatrix.makeTranslation(-center.x, -center.y, -center.z);
    translationMatrix.makeTranslation(tile.position.x, tileTop(tile), tile.position.z);
    temporary.copy(translationMatrix).multiply(scaleMatrix).multiply(offsetMatrix);
    return { cardIndex, cardId: card.id, modelKey, matrix: temporary.clone() };
  }

  return {
    group,
    sync(state) {
      for (const key of Object.keys(cells)) {
        const index = Number(key);
        const cardIndex = state.papan.ubin[index];
        if (!buildable[index]) {
          delete cells[index];
          continue;
        }
        const card = Number.isInteger(cardIndex) ? CARD_BY_INDEX[cardIndex as number] : undefined;
        const nextModelKey = card ? (MODEL_BY_CARD_ID[card.id] ?? MODEL_BY_CATEGORY[card.category]) : undefined;
        const previous = cells[index];
        if (!card || previous.cardIndex !== cardIndex || previous.cardId !== card.id || previous.modelKey !== nextModelKey ||
          !boundsByModel[nextModelKey ?? ''] || !partsByModel[nextModelKey ?? '']?.length) {
          delete cells[index];
        }
      }

      for (const tile of tiles) {
        const index = tile.userData.cellIndex;
        if (!buildable[index]) continue;
        const cardIndex = state.papan.ubin[index];
        if (!Number.isInteger(cardIndex)) continue;
        const existing = cells[index];
        if (existing && existing.cardIndex === cardIndex) continue;
        const visual = visualForCell(cardIndex as number, tile);
        if (visual) cells[index] = visual;
      }

      for (const part of parts) {
        let instanceIndex = 0;
        for (const tile of tiles) {
          const visual = cells[tile.userData.cellIndex];
          if (!visual || visual.modelKey !== part.modelKey) continue;
          temporary.copy(visual.matrix).multiply(part.sourceMatrix);
          part.mesh.setMatrixAt(instanceIndex, temporary);
          instanceIndex += 1;
        }
        part.mesh.count = instanceIndex;
        part.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}


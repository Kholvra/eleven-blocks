import { Box3, BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
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
const MODEL_SCALE_OVERRIDE: Record<string, number> = {
  park: 0.45,
  pocketPark: 0.52,
  canopyTree: 0.65,
  mangroveTree: 0.70,
  tree: 0.65,
  dumpster: 0.50,
  recycleBin: 0.55,
  bicycle: 0.55,
  trafficGate: 0.82,
  schoolZone: 0.95,
  roadBridge: 0.95,
  solarRoof: 0.80,
  waterTower: 0.75,
  communityHouse: 0.80,
  rusunawa: 0.85,
  carParking: 1.0,
  canalBridge: 0.90,
  market: 0.85,
  streetFood: 0.75,
  building: 0.85,
  bus: 0.70,
  busStop: 0.70,
  road: 0.95,
};


export interface BuildingLayer {
  readonly group: Group;
  sync(state: GameState): void;
}

export function createBuildingLayer(
  models: ReadonlyMap<string, Object3D>,
  tiles: readonly BoardTile[],
  waterColorStr: string = '#3e86b5',
  baseColorStr: string = '#d4bc97',
): BuildingLayer {
  const group = new Group();
  const parts: ModelPart[] = [];
  const buildable: Record<number, true> = {};
  for (const cellIndex of buildableCells) buildable[cellIndex] = true;
  const cells: Record<number, CellVisual> = {};
  const boundsByModel: Record<string, Box3> = {};
  const partsByModel: Record<string, ModelPart[]> = {};
  // Baseplate diorama meshes using project color tokens
  const waterGeometry = new BoxGeometry(0.48, 0.015, 0.82);
  const waterMaterial = new MeshStandardMaterial({ color: new Color(waterColorStr), roughness: 0.15, metalness: 0.2 });
  const waterMesh = new InstancedMesh(waterGeometry, waterMaterial, tiles.length);
  waterMesh.frustumCulled = false;
  group.add(waterMesh);

  const plazaGeometry = new CylinderGeometry(0.38, 0.40, 0.012, 16);
  const plazaMaterial = new MeshStandardMaterial({ color: new Color(baseColorStr), roughness: 0.8, metalness: 0.05 });
  const plazaMesh = new InstancedMesh(plazaGeometry, plazaMaterial, tiles.length);
  plazaMesh.count = 0;
  plazaMesh.frustumCulled = false;
  group.add(plazaMesh);

  const concreteGeometry = new BoxGeometry(0.80, 0.012, 0.80);
  const concreteMaterial = new MeshStandardMaterial({ color: new Color(baseColorStr), roughness: 0.7, metalness: 0.1 });
  const concreteMesh = new InstancedMesh(concreteGeometry, concreteMaterial, tiles.length);
  concreteMesh.count = 0;
  concreteMesh.frustumCulled = false;
  group.add(concreteMesh);

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
    const multiplier = MODEL_SCALE_OVERRIDE[modelKey] ?? 1;
    const scale = Math.min(1, MAX_FOOTPRINT / size.x, MAX_FOOTPRINT / size.z) * multiplier;
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
      let waterCount = 0;
      let plazaCount = 0;
      let concreteCount = 0;
      const baseplateMatrix = new Matrix4();

      for (const tile of tiles) {
        const visual = cells[tile.userData.cellIndex];
        if (!visual) continue;
        if (visual.modelKey === 'canalBridge') {
          baseplateMatrix.makeTranslation(tile.position.x, tileTop(tile) + 0.01, tile.position.z);
          waterMesh.setMatrixAt(waterCount++, baseplateMatrix);
        } else if (visual.modelKey === 'pocketPark' || visual.modelKey === 'park') {
          baseplateMatrix.makeTranslation(tile.position.x, tileTop(tile) + 0.006, tile.position.z);
          plazaMesh.setMatrixAt(plazaCount++, baseplateMatrix);
        } else if (visual.modelKey === 'recycleBin') {
          baseplateMatrix.makeTranslation(tile.position.x, tileTop(tile) + 0.006, tile.position.z);
          concreteMesh.setMatrixAt(concreteCount++, baseplateMatrix);
        }
      }
      waterMesh.count = waterCount;
      waterMesh.instanceMatrix.needsUpdate = true;
      plazaMesh.count = plazaCount;
      plazaMesh.instanceMatrix.needsUpdate = true;
      concreteMesh.count = concreteCount;
      concreteMesh.instanceMatrix.needsUpdate = true;
    },
  };
}


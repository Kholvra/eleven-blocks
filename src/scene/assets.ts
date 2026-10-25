import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Object3D } from 'three';

const modelUrls = {
  building: new URL('../assets/3d/building.glb', import.meta.url).href,
  tree: new URL('../assets/3d/tree.glb', import.meta.url).href,
  road: new URL('../assets/3d/road.glb', import.meta.url).href,
  dumpster: new URL('../assets/3d/dumpster.glb', import.meta.url).href,
  bus: new URL('../assets/3d/bus.glb', import.meta.url).href,
  bicycle: new URL('../assets/3d/bicycle.glb', import.meta.url).href,
  busStop: new URL('../assets/3d/bus-stop.glb', import.meta.url).href,
  market: new URL('../assets/3d/market.glb', import.meta.url).href,
  recycleBin: new URL('../assets/3d/recycle-bin.glb', import.meta.url).href,
  park: new URL('../assets/3d/park.glb', import.meta.url).href,
  trafficGate: new URL('../assets/3d/traffic-gate.glb', import.meta.url).href,
  schoolZone: new URL('../assets/3d/school-zone.glb', import.meta.url).href,
  communityHouse: new URL('../assets/3d/community-house.glb', import.meta.url).href,
  canalBridge: new URL('../assets/3d/canal-bridge.glb', import.meta.url).href,
  waterTower: new URL('../assets/3d/water-tower.glb', import.meta.url).href,
  pocketPark: new URL('../assets/3d/pocket-park.glb', import.meta.url).href,
  mangroveTree: new URL('../assets/3d/mangrove-tree.glb', import.meta.url).href,
  solarRoof: new URL('../assets/3d/solar-roof.glb', import.meta.url).href,
  rusunawa: new URL('../assets/3d/rusunawa.glb', import.meta.url).href,
  streetFood: new URL('../assets/3d/street-food.glb', import.meta.url).href,
  canopyTree: new URL('../assets/3d/canopy-tree.glb', import.meta.url).href,
  roadBridge: new URL('../assets/3d/road-bridge.glb', import.meta.url).href,
  carParking: new URL('../assets/3d/car-parking.glb', import.meta.url).href,
};

export async function loadBuildingModels(): Promise<ReadonlyMap<string, Object3D>> {
  const loader = new GLTFLoader();
  const loaded = await Promise.all(Object.entries(modelUrls).map(async ([name, url]) => {
    try {
      const gltf = await loader.loadAsync(url);
      return [name, gltf.scene] as const;
    } catch {
      console.warn(`Model 3D '${name}' gagal dimuat.`);
      return null;
    }
  }));
  const models = new Map<string, Object3D>();
  for (const entry of loaded) {
    if (entry) models.set(entry[0], entry[1]);
  }
  return models;
}

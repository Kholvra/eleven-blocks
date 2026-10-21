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

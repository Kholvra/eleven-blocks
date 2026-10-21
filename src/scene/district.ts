import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';

interface DistrictColors {
  readonly page: string;
  readonly surface: string;
  readonly air: string;
  readonly access: string;
  readonly green: string;
  readonly border: string;
}

interface DistrictInstance {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly color: string;
  readonly rotationY?: number;
}

/** Build the quiet district landmarks framing the playable board. */
export function createDistrictIdentity(colors: DistrictColors): Group {
  const group = new Group();
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const slab = new BoxGeometry(1, 1, 1);
  const post = new CylinderGeometry(0.055, 0.055, 1, 5);
  const bin = new CylinderGeometry(0.16, 0.18, 0.42, 7);
  const marker = new ConeGeometry(0.28, 0.38, 4);
  const slabs: DistrictInstance[] = [];
  const posts: DistrictInstance[] = [];
  const bins: DistrictInstance[] = [];
  const markers: DistrictInstance[] = [];

  function box(color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    slabs.push({ x, y, z, sx, sy, sz, color });
  }

  function pole(x: number, y: number, z: number, height: number): void {
    posts.push({ x, y: y + height / 2, z, sx: 1, sy: height, sz: 1, color: colors.border });
  }

  // A tight, offset run of low walls leaves a narrow alley at the west edge.
  box(colors.page, -4.45, 0.035, -0.55, 0.72, 0.07, 3.9);
  box(colors.border, -4.98, 0.32, -0.85, 0.34, 0.62, 1.45);
  box(colors.surface, -4.98, 0.28, 0.85, 0.34, 0.54, 1.28);
  box(colors.border, -4.65, 0.24, -1.05, 0.3, 0.46, 1.15);
  box(colors.surface, -4.65, 0.3, 0.8, 0.3, 0.58, 1.28);

  // Three compact awnings and counters distinguish the PKL market on the east.
  for (const z of [-2.55, -1.35, -0.15]) {
    box(colors.border, 4.75, 0.2, z, 0.72, 0.4, 0.62);
    box(colors.access, 4.75, 0.62, z, 0.96, 0.12, 0.82);
    pole(4.34, 0.04, z - 0.34, 0.58);
    pole(5.16, 0.04, z - 0.34, 0.58);
    pole(4.34, 0.04, z + 0.34, 0.58);
    pole(5.16, 0.04, z + 0.34, 0.58);
  }

  // The blue channel and pale banks mark the river along the north edge.
  box(colors.surface, -0.35, 0.03, -4.48, 7.2, 0.06, 0.88);
  box(colors.air, -0.35, 0.045, -4.48, 6.45, 0.035, 0.56);
  box(colors.green, -0.35, 0.075, -4.98, 7.2, 0.09, 0.14);
  box(colors.green, -0.35, 0.075, -3.98, 7.2, 0.09, 0.14);

  // The TPS collection point has an open, camera-facing side so all three bins remain visible.
  box(colors.page, 4.97, 0.04, 4.95, 1.7, 0.08, 1.45);
  box(colors.border, 4.97, 0.28, 4.22, 1.7, 0.48, 0.12);
  box(colors.border, 4.12, 0.28, 4.95, 0.12, 0.48, 1.45);
  bins.push(
    { x: 4.47, y: 0.3, z: 4.92, sx: 1, sy: 1, sz: 1, color: colors.green },
    { x: 4.97, y: 0.3, z: 4.92, sx: 1, sy: 1, sz: 1, color: colors.access },
    { x: 5.47, y: 0.3, z: 4.92, sx: 1, sy: 1, sz: 1, color: colors.green },
  );
  markers.push({
    x: 4.97,
    y: 0.98,
    z: 4.95,
    sx: 1,
    sy: 1,
    sz: 1,
    color: colors.border,
    rotationY: Math.PI / 4,
  });

  const transform = new Object3D();
  const color = material.color.clone();
  function addInstances(geometry: BoxGeometry | CylinderGeometry | ConeGeometry, instances: DistrictInstance[]): void {
    const mesh = new InstancedMesh(geometry, material, instances.length);
    for (let i = 0; i < instances.length; i += 1) {
      const instance = instances[i];
      transform.position.set(instance.x, instance.y, instance.z);
      transform.rotation.set(0, instance.rotationY ?? 0, 0);
      transform.scale.set(instance.sx, instance.sy, instance.sz);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      color.set(instance.color);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  addInstances(slab, slabs);
  addInstances(post, posts);
  addInstances(bin, bins);
  addInstances(marker, markers);
  return group;
}

// Ember Yard: an original dusk freight yard, 44 x 36 m, built from boxes only.
// Three lanes: A Long down the east side, Mid through the centre, B Tunnel down the west.
// Two bomb sites (A east, B west) sit in the defenders' half; attackers spawn south,
// defenders north. Every box is a collider and a surface a bullet stops on. The map also
// exports its waypoint graph (bots walk it), its site zones and a flat rect list the HUD
// minimap draws, so the map, the AI and the minimap can never disagree.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  bounds: { minX: -22, maxX: 22, minZ: -18, maxZ: 18 },
  sites: {
    A: { x: 14.5, z: -12.5, r: 4.5, label: 'A' },
    B: { x: -14.5, z: -12.5, r: 4.5, label: 'B' },
  },
  spawns: {
    attackers: [
      [0, 15.5], [-3, 16], [3, 16], [-6, 14.5], [6, 14.5],
    ],
    defenders: [
      [0, -15.5], [-4, -15], [4, -15], [-8, -14], [8, -14],
    ],
  },
  // Waypoint graph: [x, z] nodes, edges by index. Bots BFS through it.
  waypoints: [
    [0, 15.5], [-3, 10], [3, 10], [0, 4], [0, -2], [0, -8], // 0-5 mid spine
    [9, 12], [14, 8], [16, 2], [16, -6], [14.5, -12.5], // 6-10 A long
    [-9, 12], [-14, 8], [-16, 2], [-16, -6], [-14.5, -12.5], // 11-15 B tunnel
    [7, -13], [-7, -13], [0, -15.5], // 16-18 defender holds
    [-8, 0], [8, 0], // 19-20 mid connectors
  ],
  edges: [
    [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5], [5, 18],
    [0, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 16], [9, 19],
    [0, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 17], [14, 20],
    [4, 19], [4, 20], [19, 13], [20, 8], [16, 18], [17, 18], [5, 16], [5, 17],
  ],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const colliders = [];
  const shootables = [];
  const minimapRects = [];

  function box(w, h, d, x, y, z, material, map = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    if (map) minimapRects.push([x - w / 2, z - d / 2, w, d]);
    return mesh;
  }

  // Ground and perimeter, 44 x 36 m, 5 m walls, open dusk sky above.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'ground');
  box(0.4, 5, 36.4, -22.2, 2.5, 0, 'surface');
  box(0.4, 5, 36.4, 22.2, 2.5, 0, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, -18.2, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, 18.2, 'surface');

  // Mid: a spine of containers and pillars splitting the centre lane.
  box(2.2, 2.4, 1.2, -2.6, 1.2, 4, 'hairline');
  box(2.2, 2.4, 1.2, 2.6, 1.2, -2, 'hairline');
  box(1.2, 3.4, 1.2, 0, 1.7, -8, 'hairline');
  box(3.4, 1.1, 1.2, -5, 0.55, 8, 'hairline');
  box(3.4, 1.1, 1.2, 5, 0.55, 8, 'hairline');
  box(1.6, 1.1, 1.6, -7.5, 0.55, -4.5, 'hairline');
  box(1.6, 1.1, 1.6, 7.5, 0.55, -4.5, 'hairline');

  // A Long (east): stacked containers forming a zig-zag sightline.
  box(4.2, 2.4, 1.4, 11, 1.2, 10, 'surface');
  box(1.4, 2.4, 4.2, 18.5, 1.2, 5, 'surface');
  box(3.6, 1.1, 1.4, 13, 0.55, 0, 'hairline');
  box(1.4, 2.4, 3.6, 18.5, 1.2, -7, 'surface');
  box(2.2, 1.1, 2.2, 10.5, 0.55, -10, 'hairline');
  box(1.2, 3.0, 1.2, 19.5, 1.5, -12.5, 'hairline');

  // B Tunnel (west): low roofed passage, crates inside for close fights.
  box(4.2, 2.4, 1.4, -11, 1.2, 10, 'surface');
  box(1.4, 2.4, 4.2, -18.5, 1.2, 5, 'surface');
  box(6.0, 0.4, 3.0, -16, 2.6, 2, 'surface', false); // tunnel roof
  box(1.2, 1.1, 1.2, -15.5, 0.55, -1, 'hairline');
  box(2.4, 1.1, 1.2, -13, 0.55, -6, 'hairline');
  box(2.2, 1.1, 2.2, -10.5, 0.55, -10, 'hairline');
  box(1.2, 3.0, 1.2, -19.5, 1.5, -12.5, 'hairline');

  // Defender half: site cover and the raised gantry between the sites.
  box(6.0, 0.5, 2.4, 0, 0.25, -13.5, 'surface');
  box(2.0, 1.1, 2.0, 8, 0.55, -15, 'hairline');
  box(2.0, 1.1, 2.0, -8, 0.55, -15, 'hairline');
  box(1.0, 2.2, 1.0, 5, 1.1, -12, 'hairline');
  box(1.0, 2.2, 1.0, -5, 1.1, -12, 'hairline');

  // Site pads: glowing floor markers, not colliders.
  const siteGeo = new THREE.PlaneGeometry(7, 7);
  for (const key of ['A', 'B']) {
    const site = MAP.sites[key];
    const pad = new THREE.Mesh(
      siteGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.site), transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.x, 0.02, site.z);
    group.add(pad);
  }

  // Dusk light: low warm key from the west, cool fill, hemisphere sky.
  const sky = new THREE.HemisphereLight(new THREE.Color('#4a5568'), new THREE.Color(PALETTE.canvas), 2.1);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb35c'), 3.0);
  key.position.set(-14, 12, 10);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.9);
  fill.position.set(10, 9, -12);
  scene.add(fill);

  return { colliders, shootables, group, minimapRects, sites: MAP.sites };
}

// Small objects described as a list of simple shapes, so a scene (or a dream
// generator) can define any item without code. The same description builds
// the object in the world and its model in the inventory.
//   { shape: 'box', size: [w, h, d] } | { shape: 'cyl', size: [rTop, rBottom, h, sides] }
//   { shape: 'sphere', size: [r, w, h] } | { shape: 'plane', size: [w, h] } | { shape: 'torus', size: [r, tube] }
//   plus pos [x, y, z], rot [deg, deg, deg], tex, color, unlit
import * as THREE from '../../vendor/three.module.js?v=a57a173';
import { setVertexShade } from './ps1material.js?v=a57a173';

export const ITEM_MODELS = {
  menu: [
    { shape: 'box', size: [0.22, 0.012, 0.32], tex: 'lacquer', pos: [0, 0.006, 0] },
    { shape: 'box', size: [0.16, 0.002, 0.04], tex: 'gold', pos: [0, 0.013, -0.09] },
  ],
  needle: [
    { shape: 'cyl', size: [0.003, 0.003, 0.16, 4], color: '#e8eef0', rot: [0, 0, 90], pos: [0, 0.01, 0] },
    { shape: 'cyl', size: [0.012, 0.012, 0.04, 6], color: '#c03030', rot: [0, 0, 90], pos: [-0.09, 0.01, 0] },
  ],
  water: [
    { shape: 'cyl', size: [0.035, 0.03, 0.12, 8], color: '#b8d0d8', pos: [0, 0.06, 0] },
    { shape: 'cyl', size: [0.031, 0.031, 0.004, 8], color: '#d8eef4', unlit: true, pos: [0, 0.1, 0] },
  ],
  book: [
    { shape: 'box', size: [0.28, 0.04, 0.36], tex: 'lacquer', pos: [0, 0.02, 0] },
    { shape: 'box', size: [0.26, 0.042, 0.34], tex: 'cream', pos: [0.006, 0.02, 0] },
  ],
  fortune: [
    { shape: 'sphere', size: [0.045, 6, 4], color: '#d8a050', pos: [0, 0.03, 0] },
    { shape: 'box', size: [0.08, 0.004, 0.015], color: '#f4f0e6', pos: [0.03, 0.03, 0] },
  ],
  matchbook: [
    { shape: 'box', size: [0.05, 0.01, 0.08], tex: 'saffron', pos: [0, 0.005, 0] },
    { shape: 'box', size: [0.05, 0.002, 0.02], color: '#2a1a10', pos: [0, 0.011, 0.025] },
  ],
  coin: [{ shape: 'cyl', size: [0.025, 0.025, 0.005, 10], tex: 'gold', pos: [0, 0.003, 0] }],
  polish: [
    { shape: 'cyl', size: [0.018, 0.022, 0.05, 6], color: '#c01830', pos: [0, 0.025, 0] },
    { shape: 'cyl', size: [0.008, 0.012, 0.035, 6], color: '#1a1a1a', pos: [0, 0.067, 0] },
  ],
  swatch: [
    { shape: 'box', size: [0.08, 0.004, 0.2], color: '#e8e4dc', pos: [0, 0.002, 0] },
    { shape: 'box', size: [0.07, 0.005, 0.04], color: '#c43a30', pos: [0, 0.004, -0.07] },
    { shape: 'box', size: [0.07, 0.005, 0.04], color: '#2a8a4a', pos: [0, 0.004, -0.02] },
    { shape: 'box', size: [0.07, 0.005, 0.04], color: '#e0b030', pos: [0, 0.004, 0.03] },
    { shape: 'box', size: [0.07, 0.005, 0.04], color: '#d8d4cc', pos: [0, 0.004, 0.08] },
  ],
  plates: [
    { shape: 'cyl', size: [0.13, 0.11, 0.012, 10], color: '#efe9dc', pos: [0, 0.006, 0] },
    { shape: 'cyl', size: [0.13, 0.11, 0.012, 10], color: '#e8dcc8', pos: [0.004, 0.02, -0.003] },
    { shape: 'cyl', size: [0.13, 0.11, 0.012, 10], color: '#efe9dc', pos: [-0.003, 0.034, 0.004] },
    { shape: 'cyl', size: [0.12, 0.1, 0.012, 10], color: '#e4d6c4', pos: [0.005, 0.048, 0] },
    { shape: 'cyl', size: [0.13, 0.11, 0.012, 10], color: '#efe9dc', pos: [-0.004, 0.062, -0.004] },
    { shape: 'cyl', size: [0.12, 0.1, 0.012, 10], color: '#e8dcc8', pos: [0.003, 0.076, 0.003] },
    { shape: 'cyl', size: [0.11, 0.09, 0.03, 8], color: '#b03028', pos: [0.02, 0.1, 0.01] },
  ],
  camera: [
    { shape: 'box', size: [0.13, 0.08, 0.05], color: '#2a2a2c', tex: 'plastic', pos: [0, 0.04, 0] },
    { shape: 'box', size: [0.13, 0.03, 0.05], color: '#c8c4b8', tex: 'chrome', pos: [0, 0.085, 0] },
    { shape: 'cyl', size: [0.028, 0.03, 0.04, 8], color: '#1a1a1a', rot: [90, 0, 0], pos: [0.005, 0.04, 0.04] },
    { shape: 'box', size: [0.02, 0.012, 0.02], color: '#d8d4cc', pos: [0.04, 0.105, 0] },
  ],
  bag: [
    { shape: 'box', size: [0.3, 0.22, 0.12], tex: 'coat', color: '#6a5a3a', pos: [0, 0.11, 0] },
    { shape: 'box', size: [0.3, 0.06, 0.13], tex: 'coat', color: '#5a4a2e', pos: [0, 0.2, 0] },
    { shape: 'torus', size: [0.09, 0.008, 4, 10], color: '#4a3a24', pos: [0, 0.3, 0] },
  ],
  finger: [
    { shape: 'cyl', size: [0.011, 0.013, 0.07, 6], color: '#d8b098', rot: [0, 0, 90], pos: [0, 0.012, 0] },
    { shape: 'cyl', size: [0.009, 0.011, 0.03, 6], color: '#c8a088', rot: [0, 0, 90], pos: [0.05, 0.012, 0] },
    { shape: 'box', size: [0.012, 0.004, 0.01], color: '#e8d8c8', pos: [0.064, 0.016, 0] },
  ],
  bug: [
    { shape: 'sphere', size: [0.02, 6, 4], color: '#3a4a2a', pos: [0, 0.02, 0] },
    { shape: 'sphere', size: [0.014, 6, 4], color: '#2a3a20', pos: [0, 0.022, 0.025] },
    { shape: 'box', size: [0.06, 0.002, 0.016], color: '#c8d8b0', pos: [0, 0.035, -0.005], rot: [0, 0, 8] },
  ],
  badge: [
    { shape: 'box', size: [0.08, 0.11, 0.004], color: '#f4f0e8', pos: [0, 0.055, 0] },
    { shape: 'box', size: [0.06, 0.02, 0.005], color: '#2040a0', pos: [0, 0.09, 0] },
    { shape: 'box', size: [0.004, 0.2, 0.004], color: '#2040a0', pos: [0, 0.2, 0] },
  ],
  key: [
    { shape: 'cyl', size: [0.02, 0.02, 0.006, 8], tex: 'gold', rot: [90, 0, 0], pos: [-0.04, 0.01, 0] },
    { shape: 'box', size: [0.07, 0.006, 0.012], tex: 'gold', pos: [0.015, 0.01, 0] },
    { shape: 'box', size: [0.01, 0.006, 0.02], tex: 'gold', pos: [0.04, 0.01, 0.012] },
  ],
  photo: [
    { shape: 'box', size: [0.12, 0.004, 0.09], color: '#f2ece0', pos: [0, 0.002, 0] },
    { shape: 'box', size: [0.1, 0.005, 0.07], color: '#6a5038', pos: [0, 0.003, 0] },
  ],
  card: [
    { shape: 'box', size: [0.14, 0.004, 0.1], color: '#f6f1e4', pos: [0, 0.002, 0] },
    { shape: 'box', size: [0.1, 0.005, 0.012], color: '#8a1a1a', pos: [0, 0.004, -0.025] },
    { shape: 'box', size: [0.08, 0.005, 0.006], color: '#3a3a3a', pos: [0, 0.004, 0.0] },
    { shape: 'box', size: [0.06, 0.005, 0.006], color: '#3a3a3a', pos: [0, 0.004, 0.02] },
    { shape: 'box', size: [0.13, 0.005, 0.004], tex: 'gold', pos: [0, 0.004, 0.045] },
  ],
  binoculars: [
    { shape: 'cyl', size: [0.03, 0.035, 0.12, 6], color: '#2a2a2a', rot: [90, 0, 0], pos: [-0.035, 0.035, 0] },
    { shape: 'cyl', size: [0.03, 0.035, 0.12, 6], color: '#2a2a2a', rot: [90, 0, 0], pos: [0.035, 0.035, 0] },
    { shape: 'box', size: [0.04, 0.02, 0.03], color: '#1a1a1a', pos: [0, 0.035, 0] },
  ],
};

export function buildShapes(shapes, mat) {
  if (typeof shapes === 'string') shapes = ITEM_MODELS[shapes] || ITEM_MODELS.coin;
  const g = new THREE.Group();
  for (const s of shapes) {
    const z = s.size || [0.1, 0.1, 0.1];
    let geo;
    if (s.shape === 'cyl') geo = new THREE.CylinderGeometry(z[0], z[1], z[2], z[3] || 8);
    else if (s.shape === 'sphere') geo = new THREE.SphereGeometry(z[0], z[1] || 8, z[2] || 6);
    else if (s.shape === 'plane') geo = new THREE.PlaneGeometry(z[0], z[1]);
    else if (s.shape === 'torus') geo = new THREE.TorusGeometry(z[0], z[1], z[2] || 4, z[3] || 10);
    else geo = new THREE.BoxGeometry(z[0], z[1], z[2]);
    setVertexShade(geo, 1);
    const m = new THREE.Mesh(geo, mat(s.tex || 'white', s.color || null, { unlit: !!s.unlit }));
    if (s.pos) m.position.fromArray(s.pos);
    if (s.rot) m.rotation.set(...s.rot.map(THREE.MathUtils.degToRad));
    g.add(m);
  }
  return g;
}

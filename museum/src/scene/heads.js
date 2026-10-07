// A sculpted low-poly head, the way the N64 and PS1 games did it: eight rings
// of ten vertices shaped into a chin, jaw, mouth, nose, eye sockets, brow and
// forehead, closed at the crown, with one small texture: the face photograph
// (or painted face) projected flat onto the front and stretched round to the
// ears, hair and skin painted on the back half. Around 180 triangles.
import * as THREE from '../../vendor/three.module.js?v=dccac0a';
import { createPS1Material, setVertexShade } from '../engine/ps1material.js?v=dccac0a';
import { headAtlas } from '../engine/faces.js?v=dccac0a';

// Rings from chin to crown: height (head centre at 0), half width, depth in
// front of centre, depth behind. The head is 0.25 tall, 0.21 wide, 0.22 deep.
const RINGS = [
  { y: -0.125, rx: 0.046, zf: 0.060, zb: 0.040 },   // chin
  { y: -0.095, rx: 0.082, zf: 0.088, zb: 0.078 },   // jaw
  { y: -0.055, rx: 0.097, zf: 0.100, zb: 0.096 },   // mouth
  { y: -0.015, rx: 0.102, zf: 0.104, zb: 0.106 },   // under the nose
  { y: 0.030, rx: 0.106, zf: 0.098, zb: 0.112 },    // eyes (sockets sit back)
  { y: 0.065, rx: 0.106, zf: 0.108, zb: 0.114 },    // brow
  { y: 0.100, rx: 0.098, zf: 0.100, zb: 0.108 },    // forehead
  { y: 0.125, rx: 0.068, zf: 0.066, zb: 0.078 },    // crown ring
];
const APEX = 0.142, N = 10;
const FACE_LIMIT = Math.cos(THREE.MathUtils.degToRad(102));   // where the photo gives way to painted skin

// Features pushed in and out of the rings, by ring index and angle step
// from the front (0 = straight ahead): the nose, the bridge, the sockets.
const PUSH = { '3:0': 0.032, '3:1': 0.010, '3:-1': 0.010, '4:0': 0.016, '4:1': -0.006, '4:-1': -0.006, '5:0': 0.005, '2:0': 0.004, '0:0': 0.006 };

export function buildSculptedHead(ctx, { faceTex, skinHex, hairHex, bald = false, hairline = 0.112 } = {}) {
  const atlas = headAtlas(faceTex, skinHex, hairHex, bald);
  const mat = createPS1Material(ctx.env, { map: atlas });
  const pos = [], uv = [];
  const vert = (ring, k) => {
    const r = RINGS[ring];
    const a = (k / N) * Math.PI * 2;                 // 0 is straight ahead (+z)
    const c = Math.cos(a), s = Math.sin(a);
    const front = c >= 0;
    // A flatter face than a cylinder: the front falls away slowly, the back is round.
    const z = front ? r.zf * Math.pow(c, 0.72) : r.zb * c;
    const x = r.rx * s;
    const step = ((k + N / 2) % N) - N / 2;          // -5..4, 0 straight ahead
    const push = PUSH[`${ring}:${step}`] || 0;
    return { x, y: r.y, z: z + push, c, s, ring, front: c > FACE_LIMIT };
  };
  const uvOf = (v) => {
    // The hairline runs high across the forehead and low down the nape.
    const around = (1 - v.c) / 2;                    // 0 at the front, 1 at the back
    const hair = !bald && v.y > hairline - 0.15 * around;
    if (!hair && v.front) {
      // The photograph, projected flat from the front and stretched to the ears.
      const r = RINGS[v.ring];
      const xn = THREE.MathUtils.clamp(v.x / r.rx, -1, 1);
      return [0.25 + xn * 0.235, THREE.MathUtils.clamp((v.y + 0.125) / 0.25, 0, 1) * 0.94 + 0.03];
    }
    // The painted half: hair above, skin below, shaded darker toward the back.
    return [0.52 + 0.46 * around, hair ? 0.78 : 0.24];
  };
  const tri = (a, b, c) => { for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); const t = uvOf(v); uv.push(t[0], t[1]); } };
  for (let ring = 0; ring < RINGS.length - 1; ring++) {
    for (let k = 0; k < N; k++) {
      const a = vert(ring, k), b = vert(ring, k + 1), c = vert(ring + 1, k + 1), d = vert(ring + 1, k);
      tri(a, b, c); tri(a, c, d);
    }
  }
  // The crown: a fan to the apex. The chin: a fan to a point under the jaw.
  const apex = { x: 0, y: APEX, z: -0.004, c: -1, s: 0, ring: RINGS.length - 1, front: false };
  const base = { x: 0, y: -0.128, z: 0.0, c: 1, s: 0, ring: 0, front: true };
  for (let k = 0; k < N; k++) {
    tri(vert(RINGS.length - 1, k), vert(RINGS.length - 1, k + 1), apex);
    tri(vert(0, k + 1), vert(0, k), base);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  setVertexShade(geo, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.triangles = pos.length / 9;
  return mesh;
}

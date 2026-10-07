// Furnishings and small things for interiors: food, decorations, fixtures.
// Added to SceneBuilder as methods. Small meshes share materials per area so
// a busy room does not cost a material per plate.
import * as THREE from '../../vendor/three.module.js?v=41d35b4';
import { createPS1Material, setVertexShade } from '../engine/ps1material.js?v=41d35b4';
import { createLight, makeHalo } from '../engine/lights.js?v=41d35b4';
import { makeArt } from '../engine/art.js?v=41d35b4';
import { mergeStatic } from '../engine/merge.js?v=41d35b4';

const rad = THREE.MathUtils.degToRad;
const cylGeo = (r0, r1, h, sides = 8) => setVertexShade(new THREE.CylinderGeometry(r0, r1, h, sides), 1);
const boxGeo = (w, h, d) => setVertexShade(new THREE.BoxGeometry(w, h, d), 1);

// Catenary-ish sag between two points.
function sagPoint(a, b, t, sag) {
  const p = a.clone().lerp(b, t);
  p.y -= Math.sin(t * Math.PI) * sag;
  return p;
}

export const PropMethods = {
  decoMat(tex, color, pos, opts = {}) {
    if (!this.matCache) this.matCache = new Map();
    const cell = `${Math.round(pos[0] / 6)},${Math.round(pos[2] / 6)}`;
    const key = `${tex}|${color}|${opts.unlit ? 1 : 0}|${opts.texScale ?? 1}|${opts.alpha ? 1 : 0}|${opts.double ? 1 : 0}|${opts.opacity ?? 1}|${cell}`;
    let m = this.matCache.get(key);
    if (!m) {
      m = createPS1Material(this.ctx.env, {
        map: this.ctx.T[tex] || this.ctx.T.white, color: color || '#ffffff', texScale: opts.texScale ?? 1, worldUV: false,
        unlit: opts.unlit, alphaTest: opts.alpha ? 0.5 : 0, side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
        transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1, depthWrite: (opts.opacity ?? 1) >= 1,
      });
      this.matCache.set(key, m);
      this.staticMaterials.push({ material: m, position: new THREE.Vector3(pos[0], pos[1], pos[2]) });
    }
    return m;
  },

  put(geo, mat, x, y, z, rot) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    this.group.add(m);
    return m;
  },

  // A candle flame: flickers and glows but does not light the room.
  addFlame(pos, color = '#ffc060', size = 0.4) {
    const l = createLight({ pos, color, intensity: 1, range: 0.1, profile: 'candle', seed: this.lights.length * 3.7 + 0.9 });
    this.lights.push(l);
    const f = this.put(boxGeo(0.018, 0.035, 0.018), this.decoMat('white', color, pos, { unlit: true }), pos[0], pos[1], pos[2]);
    this.addHalo(pos, color, size, l, 0.55);
    return f;
  },

  addCylinder(o) {
    const [x, y, z] = o.pos;
    const h = o.height ?? 1, r = o.radius ?? 0.3;
    const mat = this.decoMat(o.tex || 'white', o.color, o.pos, { unlit: o.unlit, texScale: o.texScale });
    const rot = o.rot ? o.rot.map((d) => rad(d)) : undefined;
    const m = this.put(cylGeo(o.radiusTop ?? r, r, h, o.sides ?? 8), mat, x, rot ? y : y + h / 2, z, rot);
    if (o.collide) {
      const c = r * 0.8;
      this.colliders.push({ min: new THREE.Vector3(x - c, y, z - c), max: new THREE.Vector3(x + c, y + h, z + c) });
    }
    return m;
  },

  addRoundTable(o) {
    const [x, y, z] = o.pos; const r = o.radius ?? 0.7, h = o.height ?? 0.75;
    const wood = this.decoMat(o.tex || 'woodDark', null, o.pos, {});
    this.put(cylGeo(0.06, 0.06, h - 0.05, 6), this.decoMat('metal', null, o.pos), x, y + h / 2, z);
    this.put(cylGeo(0.28, 0.3, 0.04, 8), this.decoMat('metal', null, o.pos), x, y + 0.02, z);
    this.put(cylGeo(r, r, 0.04, 12), wood, x, y + h - 0.02, z);
    if (o.cloth) this.put(cylGeo(r + 0.05, r + 0.09, 0.28, 12), this.decoMat(o.clothTex || 'cloth', o.cloth === true ? null : o.cloth, o.pos), x, y + h - 0.13, z);
    const c = r * 0.75;
    this.colliders.push({ min: new THREE.Vector3(x - c, y, z - c), max: new THREE.Vector3(x + c, y + h, z + c) });
  },

  // Food and tableware. `kind` picks the thing; y is the table top.
  addFood(o) {
    const [x, y, z] = o.pos; const P = o.pos;
    const M = (tex, color, opts) => this.decoMat(tex, color, P, opts);
    const yaw = rad(o.yaw ?? 0);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; this.group.add(g);
    const add = (geo, mat, px, py, pz, rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); if (rot) m.rotation.set(...rot); g.add(m); return m; };
    const plate = (r = 0.12) => add(cylGeo(r, r * 0.85, 0.014, 10), M('white', '#ece8e0'), 0, 0.007, 0);
    switch (o.kind) {
      case 'plate': plate(); add(cylGeo(0.06, 0.07, 0.03, 7), M('white', o.color || '#b0603a'), 0.01, 0.025, 0); break;
      case 'pasta': plate(); add(cylGeo(0.05, 0.075, 0.035, 7), M('white', '#e8c060'), 0, 0.025, 0); add(cylGeo(0.03, 0.04, 0.02, 6), M('white', '#b02818'), 0, 0.045, 0); break;
      case 'steamer':
        add(cylGeo(0.09, 0.09, 0.05, 10), M('wood', '#c8a868', { texScale: 0.2 }), 0, 0.025, 0);
        add(cylGeo(0.09, 0.09, 0.05, 10), M('wood', '#c0a060', { texScale: 0.2 }), 0, 0.075, 0);
        add(cylGeo(0.02, 0.095, 0.035, 10), M('wood', '#b89858', { texScale: 0.2 }), 0, 0.118, 0); break;
      case 'bowl': add(cylGeo(0.075, 0.045, 0.05, 9), M('white', '#ece8e0'), 0, 0.025, 0); add(cylGeo(0.065, 0.065, 0.005, 9), M('white', o.color || '#d8c070'), 0, 0.046, 0); break;
      case 'teapot':
        add(setVertexShade(new THREE.SphereGeometry(0.065, 7, 5), 1), M('white', o.color || '#e8e4dc'), 0, 0.06, 0);
        add(cylGeo(0.012, 0.018, 0.07, 5), M('white', o.color || '#e8e4dc'), 0.07, 0.07, 0, [0, 0, -0.9]);
        add(cylGeo(0.015, 0.02, 0.02, 6), M('white', o.color || '#e8e4dc'), 0, 0.125, 0); break;
      case 'glass': add(cylGeo(0.03, 0.026, 0.11, 7), M('white', '#b8cad0', { opacity: 0.7 }), 0, 0.055, 0); break;
      case 'wine':
        add(cylGeo(0.035, 0.012, 0.06, 7), M('white', '#c8d4d8', { opacity: 0.75 }), 0, 0.15, 0);
        add(cylGeo(0.03, 0.03, 0.02, 7), M('white', '#6a0c18'), 0, 0.14, 0);
        add(cylGeo(0.005, 0.005, 0.1, 4), M('white', '#c8d4d8'), 0, 0.06, 0);
        add(cylGeo(0.03, 0.03, 0.006, 7), M('white', '#c8d4d8'), 0, 0.003, 0); break;
      case 'margarita':
        add(cylGeo(0.06, 0.012, 0.05, 8), M('white', '#c8e8b0', { opacity: 0.8 }), 0, 0.14, 0);
        add(cylGeo(0.063, 0.063, 0.008, 8), M('white', '#f4f4f0'), 0, 0.166, 0);
        add(cylGeo(0.005, 0.005, 0.1, 4), M('white', '#c8d8c8'), 0, 0.06, 0);
        add(cylGeo(0.035, 0.035, 0.006, 7), M('white', '#c8d8c8'), 0, 0.003, 0);
        add(boxGeo(0.02, 0.02, 0.005), M('white', '#80c040'), 0.05, 0.17, 0); break;
      case 'bottle':
        add(cylGeo(0.035, 0.035, 0.18, 7), M('white', o.color || '#1e4a2a'), 0, 0.09, 0);
        add(cylGeo(0.012, 0.03, 0.08, 6), M('white', o.color || '#1e4a2a'), 0, 0.22, 0); break;
      case 'chianti':
        add(cylGeo(0.06, 0.055, 0.1, 8), M('wood', '#c8a050', { texScale: 0.15 }), 0, 0.05, 0);
        add(cylGeo(0.02, 0.055, 0.1, 8), M('white', '#2a4a20'), 0, 0.14, 0);
        add(cylGeo(0.016, 0.016, 0.1, 6), M('white', '#efe6d0'), 0, 0.24, 0);
        this.addFlame([x, y + 0.31, z], '#ffc060', 0.4); break;
      case 'candle':
        add(cylGeo(0.02, 0.02, 0.09, 6), M('white', '#efe6d0'), 0, 0.045, 0);
        this.addFlame([x, y + 0.11, z], '#ffc060', 0.35); break;
      case 'pizza':
        add(cylGeo(0.2, 0.2, 0.01, 12), M('metal', null), 0, 0.005, 0);
        add(cylGeo(0.17, 0.17, 0.02, 12), M('white', '#d8a048'), 0, 0.02, 0);
        add(cylGeo(0.15, 0.15, 0.006, 12), M('white', '#c43a20'), 0, 0.032, 0);
        for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.3, rr = 0.04 + (i % 3) * 0.035; add(cylGeo(0.022, 0.022, 0.006, 6), M('white', '#7a1414'), Math.cos(a) * rr, 0.037, Math.sin(a) * rr); }
        break;
      case 'thali':
        add(cylGeo(0.17, 0.16, 0.012, 12), M('metal', '#d8d0c0'), 0, 0.006, 0);
        for (const [dx, dz, c] of [[-0.08, -0.06, '#e0b030'], [0.08, -0.06, '#c05020'], [-0.08, 0.06, '#5a8a30'], [0.08, 0.06, '#f0eee0']]) {
          add(cylGeo(0.045, 0.035, 0.03, 8), M('metal', '#c8c0b0'), dx, 0.02, dz);
          add(cylGeo(0.04, 0.04, 0.004, 8), M('white', c), dx, 0.034, dz);
        }
        break;
      case 'baguette': add(boxGeo(0.05, 0.04, 0.34), M('white', '#c88a40'), 0, 0.02, 0, [0, 0.4, 0]); break;
      case 'pastrami': add(boxGeo(0.34, 0.12, 0.2), M('meat', null, { texScale: 0.5 }), 0, 0.06, 0); add(boxGeo(0.3, 0.015, 0.16), M('white', '#f0e6d0'), 0.02, 0.127, 0); break;
      case 'tray': add(boxGeo(0.4, 0.03, 0.26), M('metal', null, { texScale: 0.3 }), 0, 0.015, 0); for (let i = 0; i < 5; i++) add(boxGeo(0.3, 0.012, 0.03), M('meat', null, { texScale: 0.4 }), 0, 0.04 + i * 0.012, -0.08 + i * 0.04); break;
      case 'pickles': add(cylGeo(0.08, 0.08, 0.2, 8), M('white', '#9ab060', { opacity: 0.8 }), 0, 0.1, 0); add(cylGeo(0.085, 0.085, 0.02, 8), M('metal'), 0, 0.21, 0); break;
      case 'sandwich': add(boxGeo(0.18, 0.03, 0.14), M('white', '#d8b070'), 0, 0.015, 0); add(boxGeo(0.17, 0.08, 0.13), M('meat', null, { texScale: 0.4 }), 0, 0.07, 0); add(boxGeo(0.18, 0.03, 0.14), M('white', '#d8b070'), 0.01, 0.125, 0); break;
      case 'cake': add(cylGeo(0.09, 0.09, 0.07, 10), M('white', '#6a3a20'), 0, 0.035, 0); add(cylGeo(0.09, 0.09, 0.012, 10), M('white', '#f4ece0'), 0, 0.075, 0); break;
      case 'lazySusan':
        add(cylGeo(0.36, 0.36, 0.02, 12), M('lacquer', null), 0, 0.01, 0);
        break;
      case 'vase':
        add(cylGeo(0.03, 0.045, 0.16, 6), M('white', o.color || '#d8e4ec', { opacity: 0.8 }), 0, 0.08, 0);
        for (let i = 0; i < 5; i++) { const a = i * 1.26; add(setVertexShade(new THREE.SphereGeometry(0.03, 5, 3), 1), M('white', ['#d83050', '#f0f0e8', '#e8a0b8'][i % 3]), Math.cos(a) * 0.04, 0.2 + (i % 2) * 0.03, Math.sin(a) * 0.04); }
        add(cylGeo(0.004, 0.004, 0.08, 3), M('white', '#3a6a2a'), 0, 0.17, 0); break;
      case 'whisky':
        add(cylGeo(0.035, 0.032, 0.08, 7), M('white', '#c8d4d8', { opacity: 0.7 }), 0, 0.04, 0);
        add(cylGeo(0.031, 0.031, 0.035, 7), M('white', '#b86a20'), 0, 0.02, 0); break;
      case 'tray':
        add(cylGeo(0.2, 0.2, 0.012, 10), M('metal', '#b8b0a0'), 0, 0.006, 0); break;
      case 'pizzaBoxes':
        for (let i = 0; i < (o.count ?? 4); i++) add(boxGeo(0.36, 0.045, 0.36), M('white', '#d8c8a0'), (i % 2) * 0.02, 0.023 + i * 0.046, 0, [0, i * 0.15, 0]);
        break;
      default: plate();
    }
    return g;
  },

  // A line of hanging flags or papel picado between two points; they sway.
  addBunting(o) {
    const a = new THREE.Vector3().fromArray(o.from), b = new THREE.Vector3().fromArray(o.to);
    const n = o.count ?? 12, sag = o.sag ?? 0.4, cols = o.colors || ['#e04040', '#f0c030', '#40a0e0', '#40c060', '#e060c0'];
    const papel = o.style !== 'flags';
    const strMat = this.decoMat('white', '#ddd8c8', o.from);
    const segs = 10;
    for (let i = 0; i < segs; i++) {
      const p0 = sagPoint(a, b, i / segs, sag), p1 = sagPoint(a, b, (i + 1) / segs, sag);
      const m = this.put(boxGeo(0.012, 0.012, p0.distanceTo(p1)), strMat, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
      m.lookAt(p1);
    }
    if (!this.swayers) this.swayers = [];
    const dir = b.clone().sub(a).setY(0).normalize();
    const yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = sagPoint(a, b, t, sag);
      const color = cols[i % cols.length];
      const w = papel ? 0.3 : 0.22, h = papel ? 0.38 : 0.3;
      let geo;
      if (papel) { geo = setVertexShade(new THREE.PlaneGeometry(w, h), 1); geo.translate(0, -h / 2, 0); }
      else {
        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, -h, 0], 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
        geo.computeVertexNormals(); setVertexShade(geo, 1);
      }
      const mat = this.decoMat(papel ? 'papel' : 'white', color, o.from, { unlit: true, alpha: papel, double: true });
      const pivot = new THREE.Group(); pivot.position.copy(p); pivot.rotation.y = yaw;
      pivot.add(new THREE.Mesh(geo, mat));
      this.group.add(pivot);
      this.swayers.push({ obj: pivot, phase: i * 0.9 + a.x, amp: 0.12 });
    }
  },

  // A string of bulbs with glows; one real light for the whole string.
  addStringLights(o) {
    const a = new THREE.Vector3().fromArray(o.from), b = new THREE.Vector3().fromArray(o.to);
    const n = o.count ?? 10, sag = o.sag ?? 0.3, color = o.color || '#ffd890';
    const mid = sagPoint(a, b, 0.5, sag);
    const l = this.addLight({ pos: [mid.x, mid.y - 0.2, mid.z], color, intensity: o.intensity ?? 0.6, range: o.range ?? 5, flicker: 'candle' });
    const wire = this.decoMat('white', '#202020', o.from);
    for (let i = 0; i < 10; i++) {
      const p0 = sagPoint(a, b, i / 10, sag), p1 = sagPoint(a, b, (i + 1) / 10, sag);
      const m = this.put(boxGeo(0.01, 0.01, p0.distanceTo(p1)), wire, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
      m.lookAt(p1);
    }
    for (let i = 0; i < n; i++) {
      const p = sagPoint(a, b, (i + 0.5) / n, sag);
      const bulbMat = createPS1Material(this.ctx.env, { map: this.ctx.T.white, color, unlit: true });
      const bulb = this.put(boxGeo(0.05, 0.07, 0.05), bulbMat, p.x, p.y - 0.05, p.z);
      l.emissive.push({ material: bulbMat, base: new THREE.Color(color) });
      this.addHalo([p.x, p.y - 0.05, p.z], color, 0.45, l, 0.5);
    }
  },

  // Hanging fabric with folds.
  addDrape(o) {
    const [w, h] = o.size || [1, 2];
    const geo = new THREE.PlaneGeometry(w, h, 10, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) / w * Math.PI * (o.folds ?? 5)) * (o.depth ?? 0.06));
    geo.computeVertexNormals(); setVertexShade(geo, 1);
    const m = this.put(geo, this.decoMat(o.tex || 'white', o.color, o.pos, { double: true, texScale: 1 }), o.pos[0], o.pos[1], o.pos[2], [rad(o.pitch ?? 0), rad(o.yaw ?? 0), 0]);
    return m;
  },

  addPlant(o) {
    const [x, y, z] = o.pos; const P = o.pos;
    const pot = this.decoMat('white', o.potColor || '#a8583a', P);
    this.put(cylGeo(0.19, 0.14, 0.32, 8), pot, x, y + 0.16, z);
    const kind = o.kind || 'leafy';
    if (kind === 'cactus') {
      const green = this.decoMat('white', '#3a7a3a', P);
      const hgt = o.height ?? 0.9;
      this.put(boxGeo(0.14, hgt, 0.14), green, x, y + 0.3 + hgt / 2, z);
      this.put(boxGeo(0.25, 0.1, 0.1), green, x + 0.14, y + 0.3 + hgt * 0.45, z);
      this.put(boxGeo(0.1, 0.3, 0.1), green, x + 0.24, y + 0.3 + hgt * 0.6, z);
      this.put(boxGeo(0.2, 0.09, 0.09), green, x - 0.12, y + 0.3 + hgt * 0.6, z);
      this.put(boxGeo(0.09, 0.22, 0.09), green, x - 0.2, y + 0.3 + hgt * 0.72, z);
      return;
    }
    if (kind === 'bamboo') {
      const green = this.decoMat('white', '#7a9a40', P);
      for (let i = 0; i < 4; i++) this.put(cylGeo(0.02, 0.025, 1.6 + i * 0.15, 5), green, x + (i % 2 - 0.5) * 0.08, y + 0.3 + 0.8, z + (i > 1 ? 0.06 : -0.06));
    }
    const leaf = this.decoMat('leaf', o.leafColor || null, P, { alpha: true, double: true });
    const s = o.size ?? 0.9, top = y + (kind === 'bamboo' ? 1.9 : 0.3 + s * 0.45);
    for (let i = 0; i < 3; i++) this.put(setVertexShade(new THREE.PlaneGeometry(s, s), 1), leaf, x, top, z, [0, i * Math.PI / 3, 0]);
    this.put(setVertexShade(new THREE.PlaneGeometry(s * 0.9, s * 0.9), 1), leaf, x, top + s * 0.1, z, [-Math.PI / 2, 0, 0]);
  },

  // Brick pizza oven with a fire inside. Faces +z at yaw 0.
  addOven(o) {
    const [x, y, z] = o.pos; const P = o.pos;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rad(o.yaw ?? 0); this.group.add(g);
    const brick = this.decoMat('brick', null, P, { texScale: 1 });
    const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
    add(boxGeo(1.8, 0.95, 1.6), brick, 0, 0.475, 0);
    add(setVertexShade(new THREE.SphereGeometry(0.85, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 1), brick, 0, 0.95, 0);
    add(boxGeo(0.7, 0.5, 0.2), this.decoMat('black', null, P), 0, 1.15, 0.78);
    add(boxGeo(0.25, 1.4, 0.25), brick, 0, 2.2, -0.3);
    const fire = createPS1Material(this.ctx.env, { map: this.ctx.T.lamp, color: '#ff7a28', unlit: true, texScale: 0.3 });
    add(boxGeo(0.55, 0.32, 0.05), fire, 0, 1.08, 0.83);
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y);
    const l = this.addLight({ pos: [x + fwd.x * 1.4, y + 1.1, z + fwd.z * 1.4], color: '#ff8030', intensity: 1.0, range: 5, flicker: 'candle' });
    l.emissive.push({ material: fire, base: new THREE.Color('#ff7a28') });
    this.addHalo([x + fwd.x * 0.9, y + 1.1, z + fwd.z * 0.9], '#ff7a28', 1.4, l, 0.6);
    const hw = 0.95, hd = 0.85;
    this.colliders.push({ min: new THREE.Vector3(x - hw, y, z - hd), max: new THREE.Vector3(x + hw, y + 2, z + hd) });
  },

  // A painted picture, poster, menu or mirror, optionally framed.
  addPanel(o) {
    const [w, h] = o.size || [0.8, 1];
    const mat = createPS1Material(this.ctx.env, { map: makeArt(o.art || 'photo'), worldUV: false, texScale: 1 });
    const m = this.put(setVertexShade(new THREE.PlaneGeometry(w, h), 1), mat, o.pos[0], o.pos[1], o.pos[2], [0, rad(o.yaw ?? 0), 0]);
    this.staticMaterials.push({ material: mat, position: m.position.clone() });
    if (o.frame !== false) {
      const fm = this.decoMat(o.frameTex || 'woodDark', o.frameColor || null, o.pos);
      const fw = 0.05;
      const f = new THREE.Group(); f.position.copy(m.position); f.rotation.copy(m.rotation); this.group.add(f);
      for (const [px, py, sw, sh] of [[0, h / 2 + fw / 2, w + fw * 2, fw], [0, -h / 2 - fw / 2, w + fw * 2, fw], [-w / 2 - fw / 2, 0, fw, h], [w / 2 + fw / 2, 0, fw, h]]) {
        const b = new THREE.Mesh(boxGeo(sw, sh, 0.04), fm); b.position.set(px, py, -0.01); f.add(b);
      }
    }
    return m;
  },

  // Folding screen: panels in a zigzag.
  addScreen(o) {
    const [x, y, z] = o.pos; const n = o.panels ?? 4, pw = 0.5, ph = o.height ?? 1.7;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rad(o.yaw ?? 0); this.group.add(g);
    const mat = createPS1Material(this.ctx.env, { map: makeArt(o.art || 'lattice'), worldUV: false });
    this.staticMaterials.push({ material: mat, position: new THREE.Vector3(x, y, z) });
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(setVertexShade(new THREE.BoxGeometry(pw, ph, 0.03), 1), mat);
      p.position.set((i - (n - 1) / 2) * pw * 0.94, ph / 2 + 0.05, (i % 2) * 0.12);
      p.rotation.y = (i % 2 ? -1 : 1) * 0.25;
      g.add(p);
    }
  },

  addArch(o) {
    const [x, y, z] = o.pos; const w = o.width ?? 2.4, h = o.height ?? 3, t = o.thickness ?? 0.3;
    const yaw = rad(o.yaw ?? 0);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; this.group.add(g);
    const mat = this.decoMat(o.tex || 'plasterWarm', o.color, o.pos, { texScale: 1 });
    const add = (sw, sh, px, py) => { const b = new THREE.Mesh(boxGeo(sw, sh, t), mat); b.position.set(px, py, 0); g.add(b); };
    add(0.35, h, -w / 2, h / 2); add(0.35, h, w / 2, h / 2);
    // Pointed top in three steps.
    add(w + 0.35, 0.3, 0, h + 0.15); add(w * 0.6, 0.3, 0, h + 0.45); add(w * 0.25, 0.3, 0, h + 0.75);
    if (o.trim) { const tm = this.decoMat('gold', null, o.pos); for (const sx of [-1, 1]) { const b = new THREE.Mesh(boxGeo(0.06, h, t + 0.02), tm); b.position.set(sx * (w / 2 - 0.2), h / 2, 0); g.add(b); } }
    if (o.collide !== false) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (const sx of [-1, 1]) {
        const px = x + c * sx * w / 2, pz = z - s * sx * w / 2;
        this.colliders.push({ min: new THREE.Vector3(px - 0.25, y, pz - 0.25), max: new THREE.Vector3(px + 0.25, y + h, pz + 0.25) });
      }
    }
  },

  addCeilingFan(o) {
    const [x, y, z] = o.pos;
    const metal = this.decoMat('metal', null, o.pos);
    this.put(cylGeo(0.02, 0.02, 0.5, 4), metal, x, y - 0.25, z);
    const rotor = new THREE.Group(); rotor.position.set(x, y - 0.52, z); this.group.add(rotor);
    const hub = new THREE.Mesh(cylGeo(0.1, 0.12, 0.1, 8), metal); rotor.add(hub);
    const blade = this.decoMat(o.tex || 'wood', null, o.pos, { texScale: 0.3 });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(boxGeo(0.62, 0.015, 0.14), blade);
      const a = i * Math.PI / 2;
      b.position.set(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38); b.rotation.y = -a; b.rotation.x = 0.12;
      rotor.add(b);
    }
    if (!this.spinners) this.spinners = [];
    this.spinners.push({ obj: rotor, speed: o.speed ?? 2.2 });
  },

  addJukebox(o) {
    const [x, y, z] = o.pos; const yaw = rad(o.yaw ?? 0);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; this.group.add(g);
    const wood = this.decoMat('woodDark', null, o.pos);
    const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
    add(boxGeo(0.85, 1.3, 0.6), wood, 0, 0.65, 0);
    add(cylGeo(0.42, 0.42, 0.6, 10, 1), wood, 0, 1.3, 0).rotation.x = Math.PI / 2;
    const glow = createPS1Material(this.ctx.env, { map: makeArt('jukebox'), unlit: true, worldUV: false });
    const face = add(setVertexShade(new THREE.PlaneGeometry(0.7, 1.0), 1), glow, 0, 0.95, 0.31);
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const l = this.addLight({ pos: [x + fwd.x * 0.8, y + 1.0, z + fwd.z * 0.8], color: '#ff60c0', intensity: 0.7, range: 3.5, flicker: 'neon' });
    l.emissive.push({ material: glow, base: new THREE.Color(1, 1, 1) });
    this.addHalo([x + fwd.x * 0.4, y + 1.0, z + fwd.z * 0.4], '#ff70d0', 1.4, l, 0.4);
    this.colliders.push({ min: new THREE.Vector3(x - 0.5, y, z - 0.5), max: new THREE.Vector3(x + 0.5, y + 1.6, z + 0.5) });
  },

  // A lit fish tank with fish swimming back and forth.
  addAquarium(o) {
    const [x, y, z] = o.pos; const [w, h, d] = o.size || [1.4, 0.7, 0.45];
    const base = this.decoMat('woodDark', null, o.pos);
    this.put(boxGeo(w, 0.8, d), base, x, y + 0.4, z);
    const water = createPS1Material(this.ctx.env, { map: this.ctx.T.water2, color: '#6ab0d8', unlit: true, transparent: true, opacity: 0.55, depthWrite: false, worldUV: false });
    this.put(boxGeo(w, h, d), water, x, y + 0.8 + h / 2, z).renderOrder = 4;
    this.put(boxGeo(w + 0.04, 0.05, d + 0.04), base, x, y + 0.8 + h + 0.025, z);
    const l = this.addLight({ pos: [x, y + 0.8 + h / 2, z + d], color: '#80c8ff', intensity: 0.5, range: 2.5, flicker: 'soft' });
    l.emissive.push({ material: water, base: new THREE.Color('#6ab0d8') });
    if (!this.movers) this.movers = [];
    const fishMat = this.decoMat('fish', null, o.pos, { unlit: true });
    for (let i = 0; i < (o.fish ?? 5); i++) {
      const f = this.put(boxGeo(0.09, 0.05, 0.02), fishMat, x, y + 0.9 + (i / 5) * (h - 0.2), z);
      this.movers.push({ obj: f, cx: x, cy: f.position.y, cz: z, ax: w / 2 - 0.1, az: d / 2 - 0.08, speed: 0.4 + (i % 3) * 0.2, phase: i * 1.7 });
    }
    this.colliders.push({ min: new THREE.Vector3(x - w / 2, y, z - d / 2), max: new THREE.Vector3(x + w / 2, y + 2, z + d / 2) });
  },

  // The beckoning cat: a white figure whose raised paw waves.
  addLuckyCat(o) {
    const [x, y, z] = o.pos;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rad(o.yaw ?? 0); g.scale.setScalar(o.scale ?? 1); this.group.add(g);
    const white = this.decoMat('white', '#f2eee6', o.pos), red = this.decoMat('white', '#c02020', o.pos), gold = this.decoMat('gold', null, o.pos);
    const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
    add(boxGeo(0.16, 0.18, 0.13), white, 0, 0.09, 0);
    add(boxGeo(0.17, 0.14, 0.14), white, 0, 0.25, 0);
    add(boxGeo(0.04, 0.05, 0.03), white, -0.05, 0.34, 0); add(boxGeo(0.04, 0.05, 0.03), white, 0.05, 0.34, 0);
    add(boxGeo(0.17, 0.02, 0.14), red, 0, 0.18, 0);
    add(boxGeo(0.04, 0.04, 0.02), gold, 0, 0.12, 0.07);
    const arm = new THREE.Group(); arm.position.set(0.09, 0.2, 0.02); g.add(arm);
    const a = new THREE.Mesh(boxGeo(0.045, 0.12, 0.045), white); a.position.y = 0.06; arm.add(a);
    if (!this.wavers) this.wavers = [];
    this.wavers.push({ obj: arm, speed: 3.2 });
  },

  // Hanging chandelier: a ring of bulbs and crystal drops around one light.
  addChandelier(o) {
    const [x, y, z] = o.pos; const r = o.radius ?? 0.6, color = o.color || '#ffe0a8';
    const brass = this.decoMat('gold', null, o.pos);
    this.put(cylGeo(0.015, 0.015, 0.6, 4), brass, x, y - 0.3, z);
    this.put(cylGeo(r, r, 0.04, 12), brass, x, y - 0.65, z);
    this.put(cylGeo(r * 0.5, r * 0.5, 0.04, 10), brass, x, y - 0.85, z);
    const l = this.addLight({ id: o.id, pos: [x, y - 0.9, z], color, intensity: o.intensity ?? 0.9, range: o.range ?? 8, flicker: 'candle' });
    const crystal = this.decoMat('white', '#e8f0f4', o.pos, { opacity: 0.7 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
      const bulbMat = createPS1Material(this.ctx.env, { map: this.ctx.T.white, color, unlit: true });
      this.put(boxGeo(0.04, 0.07, 0.04), bulbMat, bx, y - 0.6, bz);
      l.emissive.push({ material: bulbMat, base: new THREE.Color(color) });
      this.put(boxGeo(0.025, 0.12, 0.025), crystal, x + Math.cos(a + 0.3) * r * 0.75, y - 0.78, z + Math.sin(a + 0.3) * r * 0.75);
    }
    this.addHalo([x, y - 0.68, z], color, (o.glowSize ?? 2.4), l, 0.45);
  },

  // A grand piano with its bench. Keyboard faces +z at yaw 0.
  addPiano(o) {
    const [x, y, z] = o.pos;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rad(o.yaw ?? 0); this.group.add(g);
    const black = this.decoMat('black', null, o.pos), white = this.decoMat('white', '#f0ece4', o.pos), dark = this.decoMat('white', '#101010', o.pos);
    const add = (geo, mat, px, py, pz, rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); if (rot) m.rotation.set(...rot); g.add(m); return m; };
    add(boxGeo(1.45, 0.3, 1.6), black, 0, 0.82, -0.3);
    add(boxGeo(0.9, 0.3, 0.6), black, -0.25, 0.82, -1.3);
    add(boxGeo(1.4, 0.02, 1.6), black, 0.1, 1.25, -0.4, [0, 0, 0.45]);
    add(boxGeo(0.02, 0.5, 0.02), black, 0.55, 1.05, -0.2);
    for (const [px, pz] of [[-0.6, 0.35], [0.6, 0.35], [-0.4, -1.4]]) add(boxGeo(0.08, 0.68, 0.08), black, px, 0.34, pz);
    add(boxGeo(1.3, 0.03, 0.16), white, 0, 0.83, 0.55);
    for (let i = 0; i < 18; i++) if (i % 7 !== 2 && i % 7 !== 6) add(boxGeo(0.03, 0.02, 0.09), dark, -0.62 + i * 0.073, 0.855, 0.52);
    add(boxGeo(0.8, 0.06, 0.35), black, 0, 0.47, 1.0);
    for (const px of [-0.35, 0.35]) add(boxGeo(0.05, 0.45, 0.05), black, px, 0.22, 1.0);
    const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
    const cx = x - s * 0.5, cz = z - c * 0.5;
    this.colliders.push({ min: new THREE.Vector3(cx - 0.9, y, cz - 0.9), max: new THREE.Vector3(cx + 0.9, y + 1.3, cz + 0.9) });
  },

  // A fountain: a round basin of moving water, a pedestal, an upper bowl,
  // and a spray of drops thrown up from the top and falling back. `radius`
  // is the basin's; `tiers` 1 or 2.
  addFountain(o) {
    const [x, y, z] = o.pos; const r = o.radius ?? 2.2, h = o.height ?? 0.7, tiers = o.tiers ?? 2;
    const stone = this.decoMat(o.tex || 'marble', o.color, o.pos, { texScale: 1 });
    const water = createPS1Material(this.ctx.env, { map: this.ctx.T.water, color: o.waterColor || '#6a9ab0', texScale: 1, worldUV: false, transparent: true, opacity: 0.85, depthWrite: false });
    this.scrollers.push({ material: water, flow: o.flow || [0.03, 0.012] });
    this.put(cylGeo(r, r * 1.04, h, 14), stone, x, y + h / 2, z);
    this.put(cylGeo(r + 0.18, r + 0.18, 0.14, 14), stone, x, y + h + 0.07, z);
    const pool = this.put(cylGeo(r - 0.1, r - 0.1, 0.04, 14), water, x, y + h - 0.08, z); pool.renderOrder = 4;
    let top = y + h - 0.08;
    if (tiers >= 2) {
      this.put(cylGeo(0.32, 0.42, 1.1, 8), stone, x, y + h + 0.45, z);
      const r2 = r * 0.42;
      this.put(cylGeo(r2, r2 * 0.6, 0.4, 12), stone, x, y + h + 1.2, z);
      this.put(cylGeo(r2 + 0.08, r2 + 0.08, 0.08, 12), stone, x, y + h + 1.42, z);
      const pool2 = this.put(cylGeo(r2 - 0.06, r2 - 0.06, 0.04, 12), water, x, y + h + 1.36, z); pool2.renderOrder = 4;
      this.put(cylGeo(0.1, 0.16, 0.5, 7), stone, x, y + h + 1.62, z);
      top = y + h + 1.85;
    }
    // The spray: drops thrown up from the top, falling to the water.
    const N = o.drops ?? 160, spread = o.spread ?? 0.4, up = o.jet ?? 3.4;
    const geo = new THREE.BufferGeometry(); const arr = new Float32Array(N * 3); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ map: this.ctx.T.halo, size: o.dropSize ?? 0.2, color: o.dropColor || '#dff2ff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 7; this.group.add(points);
    const parts = []; const floor = y + h - 0.08;
    const seed = (p, k) => { const a = Math.random() * Math.PI * 2, sp = (0.3 + Math.random() * 0.7) * spread; p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = up * (0.8 + Math.random() * 0.3); p.t = k === undefined ? Math.random() * 1.4 : 0; };
    for (let i = 0; i < N; i++) { const p = {}; seed(p); parts.push(p); }
    if (!this.keepers) this.keepers = []; this.keepers.push({ obj: points });
    if (!this.fountains) this.fountains = [];
    this.fountains.push({ update: (dt) => {
      for (let i = 0; i < N; i++) {
        const p = parts[i]; p.t += dt;
        const px = x + p.vx * p.t, pz = z + p.vz * p.t, py = top + p.vy * p.t - 4.9 * p.t * p.t;
        if (py < floor) { seed(p, 0); arr[i * 3] = x; arr[i * 3 + 1] = top; arr[i * 3 + 2] = z; continue; }
        arr[i * 3] = px; arr[i * 3 + 1] = py; arr[i * 3 + 2] = pz;
      }
      geo.attributes.position.needsUpdate = true;
    } });
    if (o.collide !== false) { const c = (r + 0.18) * 0.92; this.colliders.push({ min: new THREE.Vector3(x - c, y, z - c), max: new THREE.Vector3(x + c, y + h + 0.2, z + c) }); }
  },

  // A tree: trunk and a few dark lumps of canopy. kind: 'round' | 'pine' | 'bare'.
  addTree(o) {
    const [x, y, z] = o.pos; const s = o.size ?? 1;
    const bark = this.decoMat('woodDark', null, o.pos, { texScale: 0.5 });
    const leaf = this.decoMat('leaf', o.color || '#2a3a26', o.pos, { texScale: 0.7 });
    const kind = o.kind || 'round';
    if (kind !== 'palm') this.put(cylGeo(0.12 * s, 0.2 * s, 2.2 * s, 5), bark, x, y + 1.1 * s, z);
    if (kind === 'palm') {
      // A ringed trunk in segments, leaning a little; a crown of textured
      // fronds, the young ones reaching out, the old ones hanging; coconuts.
      const seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453; const rnd = (k) => ((seed * (k + 1)) % 1);
      const h = (5.2 + rnd(1) * 1.6) * s, lean = 0.05 + rnd(2) * 0.08, la = rnd(3) * Math.PI * 2;
      const palmBark = this.decoMat('palmBark', '#a08a6a', o.pos, { texScale: 1 });
      const segs = 6, segH = h / segs;
      let cx = x, cz = z;
      for (let i = 0; i < segs; i++) {
        const r0 = (0.26 - 0.14 * (i / segs)) * s, r1 = (0.26 - 0.14 * ((i + 1) / segs)) * s;
        const seg = this.put(cylGeo(r1, r0, segH * 1.04, 7), palmBark, cx + Math.cos(la) * lean * segH / 2, y + segH * (i + 0.5), cz + Math.sin(la) * lean * segH / 2);
        seg.rotation.z = -lean * Math.cos(la); seg.rotation.x = lean * Math.sin(la);
        cx += Math.cos(la) * lean * segH; cz += Math.sin(la) * lean * segH;
      }
      const crownY = y + h;
      const frondMat = this.decoMat('frond', o.color || '#5a8a40', o.pos, { texScale: 1, alpha: true, double: true });
      const oldMat = this.decoMat('frond', '#7a7a3a', o.pos, { texScale: 1, alpha: true, double: true });
      const frond = (a, droop, len, wid, mat, phase) => {
        const geo = new THREE.PlaneGeometry(wid, len, 1, 3); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -len / 2);
        // Curve: the tip bends down.
        const pos = geo.attributes.position; for (let k = 0; k < pos.count; k++) { const zz = pos.getZ(k); const t = -zz / len; pos.setY(k, -t * t * len * 0.35); } geo.computeVertexNormals();
        const g = new THREE.Group(); g.position.set(cx, crownY, cz); g.rotation.y = a;
        const sway = new THREE.Group(); sway.rotation.x = droop; g.add(sway);
        sway.add(new THREE.Mesh(setVertexShade(geo, 1), mat));
        this.group.add(g);
        if (!this.swayers) this.swayers = [];
        this.swayers.push({ obj: sway, phase, amp: 0.035, base: droop });
      };
      const n1 = 8, n2 = 6;
      for (let i = 0; i < n1; i++) frond(i * (Math.PI * 2 / n1) + rnd(4) * 0.5, -0.15 + rnd(10 + i) * 0.25, (2.6 + rnd(20 + i) * 0.5) * s, 0.8 * s, frondMat, i * 1.3);
      for (let i = 0; i < n2; i++) frond(i * (Math.PI * 2 / n2) + 0.4 + rnd(5) * 0.5, 0.75 + rnd(30 + i) * 0.3, (2.0 + rnd(40 + i) * 0.4) * s, 0.65 * s, oldMat, i * 1.7 + 0.5);
      const nut = this.decoMat('woodDark', '#5a3a1a', o.pos);
      for (let i = 0; i < 3; i++) { const a = i * 2.1; this.put(new THREE.SphereGeometry(0.13 * s, 6, 5), nut, cx + Math.cos(a) * 0.22 * s, crownY - 0.18 * s, cz + Math.sin(a) * 0.22 * s); }
      this.put(cylGeo(0.12 * s, 0.2 * s, 0.4 * s, 7), palmBark, cx, crownY + 0.05 * s, cz);
      if (o.collide !== false) this.colliders.push({ min: new THREE.Vector3(x - 0.3 * s, y, z - 0.3 * s), max: new THREE.Vector3(x + 0.3 * s, y + 2, z + 0.3 * s) });
      return;
    } else if (kind === 'pine') {
      for (let i = 0; i < 3; i++) this.put(cylGeo(0.01, (1.3 - i * 0.3) * s, 1.4 * s, 6), leaf, x, y + (2.2 + i * 1.0) * s, z);
    } else if (kind === 'bare') {
      for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.3; const b = this.put(boxGeo(0.07 * s, 1.3 * s, 0.07 * s), bark, x + Math.cos(a) * 0.35 * s, y + 2.6 * s, z + Math.sin(a) * 0.35 * s); b.rotation.set(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6); }
    } else {
      for (const [dx, dy, dz, w] of [[0, 3.0, 0, 2.2], [0.7, 2.5, 0.3, 1.5], [-0.6, 2.6, -0.4, 1.6], [0.1, 3.7, -0.2, 1.3]]) this.put(boxGeo(w * s, w * 0.75 * s, w * s), leaf, x + dx * s, y + dy * s, z + dz * s);
    }
    if (o.collide !== false) this.colliders.push({ min: new THREE.Vector3(x - 0.25, y, z - 0.25), max: new THREE.Vector3(x + 0.25, y + 2, z + 0.25) });
  },

  // The time machine: a walk-in chrome booth, door on local +z. Gears on the
  // sides and a ring on the roof turn when it runs; the disc on the back wall
  // is black until it is switched on, then glows white.
  addTimeMachine(o) {
    const [x, y, z] = o.pos;
    const yaw = ((o.yaw ?? 0) % 360 + 360) % 360;
    const rot = yaw === 90 || yaw === 270;
    const r = (lx, lz) => { if (yaw === 90) return [lz, -lx]; if (yaw === 180) return [-lx, -lz]; if (yaw === 270) return [-lz, lx]; return [lx, lz]; };
    const at = (lx, ly, lz, size, tex, extra = {}) => {
      const [dx, dz] = r(lx, lz); const sz = rot ? [size[2], size[1], size[0]] : size;
      return this.addBox({ pos: [x + dx, y + ly, z + dz], size: sz, tex, texScale: extra.texScale ?? 0.8, walkable: false, ...extra });
    };
    // Shell. The door gap between the front pillars is 0.9 wide.
    at(0, 1.25, -0.84, [1.8, 2.5, 0.12], 'chrome');
    for (const sx of [-1, 1]) at(sx * 0.84, 1.25, 0, [0.12, 2.5, 1.8], 'chrome');
    for (const sx of [-1, 1]) at(sx * 0.66, 1.25, 0.84, [0.36, 2.5, 0.12], 'chrome');
    at(0, 2.32, 0.84, [1.8, 0.36, 0.12], 'chrome');
    at(0, 2.6, 0, [2.0, 0.2, 2.0], 'metal', { texScale: 0.5 });
    at(0, 0.03, 0, [1.56, 0.06, 1.56], 'grille', { walkable: true, collide: false, texScale: 0.4 });
    // Rivets of light round the door frame.
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) at(sx * 0.5, 0.3 + i * 0.36, 0.91, [0.05, 0.05, 0.03], 'lamp', { unlit: true, collide: false, color: '#9ad0ff' });
    const root = new THREE.Group(); root.position.set(x, y, z); root.rotation.y = rad(yaw); this.group.add(root);
    const parts = { root, gears: [], spin: null, swirl: null };
    // The disc on the inside of the back wall, with a chrome rim.
    const portalMat = createPS1Material(this.ctx.env, { map: this.ctx.T.white, color: '#000000', unlit: true, fog: false });
    const disc = new THREE.Mesh(setVertexShade(new THREE.CircleGeometry(0.62, 20), 1), portalMat);
    disc.position.set(0, 1.25, -0.77); root.add(disc);
    const rimMat = this.decoMat('chrome', null, o.pos, { texScale: 0.3 });
    const rim = new THREE.Mesh(setVertexShade(new THREE.TorusGeometry(0.64, 0.05, 4, 20), 1), rimMat); rim.position.set(0, 1.25, -0.76); root.add(rim);
    // Swirl: a few thin bars across the disc that turn while it runs.
    const swirl = new THREE.Group(); swirl.position.set(0, 1.25, -0.755); root.add(swirl);
    const swirlMat = createPS1Material(this.ctx.env, { map: this.ctx.T.white, color: '#000000', unlit: true, fog: false });
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(boxGeo(1.1, 0.03, 0.01), swirlMat); b.rotation.z = i * Math.PI / 3; swirl.add(b); }
    parts.swirl = swirl;
    const glow = makeHalo(this.ctx.env, this.ctx.T.halo, '#e8f4ff', 2.6, 0);
    glow.position.set(0, 1.25, -0.5); root.add(glow);
    // Gears on both sides, and a ring on the roof.
    const gearMat = this.decoMat('metal', null, o.pos, { texScale: 0.4 });
    for (const sx of [-1, 1]) for (const [gy, gz, gr] of [[1.7, -0.25, 0.42], [1.05, 0.38, 0.28]]) {
      const gear = new THREE.Group(); gear.position.set(sx * 0.94, gy, gz); root.add(gear);
      gear.add(new THREE.Mesh(cylGeo(gr, gr, 0.06, 10), gearMat).rotateZ(Math.PI / 2));
      const teeth = Math.round(gr * 26);
      for (let i = 0; i < teeth; i++) {
        const a = i / teeth * Math.PI * 2;
        const t = new THREE.Mesh(boxGeo(0.06, 0.09, 0.07), gearMat); t.position.set(0, Math.cos(a) * (gr + 0.03), Math.sin(a) * (gr + 0.03)); t.rotation.x = -a; gear.add(t);
      }
      const hub = new THREE.Mesh(cylGeo(0.06, 0.06, 0.1, 6), rimMat); hub.rotation.z = Math.PI / 2; hub.position.x = sx * 0.03; gear.add(hub);
      mergeStatic(gear, () => false);
      parts.gears.push({ obj: gear, speed: (gr > 0.35 ? 1 : -1.6) * sx });
    }
    const ring = new THREE.Group(); ring.position.set(0, 2.85, 0); root.add(ring);
    ring.add(new THREE.Mesh(setVertexShade(new THREE.TorusGeometry(0.55, 0.04, 4, 16), 1), rimMat).rotateX(Math.PI / 2));
    for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(boxGeo(1.1, 0.03, 0.03), gearMat); sp.rotation.y = i * Math.PI / 4; ring.add(sp); }
    const beacon = new THREE.Mesh(boxGeo(0.14, 0.14, 0.14), createPS1Material(this.ctx.env, { map: this.ctx.T.lamp, color: '#203040', unlit: true }));
    beacon.position.set(0, 3.05, 0); root.add(beacon);
    parts.spin = ring;
    const [lx, lz] = r(0, 0.2);
    const light = this.addLight({ pos: [x + lx, y + 1.6, z + lz], color: '#cfe6ff', intensity: 0.12, range: 5.5, flicker: 'soft' });
    if (!this.machines) this.machines = new Map();
    this.machines.set(o.id, { id: o.id, pos: new THREE.Vector3(x, y, z), active: 0, target: o.active ? 1 : 0, parts, portalMat, swirlMat, beacon, glow, light });
    this.machineRoots = (this.machineRoots || []).concat(root);
  },

  setMachine(id, on) {
    const m = this.machines && this.machines.get(id);
    if (m) m.target = on ? 1 : 0;
  },

  updateMachines(dt, time) {
    if (!this.machines) return;
    for (const m of this.machines.values()) {
      // Spins up over a couple of seconds and winds down slower.
      m.active += (m.target - m.active) * Math.min(1, dt * (m.target > m.active ? 0.9 : 0.5));
      const a = m.active;
      const shimmer = 0.85 + Math.sin(time * 23) * 0.06 + Math.sin(time * 7.3) * 0.09;
      const w = Math.min(1, a * a * shimmer * 1.15);
      m.portalMat.uniforms.uColor.value.setRGB(w * 0.92, w * 0.96, w);
      m.swirlMat.uniforms.uColor.value.setRGB(w * 0.6, w * 0.75, w * 0.9);
      m.glow.material.uniforms.uIntensity.value = a * a * 0.9 * shimmer;
      m.light.target = 0.12 + 1.6 * a * shimmer;
      const blink = Math.sin(time * (2 + a * 10)) > 0 ? 1 : 0.15;
      m.beacon.material.uniforms.uColor.value.setRGB(0.2 + 0.8 * blink * (0.3 + a), 0.3 + 0.7 * blink * (0.3 + a), 0.45 + 0.55 * blink);
      for (const g of m.parts.gears) g.obj.rotation.x += g.speed * (0.15 + a * 4) * dt;
      m.parts.spin.rotation.y += (0.2 + a * 6) * dt;
      m.parts.swirl.rotation.z += a * 3 * dt;
    }
  },

  updateProps(dt, time) {
    this.updateMachines(dt, time);
    if (this.swayers) for (const s of this.swayers) s.obj.rotation.x = (s.base || 0) + Math.sin(time * 1.3 + s.phase) * s.amp;
    if (this.fountains) for (const f of this.fountains) f.update(dt);
    if (this.spinners) for (const s of this.spinners) s.obj.rotation.y += s.speed * dt;
    if (this.wavers) for (const w of this.wavers) w.obj.rotation.x = -0.4 + Math.sin(time * w.speed) * 0.6;
    if (this.movers) for (const m of this.movers) {
      const t = time * m.speed + m.phase;
      m.obj.position.x = m.cx + Math.sin(t) * m.ax;
      m.obj.position.z = m.cz + Math.sin(t * 0.7) * m.az;
      m.obj.position.y = m.cy + Math.sin(t * 1.3) * 0.03;
      m.obj.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI;
    }
  },
};

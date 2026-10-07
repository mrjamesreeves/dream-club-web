// Items handed to the player. Each is a small PS1-style model drawn into the
// same low-resolution frame as the world, sitting in a numbered slot at the
// top right. Slots 1-3 are always shown, numbered left to right; an item keeps
// its slot until it is used up. Tap or click a slot, or press its number.
import * as THREE from '../../vendor/three.module.js?v=970753f';
import { createEnvironment, createPS1Material, setVertexShade } from './ps1material.js?v=970753f';
import { buildShapes } from './shapes.js?v=970753f';

const box = (w, h, d, mat, shade = 1) => new THREE.Mesh(setVertexShade(new THREE.BoxGeometry(w, h, d), shade), mat);
const cyl = (r0, r1, h, sides, mat) => new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(r0, r1, h, sides), 1), mat);

const MODELS = {
  // Palm-sized and rectangular, with a padded circle at one end.
  listener(env, T) {
    const g = new THREE.Group();
    const plastic = createPS1Material(env, { map: T.plastic });
    const foam = createPS1Material(env, { map: T.foam });
    const grille = createPS1Material(env, { map: T.grille, texScale: 3 });
    const pale = createPS1Material(env, { map: T.concrete, texScale: 0.2 });
    const led = createPS1Material(env, { map: T.led, unlit: true });
    g.add(box(0.2, 0.32, 0.07, plastic));
    const lip = box(0.212, 0.025, 0.078, plastic, 0.75); lip.position.y = -0.15; g.add(lip);
    const rim = cyl(0.092, 0.092, 0.016, 10, plastic); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.07, 0.038); g.add(rim);
    const pad = cyl(0.078, 0.084, 0.05, 10, foam); pad.rotation.x = Math.PI / 2; pad.position.set(0, 0.07, 0.064); g.add(pad);
    const gr = box(0.13, 0.055, 0.006, grille); gr.position.set(0, -0.08, 0.037); g.add(gr);
    const btn = box(0.036, 0.02, 0.014, pale); btn.position.set(0.05, -0.128, 0.038); g.add(btn);
    const ledM = box(0.02, 0.02, 0.012, led); ledM.position.set(-0.055, -0.128, 0.038); g.add(ledM);
    const ant = cyl(0.007, 0.009, 0.09, 4, plastic); ant.position.set(0.075, 0.2, 0); g.add(ant);
    g.userData.led = led;
    return g;
  },
  box(env, T) {
    const g = new THREE.Group();
    g.add(box(0.2, 0.2, 0.2, createPS1Material(env, { map: T.wood, texScale: 0.3 })));
    return g;
  },
};

export const ITEM_DEFS = {
  listener: { model: 'listener', use: 'listen', name: 'the device' },
};

export class Inventory {
  constructor(T, resolution) {
    this.T = T;
    const env = createEnvironment();
    env.uResolution = resolution;
    env.uAmbient.value.set('#4a5258');
    env.uSkyColor.value.set('#2c3438');
    env.uSunColor.value.set('#c8ccc6');
    env.uSunDir.value.set(0.4, 0.6, 0.9).normalize();
    env.uFogNear.value = 1e4; env.uFogFar.value = 2e4; env.uFogHeightStrength.value = 0;
    env.uJitter.value = 0.6;
    this.env = env;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.aspect = 1;
    this.slots = [];
    this.vertical = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.time = 0;
    this.frameMat = createPS1Material(env, { map: T.slot, unlit: true, transparent: true, depthWrite: false, opacity: 0.9 });
    this.frames = [];
    for (let i = 0; i < 3; i++) this.addFrame();
  }

  // Each slot: a frame and its number in the top-left corner.
  addFrame() {
    const i = this.frames.length;
    const frame = new THREE.Mesh(setVertexShade(new THREE.PlaneGeometry(0.42, 0.42), 1), this.frameMat);
    const num = new THREE.Mesh(setVertexShade(new THREE.PlaneGeometry(0.11, 0.11), 1),
      createPS1Material(this.env, { map: digitTexture(i + 1), unlit: true, transparent: true, depthWrite: false, alphaTest: 0.5 }));
    this.scene.add(frame, num);
    this.frames.push({ frame, num });
  }

  numberEl(i) {
    const box = document.getElementById('slot-numbers');
    if (!box) return null;
    while (box.children.length <= i) { const d = document.createElement('div'); d.textContent = String(box.children.length + 1); box.appendChild(d); }
    return box.children[i];
  }

  get count() { return Math.max(3, this.frames.length); }

  // Items in slot order (empty slots skipped).
  get items() { return this.slots.filter(Boolean); }

  // Slots are sized in screen pixels (about 58 on a phone, no more than 64
  // on a big screen), and shrink further if three would not fit across.
  resize(aspect, w = window.innerWidth, h = window.innerHeight) {
    this.aspect = aspect;
    const px = Math.max(46, Math.min(64, Math.min(w, h) * 0.15));
    let k = (px * 2 / h) / 0.42;
    const span = (0.27 + 2 * 0.46 + 0.21) * k;
    if (span > aspect * 2 * 0.72) k *= (aspect * 2 * 0.72) / span;
    this.k = k;
    this.touch = 26 * 2 / h; // the smallest tap target, in overlay units
    // The frame is drawn 216 lines high on its short side; keep the slot
    // numbers at least 8 of those lines tall so they stay readable.
    const lines = 216 * Math.max(1, h / w);
    this.numK = Math.max(k, (8 * 2 / lines) / 0.11);
    this.camera.left = -aspect; this.camera.right = aspect;
    this.camera.updateProjectionMatrix();
  }

  // Slot i (0-based), left to right, the last one at the right edge.
  slotPos(i) {
    const k = this.k ?? 1;
    if (this.vertical) {
      // Down the right edge, centred a little above the middle, so the top
      // of the page (where a browser's own bar may sit) and the dialogue box
      // at the bottom are both left clear.
      const n = Math.max(3, this.frames.length);
      return new THREE.Vector2(this.aspect - 0.27 * k, 0.2 + ((n - 1) / 2 - i) * 0.46 * k);
    }
    return new THREE.Vector2(this.aspect - 0.27 * k - (this.frames.length - 1 - i) * 0.46 * k, 1 - 0.34 * k);
  }

  clear() { for (const it of this.items) this.scene.remove(it.root); this.slots = []; }

  has(id) { return this.slots.some((it) => it && it.id === id); }

  add(id, sceneDef) {
    if (this.has(id)) return null;
    const def = sceneDef || ITEM_DEFS[id] || { model: 'box', use: null, name: id };
    let slot = this.slots.findIndex((x) => !x);
    if (slot < 0) slot = this.slots.length;
    while (this.frames.length <= slot) this.addFrame();
    const root = new THREE.Group();
    let model;
    if (typeof def.model === 'string' && MODELS[def.model]) model = MODELS[def.model](this.env, this.T);
    else {
      // Shape-described items: built from the same description as in the world, scaled to fit the slot.
      const mat = (tex, color, o) => createPS1Material(this.env, { map: this.T[tex] || this.T.white, color: color || '#ffffff', unlit: o.unlit });
      model = buildShapes(def.model || 'coin', mat);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const k = 0.3 / Math.max(size.x, size.y, size.z, 0.01);
      const inner = model; model = new THREE.Group(); inner.position.sub(c); model.add(inner); model.scale.setScalar(k);
      model.rotation.x = 0.5;
    }
    const pivot = new THREE.Group(); pivot.add(model); root.add(pivot);
    this.scene.add(root);
    const it = { id, def, root, pivot, model, slot, intro: 0, active: false, held: 0 };
    this.slots[slot] = it;
    return it;
  }

  remove(id) {
    const i = this.slots.findIndex((it) => it && it.id === id);
    if (i < 0) return;
    this.scene.remove(this.slots[i].root);
    this.slots[i] = null;
  }

  setActive(id, on) { for (const it of this.items) if (it.id === id) it.active = on; }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.frames.forEach(({ frame, num }, i) => {
      const p = this.slotPos(i);
      const k = this.k ?? 1;
      frame.position.set(p.x, p.y, -2); frame.scale.setScalar(k);
      num.visible = false;
      // Spare slots beyond three only show while something is in them.
      const show = i < 3 || !!this.slots[i];
      frame.visible = show;
      // The number is page text, pinned to the frame's top-left corner, so it
      // stays sharp however small the slot is drawn.
      const el = this.numberEl(i);
      if (el) {
        el.style.display = show && this.shown ? 'block' : 'none';
        el.style.left = `${((p.x - 0.19 * k) / this.aspect + 1) / 2 * 100}%`;
        el.style.top = `${(1 - (p.y + 0.19 * k)) / 2 * 100}%`;
      }
    });
    this.slots.forEach((it, i) => {
      if (!it) return;
      const slot = this.slotPos(i);
      it.intro = Math.min(1, it.intro + dt / 1.4);
      const e = 1 - Math.pow(1 - it.intro, 3);
      it.held += ((it.active ? 1 : 0) - it.held) * Math.min(1, dt * 5);
      const h = it.held;
      // Arrives at the centre of the screen, settles into its slot, lifts when used.
      const k = this.k ?? 1;
      let x = slot.x * e, y = -0.05 + (slot.y + 0.05) * e, s = (2.6 + (1 - 2.6) * e) * k;
      const hx = this.aspect - (this.vertical ? 1.1 : 0.6) * k, hy = this.vertical ? -0.45 : -0.2;
      x += (hx - x) * h; y += (hy - y) * h; s += (2.4 * k - s) * h;
      it.pivot.position.set(x, y, 0);
      it.pivot.scale.setScalar(s * 0.95);
      it.pivot.rotation.set(0.25 * (1 - h) + Math.sin(t * 1.3) * 0.08, (1 - h) * t * 0.9 + h * -0.5, h * 0.3);
      if (it.model.userData.led) it.model.userData.led.uniforms.uColor.value.setScalar(it.active ? (Math.sin(t * 12) > 0 ? 1 : 0.35) : 0.3);
    });
  }

  // Screen pixel -> item under it, or null.
  hit(px, py, W, H) {
    const x = (px / W * 2 - 1) * this.aspect, y = 1 - (py / H) * 2;
    for (let i = 0; i < this.slots.length; i++) {
      const it = this.slots[i];
      if (!it) continue;
      const s = this.slotPos(i);
      const k = this.k ?? 1, r = Math.max(0.23 * k, this.touch ?? 0);
      if (Math.abs(x - s.x) < r && Math.abs(y - s.y) < r) return it;
      if (it.held > 0.5 && Math.hypot(x - it.pivot.position.x, y - it.pivot.position.y) < Math.max(0.45 * k, this.touch ?? 0)) return it;
    }
    return null;
  }
}

// A slot number, drawn as chunky pixels.
const digitCache = new Map();
function digitTexture(n) {
  if (digitCache.has(n)) return digitCache.get(n);
  const c = document.createElement('canvas'); c.width = c.height = 12;
  const g = c.getContext('2d');
  g.font = 'bold 11px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#000000'; g.fillText(String(n), 7, 7.5);
  g.fillStyle = '#e8ece8'; g.fillText(String(n), 6, 6.5);
  const img = g.getImageData(0, 0, 12, 12);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  digitCache.set(n, tex);
  return tex;
}

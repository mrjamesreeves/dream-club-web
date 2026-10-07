// Turns a scene description (JSON) into Three.js objects, colliders, walkable
// surfaces, lights, mist, and entities (characters and creatures).
import * as THREE from '../../vendor/three.module.js?v=6782550';
import { createPS1Material, setVertexShade, assignLights, assignLightsToObject, refreshLightColors } from '../engine/ps1material.js?v=6782550';
import { createLight, updateLights, makeHalo, makePool, makeShaft } from '../engine/lights.js?v=6782550';
import { buildHumanoid, buildArm, buildAmalgam, buildDog } from './characters.js?v=6782550';
import { mulberry } from '../engine/textures.js?v=6782550';
import { AmbientParticles } from '../engine/particles.js?v=6782550';
import { makeSignTexture } from '../engine/signs.js?v=6782550';
import { PropMethods } from './props.js?v=6782550';
import { buildShapes } from '../engine/shapes.js?v=6782550';
import { mergeStatic } from '../engine/merge.js?v=6782550';
import { bakeWorldUV } from '../engine/pbr.js?v=6782550';
import { voiceFor } from '../engine/voice.js?v=6782550';

// The one colour that means "this way" in every dream.
export const GUIDE_COLOR = '#ffd9a0';
const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

export class SceneBuilder {
  constructor(ctx) {
    this.pbr = !!ctx.pbr;
    this.pbrPoint = (ctx.pbr && ctx.pbr.point) || 30;
    this.pbrTex = new Map();
    this.ctx = ctx; // { env, T, audio }
    this.group = new THREE.Group();
    this.colliders = [];
    this.walkables = [];
    this.entities = new Map();
    this.scrollers = [];
    this.rolling = []; // scenery that streams past a vehicle: { obj, base }
    this.rideMats = []; // planes whose texture slides with the ride: { material, scale, axis }
    this.mist = [];
    this.staticMaterials = []; // { material, position }
    this.names = {};
    this.lights = [];
    this.lightById = new Map();
    this.objectsById = new Map();
    this.examinables = [];
    this.items = {};
  }

  mat(opts) {
    const { T, env } = this.ctx;
    const map = T[opts.tex] || T.concrete;
    return createPS1Material(env, { map, texScale: opts.texScale ?? 2, worldUV: opts.worldUV !== false, color: opts.color, unlit: opts.unlit, ...opts.extra });
  }

  // Standard materials for a scene rendered physically. Textures are cloned
  // as sRGB so the PS1 scenes keep their raw copies.
  pbrMat(map, opts) {
    let tex = this.pbrTex.get(map);
    if (!tex) { tex = map.clone(); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; this.pbrTex.set(map, tex); }
    const x = opts.extra || {};
    const common = { map: tex, color: opts.color || '#ffffff', vertexColors: true, fog: true };
    if (x.transparent) common.transparent = true;
    if (x.alphaTest) common.alphaTest = x.alphaTest;
    if (x.side) common.side = x.side;
    if (opts.unlit) return new THREE.MeshBasicMaterial(common);
    return new THREE.MeshStandardMaterial({ ...common, roughness: opts.roughness ?? 0.9, metalness: 0 });
  }

  // Materials for plain boxes and planes are shared by look and by area, so
  // the meshes can be merged. Lit fixtures (unlit heads that flicker) get their own.
  sharedMat(o) {
    if (o.unlit || o.unique) { const m = this.mat(o); this.staticMaterials.push({ material: m, position: new THREE.Vector3().fromArray(o.pos) }); return m; }
    if (!this.boxMats) this.boxMats = new Map();
    const cell = `${Math.round(o.pos[0] / 8)},${Math.round(o.pos[1] / 8)},${Math.round(o.pos[2] / 8)}`;
    const key = `${o.tex}|${o.color}|${o.texScale ?? 2}|${o.worldUV !== false}|${cell}`;
    let m = this.boxMats.get(key);
    if (!m) {
      m = this.mat(o);
      this.boxMats.set(key, m);
      this.staticMaterials.push({ material: m, position: new THREE.Vector3().fromArray(o.pos) });
    }
    return m;
  }

  addStatic(mesh, position) {
    this.group.add(mesh);
    this.staticMaterials.push({ material: mesh.material, position: position.clone() });
  }

  addBox(o) {
    const [w, h, d] = o.size;
    const segs = (len) => Math.max(1, Math.min(96, Math.ceil(len / (o.seg || 2))));
    const geo = setVertexShade(new THREE.BoxGeometry(w, h, d, segs(w), segs(h), segs(d)), o.shade ?? 1);
    if (this.pbr) bakeWorldUV(geo, o.pos, o.texScale ?? 2);
    const mesh = new THREE.Mesh(geo, this.sharedMat(o));
    mesh.position.fromArray(o.pos);
    if (this.pbr) { mesh.castShadow = true; mesh.receiveShadow = true; }
    if (o.rot) mesh.rotation.set(...o.rot.map(THREE.MathUtils.degToRad));
    mesh.userData.surface = o.surface || 'concrete';
    this.group.add(mesh);
    if (o.collide !== false && !o.rot) {
      this.colliders.push({
        min: new THREE.Vector3(o.pos[0] - w / 2, o.pos[1] - h / 2, o.pos[2] - d / 2),
        max: new THREE.Vector3(o.pos[0] + w / 2, o.pos[1] + h / 2, o.pos[2] + d / 2),
      });
    }
    if (o.walkable !== false) this.walkables.push(mesh);
    return mesh;
  }

  addPlane(o) {
    if (o.rideScroll) o = { ...o, unique: true };
    const [w, d] = o.size;
    const segs = (len) => Math.max(1, Math.min(160, Math.ceil(len / (o.seg || 2))));
    const geo = setVertexShade(new THREE.PlaneGeometry(w, d, segs(w), segs(d)), o.shade ?? 1);
    geo.rotateX(-Math.PI / 2);
    if (this.pbr) bakeWorldUV(geo, o.pos, o.texScale ?? 2);
    const mesh = new THREE.Mesh(geo, o.unique ? this.mat(o) : this.sharedMat(o));
    mesh.position.fromArray(o.pos);
    if (this.pbr) mesh.receiveShadow = true;
    mesh.userData.surface = o.surface || 'concrete';
    if (o.unique) this.addStatic(mesh, mesh.position); else this.group.add(mesh);
    if (o.walkable !== false) this.walkables.push(mesh);
    return mesh;
  }

  addWater(o) {
    const mesh = this.addPlane({ ...o, tex: o.tex || 'water', walkable: o.walkable ?? false, surface: 'water', texScale: o.texScale ?? 3, unique: true });
    mesh.material.uniforms.uUvOffset.value.set(0, 0);
    this.scrollers.push({ material: mesh.material, flow: o.flow || [0, 0] });
    return mesh;
  }

  addStairs(o) {
    const [dx, dz] = DIRS[o.dir || '+x'];
    const rise = o.rise ?? 0.25, run = o.run ?? 0.3, width = o.width ?? 1.5, n = o.steps ?? 10;
    const [x0, y0, z0] = o.pos;
    for (let i = 0; i < n; i++) {
      const top = y0 + rise * (i + 1);
      const cx = x0 + dx * (run * i + run / 2), cz = z0 + dz * (run * i + run / 2);
      // Each step is solid from the ground up, so the flight reads as a mass from the side.
      const h = o.solid === false ? rise : top - y0;
      const size = dx !== 0 ? [run, h, width] : [width, h, run];
      this.addBox({ pos: [cx, top - h / 2, cz], size, tex: o.tex || 'concrete', texScale: o.texScale ?? 1, shade: o.shade, seg: 8 });
    }
  }

  // A window you can see through: a frame, mullions, a pane of glass (faint,
  // so the aim and the eye pass through it), and a collider so the player
  // cannot. `axis` is the wall's normal: 'z' for a wall running along x.
  // `blind` (0..1) drops a venetian blind over that fraction from the top;
  // `sill` adds a sill on the inside (the -axis side unless `inside` is 1).
  addWindow(o) {
    const [x, y, z] = o.pos, [w, h] = o.size;
    const axis = o.axis || 'z', fw = o.frameWidth ?? 0.08, depth = o.depth ?? 0.1;
    const frameTex = o.frame || 'woodDark';
    const sz = (a, b) => (axis === 'z' ? [a, b, depth] : [depth, b, a]);
    const at = (a, b) => (axis === 'z' ? [x + a, y + b, z] : [x, y + b, z + a]);
    const piece = (a, b, pw, ph, extra = {}) => this.addBox({ type: 'box', pos: at(a, b), size: sz(pw, ph), tex: frameTex, color: o.frameColor, texScale: 1, collide: false, walkable: false, ...extra });
    piece(0, h / 2 - fw / 2, w, fw); piece(0, -h / 2 + fw / 2, w, fw);
    piece(-w / 2 + fw / 2, 0, fw, h); piece(w / 2 - fw / 2, 0, fw, h);
    const [cols, rows] = o.mullions || [2, 1];
    for (let i = 1; i < cols; i++) piece(-w / 2 + (w / cols) * i, 0, fw * 0.6, h - fw * 2);
    for (let j = 1; j < rows; j++) piece(0, -h / 2 + (h / rows) * j, w - fw * 2, fw * 0.6);
    if (o.glass !== false) {
      const mat = createPS1Material(this.ctx.env, { map: this.ctx.T.white, color: o.glassColor || '#9ab4c4', transparent: true, opacity: o.opacity ?? 0.14, depthWrite: false });
      const pane = new THREE.Mesh(setVertexShade(new THREE.BoxGeometry(...sz(w - fw * 2, h - fw * 2).map((v, i) => (i === (axis === 'z' ? 2 : 0) ? 0.01 : v))), 1), mat);
      pane.position.fromArray(at(0, 0)); pane.renderOrder = 5; pane.userData.noOcclude = true;
      this.group.add(pane);
    }
    if (o.blind) {
      const bh = h * o.blind;
      piece(0, h / 2 - fw - bh / 2, w - fw * 2, bh, { tex: o.blindTex || 'stripe', color: o.blindColor || '#d8d2c0', texScale: 0.5 });
    }
    if (o.sill !== false) {
      const side = o.inside ?? -1;
      const sw = w + fw * 2, sd = depth * 2.4;
      this.addBox({ type: 'box', pos: axis === 'z' ? [x, y - h / 2 - 0.02, z + side * sd / 2] : [x + side * sd / 2, y - h / 2 - 0.02, z], size: axis === 'z' ? [sw, 0.05, sd] : [sd, 0.05, sw], tex: frameTex, color: o.frameColor, texScale: 1, collide: false, walkable: false });
    }
    if (o.collide !== false) this.addCollider({ pos: [x, y, z], size: sz(w, h).map((v, i) => (i === (axis === 'z' ? 2 : 0) ? 0.3 : v)) });
  }

  // Invisible wall.
  addCollider(o) {
    const [w, h, d] = o.size;
    this.colliders.push({
      min: new THREE.Vector3(o.pos[0] - w / 2, o.pos[1] - h / 2, o.pos[2] - d / 2),
      max: new THREE.Vector3(o.pos[0] + w / 2, o.pos[1] + h / 2, o.pos[2] + d / 2),
    });
  }

  addLight(o) {
    const l = this.makeLight(o);
    if (o.id) this.lightById.set(o.id, l);
    return l;
  }

  makeLight(o) {
    const l = createLight({ pos: o.pos, color: o.color || '#e0a050', intensity: o.intensity ?? 1, range: o.range ?? 8, profile: o.flicker || (o.glow ? 'sodium' : 'soft'), seed: this.lights.length * 7.31 + 1.3, off: !!(o.off || (this.building && this.building.off)) });
    // Which scene object the light belongs to, so a whole fixture can be switched.
    l.owner = o.owner || (this.building && this.building.id) || null;
    this.ctx.env.pointLights.push(l);
    this.lights.push(l);
    if (this.pbr && !l.off) {
      const pl = new THREE.PointLight(o.color || '#e0a050', (o.intensity ?? 1) * this.pbrPoint, (o.range ?? 8) * 1.3, 2);
      pl.position.fromArray(o.pos);
      this.group.add(pl);
    }
    if (o.glow) this.addHalo(o.glowPos || o.pos, o.glowColor || o.color || '#e0a050', o.glowSize ?? 1.4, l, o.glowStrength ?? 0.45);
    return l;
  }

  addHalo(pos, color, size, light, strength = 0.45) {
    const h = makeHalo(this.ctx.env, this.ctx.T.halo, color, size, strength);
    h.position.fromArray(pos);
    this.group.add(h);
    light.halos.push({ uniforms: h.material.uniforms, base: strength });
    return h;
  }

  emissive(light, mesh) {
    light.emissive.push({ material: mesh.material, base: mesh.material.uniforms.uColor.value.clone() });
  }

  addLamp(o) {
    const [x, y, z] = o.pos;
    const h = o.height ?? 3.2;
    const color = o.color || '#f0b060';
    this.addBox({ pos: [x, y + h / 2, z], size: [0.14, h, 0.14], tex: 'metal', texScale: 0.5, collide: false, walkable: false });
    const head = this.addBox({ pos: [x, y + h + 0.1, z], size: [0.36, 0.2, 0.36], tex: 'lamp', unlit: true, collide: false, walkable: false, texScale: 0.5 });
    head.material.uniforms.uColor.value.set(color);
    const l = this.addLight({ pos: [x, y + h - 0.2, z], color: o.color || '#e0a050', intensity: o.intensity ?? 1.1, range: o.range ?? 9, flicker: o.flicker || 'sodium' });
    this.emissive(l, head);
    this.addHalo([x, y + h + 0.05, z], color, o.glowSize ?? 2.6, l, 0.7);
  }

  addRailing(o) {
    const a = new THREE.Vector3().fromArray(o.from), b = new THREE.Vector3().fromArray(o.to);
    const len = a.distanceTo(b), h = o.height ?? 1.0;
    const flat = a.clone().setY(0).distanceTo(b.clone().setY(0));
    const n = Math.max(2, Math.round(flat / (o.spacing || 2)) + 1);
    for (let i = 0; i < n; i++) {
      const p = a.clone().lerp(b, i / (n - 1));
      this.addBox({ pos: [p.x, p.y + h / 2, p.z], size: [0.08, h, 0.08], tex: 'metal', texScale: 0.5, collide: false, walkable: false });
    }
    // Top bar follows the slope.
    const mid = a.clone().lerp(b, 0.5);
    const geo = setVertexShade(new THREE.BoxGeometry(0.06, 0.06, len + 0.08), 1);
    const bar = new THREE.Mesh(geo, this.mat({ tex: 'metal', texScale: 0.5 }));
    bar.position.set(mid.x, mid.y + h, mid.z);
    bar.lookAt(b.x, b.y + h, b.z);
    this.addStatic(bar, bar.position);
    if (o.collide) {
      // A thin invisible wall along the rail so the player cannot step over the edge.
      const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z);
      const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y) + 2;
      this.colliders.push({
        min: new THREE.Vector3(Math.min(a.x, b.x) - (dx < 0.01 ? 0.05 : 0), minY, Math.min(a.z, b.z) - (dz < 0.01 ? 0.05 : 0)),
        max: new THREE.Vector3(Math.max(a.x, b.x) + (dx < 0.01 ? 0.05 : 0), maxY, Math.max(a.z, b.z) + (dz < 0.01 ? 0.05 : 0)),
      });
    }
  }

  addMist(o) {
    const { env, T } = this.ctx;
    const rand = mulberry(o.seed ?? 7);
    const mat = createPS1Material(env, { map: T.mist, color: o.color || '#6e8288', unlit: true, billboard: true, transparent: true, opacity: o.alpha ?? 0.12, depthWrite: false });
    const geo = setVertexShade(new THREE.PlaneGeometry(1, 1), 1);
    const [cx, cy, cz] = o.pos, [sx, sy, sz] = o.size;
    const [smin, smax] = o.scale || [3, 7];
    for (let i = 0; i < (o.count ?? 40); i++) {
      const m = new THREE.Mesh(geo, mat);
      const base = new THREE.Vector3(cx + (rand() - 0.5) * sx, cy + (rand() - 0.5) * sy, cz + (rand() - 0.5) * sz);
      const s = smin + rand() * (smax - smin);
      m.scale.set(s, s * 0.6, 1);
      m.position.copy(base);
      m.renderOrder = 5;
      this.group.add(m);
      this.mist.push({ mesh: m, base, phase: rand() * Math.PI * 2, rate: 0.2 + rand() * 0.3, amp: 0.5 + rand() * 1.5, drift: (rand() - 0.5) * 0.3 });
    }
  }

  // Recolours the sky dome at runtime (night falling): the sky action.
  setSky(o = {}) {
    if (!this.skyGeo) return;
    const geo = this.skyGeo, pos = geo.attributes.position, col = geo.attributes.color, r = this.skyRadius;
    const top = new THREE.Color(o.top || '#22343b'), horizon = new THREE.Color(o.horizon || this.ctx.env.uFogColor.value.getHex());
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = THREE.MathUtils.clamp(pos.getY(i) / r, 0, 1);
      c.copy(horizon).lerp(top, Math.pow(y, 0.6));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  addSky(o = {}) {
    const { env, T } = this.ctx;
    const r = o.radius ?? 95;
    const sky = new THREE.Group();
    const geo = new THREE.SphereGeometry(r, 16, 10);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color(o.top || '#22343b'), horizon = new THREE.Color(o.horizon || env.uFogColor.value.getHex());
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = THREE.MathUtils.clamp(pos.getY(i) / r, 0, 1);
      c.copy(horizon).lerp(top, Math.pow(y, 0.6));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    sky.add(new THREE.Mesh(geo, createPS1Material(env, { map: T.white, unlit: true, fog: false, side: THREE.BackSide })));
    this.skyGeo = geo; this.skyRadius = r;

    if (o.moon !== false) {
      const dir = new THREE.Vector3().fromArray(o.moonDir || env.uSunDir.value.toArray()).normalize();
      const moon = new THREE.Mesh(setVertexShade(new THREE.PlaneGeometry(1, 1), 1), createPS1Material(env, { map: T.moon, unlit: true, fog: false, billboard: true, alphaTest: 0.5, color: o.moonColor || '#d8e0d8' }));
      const size = o.moonSize ?? 7;
      moon.scale.set(size, size, 1);
      moon.position.copy(dir).multiplyScalar(r * 0.9);
      sky.add(moon);
    }
    const stars = o.stars ?? 28;
    const rand = mulberry(99);
    const starMat = createPS1Material(env, { map: T.star, unlit: true, fog: false, billboard: true });
    const starGeo = setVertexShade(new THREE.PlaneGeometry(1, 1), 1);
    for (let i = 0; i < stars; i++) {
      const s = new THREE.Mesh(starGeo, starMat);
      const az = rand() * Math.PI * 2, el = 0.15 + rand() * 1.2;
      s.position.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(r * 0.9);
      const sz = 0.35 + rand() * 0.5;
      s.scale.set(sz, sz, 1);
      sky.add(s);
    }
    this.group.add(sky);
    this.sky = sky;
  }

  // Furniture and fittings, all boxes.
  addTable(o) {
    const [x, y, z] = o.pos; const [w, d] = o.size || [1.2, 0.8]; const h = o.height ?? 0.75;
    this.addBox({ pos: [x, y + h - 0.025, z], size: [w, 0.05, d], tex: o.tex || 'woodDark', texScale: 1, walkable: false });
    if (o.cloth) {
      const color = typeof o.cloth === 'string' ? o.cloth : undefined;
      this.addBox({ pos: [x, y + h + 0.005, z], size: [w + 0.1, 0.01, d + 0.1], tex: o.clothTex || 'cloth', color, texScale: 1, collide: false, walkable: false });
      // The cloth hangs over the edges.
      for (const [px, pz, sw, sd] of [[0, d / 2 + 0.05, w + 0.1, 0.01], [0, -d / 2 - 0.05, w + 0.1, 0.01], [w / 2 + 0.05, 0, 0.01, d + 0.1], [-w / 2 - 0.05, 0, 0.01, d + 0.1]])
        this.addBox({ pos: [x + px, y + h - 0.12, z + pz], size: [sw, 0.25, sd], tex: o.clothTex || 'cloth', color, texScale: 1, collide: false, walkable: false });
    }
    if (o.pedestal) {
      this.addBox({ pos: [x, y + (h - 0.05) / 2, z], size: [0.12, h - 0.05, 0.12], tex: 'metal', texScale: 0.5, collide: false, walkable: false });
      this.addBox({ pos: [x, y + 0.02, z], size: [0.5, 0.04, 0.5], tex: 'metal', texScale: 0.5, collide: false, walkable: false });
    } else {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.addBox({ pos: [x + sx * (w / 2 - 0.05), y + (h - 0.05) / 2, z + sz * (d / 2 - 0.05)], size: [0.06, h - 0.05, 0.06], tex: o.tex || 'woodDark', texScale: 1, collide: false, walkable: false });
    }
  }

  addChair(o) {
    const [x, y, z] = o.pos; const yaw = ((o.yaw ?? 0) % 360 + 360) % 360;
    const tex = o.tex || 'woodDark';
    const r = (lx, lz) => { // rotate local offsets by yaw (multiples of 90)
      if (yaw === 90) return [lz, -lx]; if (yaw === 180) return [-lx, -lz]; if (yaw === 270) return [-lz, lx]; return [lx, lz];
    };
    const at = (lx, ly, lz, size) => { const [dx, dz] = r(lx, lz); const sz = (yaw === 90 || yaw === 270) ? [size[2], size[1], size[0]] : size; this.addBox({ pos: [x + dx, y + ly, z + dz], size: sz, tex, texScale: 0.5, collide: false, walkable: false }); };
    at(0, 0.45, 0, [0.44, 0.05, 0.44]);
    at(0, 0.75, -0.2, [0.44, 0.55, 0.04]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) at(sx * 0.19, 0.21, sz * 0.19, [0.04, 0.43, 0.04]);
  }

  // Two benches facing each other across a table, with high backs. Long axis along x at yaw 0.
  addBooth(o) {
    const [x, y, z] = o.pos; const yaw = ((o.yaw ?? 0) % 360 + 360) % 360;
    const len = o.length ?? 2.2, tex = o.tex || 'dress', wood = o.wood || 'woodDark';
    const rot = (yaw === 90 || yaw === 270);
    const r = (lx, lz) => { if (yaw === 90) return [lz, -lx]; if (yaw === 180) return [-lx, -lz]; if (yaw === 270) return [-lz, lx]; return [lx, lz]; };
    const at = (lx, ly, lz, size, t, extra = {}) => { const [dx, dz] = r(lx, lz); const sz = rot ? [size[2], size[1], size[0]] : size; return this.addBox({ pos: [x + dx, y + ly, z + dz], size: sz, tex: t, texScale: 1, walkable: false, ...extra }); };
    for (const side of [-1, 1]) {
      at(0, 0.23, side * 0.95, [len, 0.46, 0.55], tex);               // seat
      at(0, 0.62, side * 1.17, [len, 0.84, 0.12], tex);                // back
      at(0, 0.5, side * 0.95, [len, 0.04, 0.6], tex, { collide: false }); // cushion lip
    }
    at(0, 0.73, 0, [len - 0.3, 0.05, 0.75], wood);                    // table
    at(0, 0.35, 0, [0.14, 0.7, 0.14], 'metal', { collide: false });  // pedestal
    if (o.lamp !== false) {
      const shade = at(0, 0.95, 0, [0.18, 0.2, 0.18], 'lamp', { collide: false, unlit: true });
      const l = this.addLight({ pos: [x, y + 1.3, z], color: o.lampColor || '#e8b070', intensity: o.lampIntensity ?? 0.7, range: o.lampRange ?? 4, flicker: 'candle' });
      this.emissive(l, shade);
      this.addHalo([x, y + 0.95, z], o.lampColor || '#e8b070', 1.2, l, 0.6);
    }
  }

  addLantern(o) {
    const [x, y, z] = o.pos;
    const b = this.addBox({ pos: [x, y, z], size: o.size || [0.3, 0.36, 0.3], tex: o.tex || 'lantern', unlit: true, collide: false, walkable: false, texScale: 0.36 });
    this.addBox({ pos: [x, y + 0.3, z], size: [0.02, 0.25, 0.02], tex: 'dark', collide: false, walkable: false });
    const color = o.color || '#ff5a3a';
    const l = this.addLight({ pos: [x, y - 0.1, z], color, intensity: o.intensity ?? 0.7, range: o.range ?? 4, flicker: o.flicker || 'candle' });
    this.emissive(l, b);
    this.addHalo([x, y, z], color, o.glowSize ?? 1.6, l, 0.65);
    return b;
  }

  addCeilingLight(o) {
    const [x, y, z] = o.pos;
    const color = o.color || '#f2d7a8';
    const head = this.addBox({ pos: [x, y - 0.03, z], size: o.size || [0.5, 0.06, 0.5], tex: 'lamp', unlit: true, collide: false, walkable: false, texScale: 0.5 });
    head.material.uniforms.uColor.value.set(color);
    const l = this.addLight({ pos: [x, y - 0.3, z], color: o.color || '#e8c890', intensity: o.intensity ?? 0.9, range: o.range ?? 7, flicker: o.flicker || 'fluorescent' });
    this.emissive(l, head);
    this.addHalo([x, y - 0.1, z], color, o.glowSize ?? 1.8, l, 0.5);
  }

  addTableLamp(o) {
    const [x, y, z] = o.pos;
    const color = o.color || '#f0c080';
    this.addBox({ pos: [x, y + 0.8, z], size: [0.04, 0.12, 0.04], tex: 'metal', texScale: 0.3, collide: false, walkable: false });
    const shade = this.addBox({ pos: [x, y + 0.93, z], size: [0.16, 0.16, 0.16], tex: 'lamp', unlit: true, collide: false, walkable: false, texScale: 0.3 });
    const l = this.addLight({ pos: [x, y + 1.15, z], color, intensity: o.intensity ?? 0.6, range: o.range ?? 3, flicker: o.flicker || 'candle' });
    this.emissive(l, shade);
    this.addHalo([x, y + 0.93, z], color, o.glowSize ?? 1.1, l, 0.65);
  }

  // A mirror that reflects: a pane the room is drawn into each frame from
  // the other side (main.js renderMirrors), in a frame. `axis` is the
  // wall's normal ('z' for a wall along x), `facing` which way it looks
  // (+1 or -1 along that axis). The player has no body, so the glass shows
  // the room and not them.
  addMirror(o) {
    const [x, y, z] = o.pos, [w, h] = o.size || [0.6, 0.9];
    const axis = o.axis || 'z', facing = o.facing ?? 1;
    const target = new THREE.WebGLRenderTarget(160, 120, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: target.texture }, textureMatrix: { value: new THREE.Matrix4() }, uTint: { value: new THREE.Color(o.tint || '#9aa8a8') } },
      vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv4; void main() { vUv4 = textureMatrix * modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform vec3 uTint; varying vec4 vUv4; void main() { vec3 c = texture2DProj(tDiffuse, vUv4).rgb; c = floor(c * 15.0 + 0.5) / 15.0; gl_FragColor = vec4(mix(c, uTint, 0.22) * 0.92, 1.0); }',
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = axis === 'z' ? (facing > 0 ? 0 : Math.PI) : (facing > 0 ? Math.PI / 2 : -Math.PI / 2);
    mesh.userData.noOcclude = true;
    this.group.add(mesh);
    const normal = new THREE.Vector3(axis === 'z' ? 0 : facing, 0, axis === 'z' ? facing : 0);
    this.mirrors = this.mirrors || [];
    this.mirrors.push({ mesh, target, normal, camera: new THREE.PerspectiveCamera(), textureMatrix: mat.uniforms.textureMatrix.value, range: o.range ?? 14 });
    this.keepers = (this.keepers || []).concat({ obj: mesh });
    // The frame.
    const fw = o.frameWidth ?? 0.06, d = 0.05, back = -facing * 0.02;
    const at = (a, b) => (axis === 'z' ? [x + a, y + b, z + back] : [x + back, y + b, z + a]);
    const sz = (a, b) => (axis === 'z' ? [a, b, d] : [d, b, a]);
    for (const [a, b, pw, ph] of [[0, h / 2 + fw / 2, w + fw * 2, fw], [0, -h / 2 - fw / 2, w + fw * 2, fw], [-w / 2 - fw / 2, 0, fw, h], [w / 2 + fw / 2, 0, fw, h]]) {
      this.addBox({ pos: at(a, b), size: sz(pw, ph), tex: o.frame || 'gold', texScale: 1, collide: false, walkable: false });
    }
  }

  // A standing lamp: a pole, a shade that glows, a pool of light round it.
  // For marking the way across a floor that has no walls to hang a light on.
  addFloorLamp(o) {
    const [x, y, z] = o.pos, h = o.height ?? 1.6, color = o.color || '#f0d8b0';
    this.addBox({ pos: [x, y + 0.02, z], size: [0.36, 0.04, 0.36], tex: 'metal', texScale: 0.3, collide: false, walkable: false });
    this.addBox({ pos: [x, y + h / 2, z], size: [0.04, h, 0.04], tex: 'metal', texScale: 0.3, collide: false, walkable: false });
    const shade = this.addBox({ pos: [x, y + h + 0.14, z], size: [0.34, 0.3, 0.34], tex: 'lamp', unlit: true, collide: false, walkable: false, texScale: 0.5 });
    const l = this.addLight({ ...o, pos: [x, y + h + 0.1, z], color, intensity: o.intensity ?? 1.0, range: o.range ?? 6, flicker: o.flicker || 'soft' });
    this.emissive(l, shade);
    this.addHalo([x, y + h + 0.14, z], color, o.glowSize ?? 1.4, l, 0.6);
  }

  // A guide: light with nothing to explain it. The engine's way of saying
  // "there": a point light with no fixture, a pool on the floor under it, and
  // (in dusty air) a shaft standing from the floor up to it. `pos` is where
  // the light is; `floor` where the pool and shaft stand. `off` builds it dark
  // until a `light` action brings it up.
  addGuide(o) {
    const [x, y, z] = o.pos;
    const color = o.color || GUIDE_COLOR;
    const floor = o.floor ?? 0;
    const l = this.addLight({ id: o.id, pos: [x, y, z], color, intensity: o.intensity ?? 1.4, range: o.range ?? 6, flicker: o.flicker || 'soft', off: o.off });
    if (o.pool !== false) {
      const strength = o.poolStrength ?? 0.26;
      const pool = makePool(this.ctx.env, this.ctx.T.halo, color, o.poolSize ?? (o.range ?? 6) * 0.7, strength);
      pool.position.set(x, floor + 0.03, z);
      this.group.add(pool);
      l.halos.push({ uniforms: pool.material.uniforms, base: strength });
    }
    if (o.shaft) {
      const sp = typeof o.shaft === 'object' ? o.shaft : {};
      const strength = sp.strength ?? 0.13;
      const h = (y - floor) * (sp.height ?? 1);
      const shaft = makeShaft(this.ctx.env, color, sp.radius ?? 0.9, h, strength);
      shaft.position.set(x, floor + h / 2, z);
      this.group.add(shaft);
      l.halos.push({ uniforms: shaft.material.uniforms, base: strength });
    }
    return l;
  }

  // A gallery spot: a cord from the ceiling, a cone shade, and a warm light
  // under it. `drop` is the cord length; `off` builds it dark.
  addSpotlight(o) {
    const [x, y, z] = o.pos;
    const drop = o.drop ?? 2;
    const color = o.color || '#ffd9a0';
    this.addBox({ pos: [x, y - drop / 2, z], size: [0.025, drop, 0.025], tex: 'black', collide: false, walkable: false });
    const sy = y - drop - 0.14;
    this.addBox({ pos: [x, sy + 0.1, z], size: [0.3, 0.2, 0.3], tex: 'metal', texScale: 0.3, collide: false, walkable: false, shade: 0.6 });
    const shade = this.addBox({ pos: [x, sy - 0.02, z], size: [0.26, 0.04, 0.26], tex: 'lamp', unlit: true, collide: false, walkable: false, texScale: 0.3 });
    shade.material.uniforms.uColor.value.set(color);
    const l = this.addLight({ id: o.id, pos: [x, sy - 0.25, z], color, intensity: o.intensity ?? 1.1, range: o.range ?? 6, flicker: o.flicker || 'soft', off: o.off });
    this.emissive(l, shade);
    this.addHalo([x, sy - 0.1, z], color, o.glowSize ?? 1.3, l, o.glowStrength ?? 0.5);
    // The pool of light on the floor, so a lit place reads from across a room.
    if (o.pool !== false) {
      const pool = makePool(this.ctx.env, this.ctx.T.halo, color, o.poolSize ?? (o.range ?? 6) * 0.7, o.poolStrength ?? 0.3);
      pool.position.set(x, (o.floor ?? 0) + 0.03, z);
      this.group.add(pool);
      l.halos.push({ uniforms: pool.material.uniforms, base: o.poolStrength ?? 0.3 });
    }
    return l;
  }

  // Neon sign: text from two or more parts in different fonts and colours.
  addSign(o) {
    const { env } = this.ctx;
    const [w, h] = o.size || [3, 0.8];
    const tex = makeSignTexture(o.parts || [{ text: o.text || 'OPEN', font: 'sans', color: '#ff4060' }], { dead: (o.dead || o.faded) && !o.intact, faded: o.faded, width: o.hires ? 1024 : 256, height: o.hires ? 256 : 64 });
    if (this.pbr) { tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; }
    const mat = this.pbr
      ? (o.faded ? new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false, fog: true, color: o.fadeColor || '#8a867e', roughness: 1, metalness: 0 })
               : new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false, fog: true, color: '#ffffff' }))
      : createPS1Material(env, { map: tex, unlit: true, worldUV: false, texScale: 1, alphaTest: 0.5, transparent: true, depthWrite: false, color: o.faded ? (o.fadeColor || '#8a867e') : '#ffffff' });
    const geo = setVertexShade(new THREE.PlaneGeometry(w, h), 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.fromArray(o.pos);
    mesh.rotation.y = THREE.MathUtils.degToRad(o.yaw ?? 0);
    mesh.renderOrder = 3;
    this.group.add(mesh);
    if (o.backing !== false) {
      const back = this.addBox({ pos: o.pos, size: [w + 0.3, h + 0.2, 0.08], tex: 'black', collide: false, walkable: false, texScale: 1 });
      back.rotation.y = mesh.rotation.y;
      back.translateZ(-0.06);
    }
    if (!o.dead && !o.faded) {
      const c = new THREE.Color(0, 0, 0);
      const parts = o.parts || [];
      for (const p of parts) c.add(new THREE.Color(p.color || '#ff4060'));
      if (parts.length) c.multiplyScalar(1 / parts.length);
      const hex = '#' + c.getHexString();
      const f = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), mesh.rotation.y);
      const l = this.addLight({ pos: [o.pos[0] + f.x * 1.2, o.pos[1] - 0.3, o.pos[2] + f.z * 1.2], color: hex, intensity: o.intensity ?? 0.9, range: o.range ?? 7, flicker: o.flicker ? 'neonBad' : 'neon' });
      if (mat.userData.ps1) l.emissive.push({ material: mat, base: new THREE.Color(1, 1, 1) });
      this.addHalo([o.pos[0] + f.x * 0.15, o.pos[1], o.pos[2] + f.z * 0.15], hex, Math.max(w, h) * 1.2, l, 0.4);
    }
    return mesh;
  }

  // Where to aim, and how big a target, for looking at an object.
  examineShape(o) {
    const p = o.pos || [0, 0, 0];
    const at = (dy, r) => ({ center: [p[0], p[1] + dy, p[2]], radius: r });
    if (o.examineAt) return { center: o.examineAt, radius: o.examineRadius ?? 0.5 };
    let s;
    switch (o.type) {
      case 'box': s = { center: p, radius: Math.max(...o.size) / 2 }; break;
      case 'panel': case 'sign': s = { center: p, radius: Math.max(...(o.size || [1, 1])) / 2 }; break;
      case 'table': s = at(0.8, 0.6); break;
      case 'roundTable': s = at(0.8, (o.radius ?? 0.7)); break;
      case 'chair': s = at(0.5, 0.35); break;
      case 'booth': s = at(0.7, 1.2); break;
      case 'food': s = at(0.08, 0.2); break;
      case 'item': s = at(0.05, 0.22); break;
      case 'lantern': s = at(0, 0.35); break;
      case 'ceilingLight': s = at(-0.1, 0.45); break;
      case 'lamp': s = at(1.6, 0.5); break;
      case 'tableLamp': s = at(0.9, 0.25); break;
      case 'plant': s = at(0.8, 0.5); break;
      case 'oven': s = at(1.0, 1.1); break;
      case 'jukebox': s = at(0.9, 0.6); break;
      case 'aquarium': s = at(1.1, 0.8); break;
      case 'luckyCat': s = at(0.2, 0.25); break;
      case 'screen': s = at(0.9, 1.0); break;
      case 'cylinder': s = at((o.height ?? 1) / 2, o.radius ?? 0.3); break;
      case 'piano': s = at(0.8, 1.0); break;
      default: s = at(0.5, 0.5);
    }
    if (o.examineRadius) s.radius = o.examineRadius;
    return s;
  }

  registerExaminable(o, meshes) {
    const def = o.type === 'item' ? (this.items[o.item] || {}) : {};
    const text = o.examine ?? def.examine;
    if (!text && !o.then && o.type !== 'item') return;
    const shape = this.examineShape(o);
    const ex = {
      id: o.id || `${o.type}@${(o.pos || []).join(',')}`,
      name: o.name || def.name || o.type,
      lines: typeof text === 'string' ? [{ who: 'you', text }] : (text || []).map((t) => (typeof t === 'string' ? { who: 'you', text: t } : t)),
      center: new THREE.Vector3().fromArray(shape.center), radius: shape.radius,
      range: o.examineRange ?? 3.2, ride: !!(o.scroll || o.rideScroll),
      pickup: o.type === 'item' && o.pickup !== false ? o.item : (o.pickup || null),
      then: o.then || null, meshes, hidden: !!o.hidden, if: o.if || null, verb: o.verb || null,
      track: o.examineTrack || null, trackRange: o.examineTrackRange || null,
    };
    this.examinables.push(ex);
    if (o.id) this.objectsById.set(o.id, { meshes, examinable: ex });
  }

  // A small object built from shapes: something that can be picked up.
  addItem(o) {
    const def = this.items[o.item] || {};
    const g = buildShapes(o.model || def.model || o.item, (tex, color, opts) => this.decoMat(tex, color, o.pos, opts));
    g.position.fromArray(o.pos);
    g.rotation.y = THREE.MathUtils.degToRad(o.yaw ?? 0);
    if (o.scale) g.scale.setScalar(o.scale);
    this.group.add(g);
  }

  setObjectVisible(id, on) {
    const ob = this.objectsById.get(id);
    if (!ob) return false;
    for (const m of ob.meshes) m.visible = on;
    if (ob.examinable) ob.examinable.hidden = !on;
    return true;
  }

  // Expand prefab instances into plain objects with offsets and $var substitution.
  expand(objects, prefabs = {}) {
    const out = [];
    const subst = (v, vars) => {
      if (typeof v === 'string' && v.startsWith('$')) { const k = v.slice(1); return k in vars ? vars[k] : v; }
      if (Array.isArray(v)) return v.map((x) => subst(x, vars));
      if (v && typeof v === 'object') { const r = {}; for (const [k, x] of Object.entries(v)) r[k] = subst(x, vars); return r; }
      return v;
    };
    for (const o of objects) {
      if (o.type !== 'prefab') { out.push(o); continue; }
      const def = prefabs[o.name];
      if (!def) { console.warn('unknown prefab', o.name); continue; }
      const vars = { ...(def.vars || {}), ...(o.vars || {}) };
      const [ox, oy, oz] = o.pos || [0, 0, 0];
      for (const raw of this.expand(def.objects, prefabs)) {
        const c = subst(raw, vars);
        if (c.hidden === '$hidden') c.hidden = false;
        if (c.pos) c.pos = [c.pos[0] + ox, c.pos[1] + oy, c.pos[2] + oz];
        if (c.from) c.from = [c.from[0] + ox, c.from[1] + oy, c.from[2] + oz];
        if (c.to) c.to = [c.to[0] + ox, c.to[1] + oy, c.to[2] + oz];
        if (c.id && o.idPrefix) c.id = o.idPrefix + c.id;
        if (c.skip) continue;
        out.push(c);
      }
    }
    return out;
  }

  addEntity(o) {
    const ctx = this.ctx;
    let rig;
    if (o.model === 'arm') rig = buildArm(ctx);
    else if (o.model === 'amalgam') rig = buildAmalgam(ctx);
    else if (o.model === 'dog') rig = buildDog(ctx, o.look || {});
    else rig = buildHumanoid(ctx, o.look || {});
    const group = new THREE.Group();
    group.add(rig.root);
    group.position.fromArray(o.pos);
    group.rotation.y = THREE.MathUtils.degToRad(o.yaw ?? 0);
    if (o.scale) group.scale.setScalar(o.scale);
    group.visible = !o.hidden;
    this.group.add(group);
    const entity = {
      id: o.id, kind: o.type, model: o.model || 'humanoid', group, rig,
      name: o.name || o.id,
      talkable: !!(o.dialog && o.dialog.length), dialog: o.dialog || [], talkRadius: o.talkRadius ?? 3.2,
      examineLines: o.examine ? [].concat(o.examine).map((t) => (typeof t === 'string' ? { who: 'you', text: t } : t)) : null,
      // What touching them does, beyond the lines (a creature that ends the dream).
      examineThen: o.then || null,
      voice: voiceFor(o.id, { ...(o.look || {}), scale: o.scale }, o.voice || null),
      behavior: o.behavior ? { ...o.behavior } : { name: 'idle' },
      gesture: o.gesture || null,
      pose: {},
      hitRadius: rig.hitRadius, hitHeight: rig.hitHeight,
    };
    if (o.name) this.names[o.id] = o.name;
    this.entities.set(o.id, entity);
    return entity;
  }

  build(scene) {
    this.items = scene.items || {};
    for (const o of this.expand(scene.objects || [], scene.prefabs || {})) {
      const before = this.group.children.length;
      this.building = o;
      switch (o.type) {
        case 'box': this.addBox(o); break;
        case 'plane': this.addPlane(o); break;
        case 'water': this.addWater(o); break;
        case 'stairs': this.addStairs(o); break;
        case 'light': this.addLight(o); break;
        case 'collider': this.addCollider(o); break;
        case 'window': this.addWindow(o); break;
        case 'fountain': this.addFountain(o); break;
        case 'lamp': this.addLamp(o); break;
        case 'railing': this.addRailing(o); break;
        case 'mist': this.addMist(o); break;
        case 'table': this.addTable(o); break;
        case 'chair': this.addChair(o); break;
        case 'booth': this.addBooth(o); break;
        case 'lantern': this.addLantern(o); break;
        case 'ceilingLight': this.addCeilingLight(o); break;
        case 'tableLamp': this.addTableLamp(o); break;
        case 'floorLamp': this.addFloorLamp(o); break;
        case 'mirror': this.addMirror(o); break;
        case 'spotlight': this.addSpotlight(o); break;
        case 'guide': this.addGuide(o); break;
        case 'cylinder': this.addCylinder(o); break;
        case 'roundTable': this.addRoundTable(o); break;
        case 'food': this.addFood(o); break;
        case 'bunting': this.addBunting(o); break;
        case 'stringLights': this.addStringLights(o); break;
        case 'drape': this.addDrape(o); break;
        case 'plant': this.addPlant(o); break;
        case 'oven': this.addOven(o); break;
        case 'panel': this.addPanel(o); break;
        case 'screen': this.addScreen(o); break;
        case 'arch': this.addArch(o); break;
        case 'ceilingFan': this.addCeilingFan(o); break;
        case 'jukebox': this.addJukebox(o); break;
        case 'aquarium': this.addAquarium(o); break;
        case 'luckyCat': this.addLuckyCat(o); break;
        case 'sign': this.addSign(o); break;
        case 'character':
        case 'creature': this.addEntity(o); break;
        case 'item': this.addItem(o); break;
        case 'spot': break;
        case 'chandelier': this.addChandelier(o); break;
        case 'piano': this.addPiano(o); break;
        case 'timeMachine': this.addTimeMachine(o); break;
        case 'tree': this.addTree(o); break;
        default: console.warn('unknown object type', o.type);
      }
      const made = this.group.children.slice(before);
      if (o.type !== 'character' && o.type !== 'creature') {
        if (o.examine || o.then || o.type === 'item' || o.type === 'spot') this.registerExaminable(o, made);
        else if (o.id) this.objectsById.set(o.id, { meshes: made, examinable: null });
        if (o.id && this.objectsById.has(o.id)) this.objectsById.get(o.id).pos = (o.pos || [0, 0, 0]).slice();
        if (o.hidden) for (const m of made) m.visible = false;
      }
      // Scenery seen from a moving vehicle streams past and wraps round.
      // scroll: true streams at the vehicle's speed; a number is a multiple of it (oncoming traffic > 1).
      if (o.scroll) for (const m of made) this.rolling.push({ obj: m, base: m.position.clone(), rate: o.scroll === true ? 1 : o.scroll });
      this.building = null;
      if (o.rideScroll) for (const m of made) if (m.material && m.material.uniforms) {
        m.material.uniforms.uUvOffset.value.set(0, 0);
        this.rideMats.push({ material: m.material, scale: o.texScale ?? 1, axis: o.rideScroll === 'x' ? 0 : 1, size: o.size || [1, 1] });
      }
    }
    // Merge everything that never moves or changes into a few large meshes.
    const keep = new Set();
    const keepTree = (o) => o.traverse((c) => keep.add(c));
    for (const e of this.entities.values()) keepTree(e.group);
    for (const list of [this.swayers, this.spinners, this.wavers, this.movers, this.keepers]) for (const x of list || []) keepTree(x.obj);
    for (const ob of this.objectsById.values()) for (const m of ob.meshes) keepTree(m);
    for (const ex of this.examinables) if (ex.pickup || ex.hidden || ex.if) for (const m of ex.meshes) keepTree(m);
    for (const r of this.machineRoots || []) keepTree(r);
    for (const r of this.rolling) keepTree(r.obj);
    for (const r of this.rideMats) this.group.traverse((c) => { if (c.material === r.material) keep.add(c); });
    for (const s of this.scrollers) this.group.traverse((c) => { if (c.material === s.material) keep.add(c); });
    for (const l of this.lights) for (const em of l.emissive) this.group.traverse((c) => { if (c.material === em.material) keep.add(c); });
    const skyFrom = this.group.children.length;
    this.addSky(scene.sky || {});
    if (scene.particles !== false) {
      this.particles = new AmbientParticles(this.ctx.env, scene.particles || {});
      this.group.add(this.particles.group);
    }
    // Static objects get their nearest lights once.
    for (const s of this.staticMaterials) {
      const mats = Array.isArray(s.material) ? s.material : [s.material];
      for (const m of mats) if (m.userData.ps1) assignLights(this.ctx.env, m, s.position);
    }
    // Lights are known now, so meshes lit alike can be merged. The sky and
    // particles are added after this, so they stay separate.
    for (const c of this.group.children.slice(skyFrom)) { keepTree(c); c.traverse((x) => { x.userData.noOcclude = true; }); }
    if (this.pbr) this.group.traverse((c) => keep.add(c));
    this.mergeStats = mergeStatic(this.group, (m) => keep.has(m), this.ctx.env.pointLights);
    const where = new Map();
    for (const s of this.staticMaterials) for (const m of [].concat(s.material)) if (!where.has(m)) where.set(m, s.position);
    for (const { material, from } of this.mergeStats.materials) this.staticMaterials.push({ material, position: where.get(from) || new THREE.Vector3() });
    // Drop refresh entries for materials no mesh uses any more.
    const used = new Set();
    this.group.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => used.add(m)); });
    this.staticMaterials = this.staticMaterials.filter((s) => [].concat(s.material).some((m) => used.has(m)));
    for (const e of this.entities.values()) assignLightsToObject(this.ctx.env, e.group, e.group.position);
    return this;
  }

  update(dt, time, camera, indoor = false) {
    updateLights(this.lights, time, camera, this.ctx.audio);
    this.updateProps(dt, time);
    const cp = camera.position;
    for (const s of this.staticMaterials) if (s.position.distanceToSquared(cp) < 6400) refreshLightColors(s.material);
    for (const s of this.scrollers) {
      s.material.uniforms.uUvOffset.value.set(s.flow[0] * time, s.flow[1] * time);
    }
    for (const m of this.mist) {
      const p = m.mesh.position;
      p.x = m.base.x + Math.sin(time * m.rate + m.phase) * m.amp + time * m.drift;
      p.y = m.base.y + Math.sin(time * m.rate * 0.7 + m.phase * 2) * 0.3;
      p.z = m.base.z + Math.cos(time * m.rate * 0.8 + m.phase) * m.amp * 0.6;
    }
    if (this.particles) { this.particles.setIndoor(indoor); this.particles.update(dt, time, camera); }
    // The sky dome, moon and stars ride with the camera so they never get close.
    if (this.sky) this.sky.position.copy(camera.position);
  }
}

Object.assign(SceneBuilder.prototype, PropMethods);

// Ambient particles that belong to every dream: dust motes hanging in the air,
// scraps and petals drifting past, the odd glint. They follow the camera and
// wrap around a box so the air is never empty.
import * as THREE from '../../vendor/three.module.js?v=d26125f';
import { mulberry } from './textures.js?v=d26125f';

const dustVert = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aSpeed;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
varying float vAlpha;
void main() {
  vec4 vp = modelViewMatrix * vec4(position, 1.0);
  float dist = length(vp.xyz);
  float fog = smoothstep(uFogNear, uFogFar, dist);
  float twinkle = 0.55 + 0.45 * sin(uTime * aSpeed + aPhase);
  vAlpha = uAlpha * twinkle * (1.0 - fog) * smoothstep(0.4, 1.5, dist);
  gl_Position = projectionMatrix * vp;
  gl_PointSize = clamp(aSize * uResolution.y / max(dist, 0.5) * 0.006, 1.0, 3.0);
}
`;
const dustFrag = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() { gl_FragColor = vec4(uColor, vAlpha); }
`;

const floaterVert = /* glsl */ `
attribute vec3 iPos;
attribute float iSize;
attribute float iRot;
attribute float iTex;
attribute float iAlpha;
uniform vec2 uResolution;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTexCount;
varying vec2 vUv;
varying float vFog;
varying float vAlpha;
void main() {
  float c = cos(iRot), s = sin(iRot);
  vec2 corner = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSize;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = iPos + right * corner.x + up * corner.y;
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  float dist = length(vp.xyz);
  vFog = smoothstep(uFogNear, uFogFar, dist);
  vAlpha = iAlpha * smoothstep(0.3, 1.0, dist);
  vUv = vec2((uv.x + iTex) / uTexCount, uv.y);
  vec4 cp = projectionMatrix * vp;
  vec2 grid = uResolution * 0.5;
  cp.xy = floor(cp.xy / cp.w * grid + 0.5) / grid * cp.w;
  gl_Position = cp;
}
`;
const floaterFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uFogColor;
uniform vec3 uLight;
varying vec2 vUv;
varying float vFog;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  vec3 c = mix(t.rgb * uLight, uFogColor, vFog);
  gl_FragColor = vec4(c, vAlpha);
}
`;

// 4-frame atlas, 16x16 each: scrap of paper, petal, feather, ash fleck.
export function makeFloaterAtlas() {
  const n = 4, s = 16;
  const canvas = document.createElement('canvas');
  canvas.width = s * n; canvas.height = s;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(s * n, s);
  const d = img.data;
  const rand = mulberry(21);
  const put = (x, y, r, g, b, a = 255) => { const i = (y * s * n + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; };
  // scrap: pale rectangle with torn corners and a faint line of writing
  for (let y = 4; y < 12; y++) for (let x = 2; x < 13; x++) {
    if ((y === 4 || y === 11) && rand() < 0.3) continue;
    if ((x === 2 || x === 12) && rand() < 0.3) continue;
    const v = 196 + Math.round((rand() - 0.5) * 24);
    put(x, y, v, v - 4, v - 14);
  }
  for (let x = 4; x < 11; x += 2) { put(x, 7, 120, 110, 100); put(x + 1, 9, 120, 110, 100); }
  // petal: elongated dark pink-brown ellipse
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x - 7.5) / 3.2, dy = (y - 7.5) / 6.5;
    if (dx * dx + dy * dy <= 1) { const k = 1 - Math.abs(dx) * 0.4; put(s + x, y, 120 * k, 52 * k, 60 * k); }
  }
  put(s + 7, 2, 70, 30, 36); put(s + 8, 13, 70, 30, 36);
  // feather: thin pale spine with barbs
  for (let y = 1; y < 15; y++) {
    put(2 * s + 7, y, 200, 198, 190);
    const w = Math.max(0, Math.round(Math.sin((y / 14) * Math.PI) * 3));
    for (let i = 1; i <= w; i++) { if (rand() < 0.7) put(2 * s + 7 - i, y, 180, 176, 168); if (rand() < 0.7) put(2 * s + 7 + i, y, 180, 176, 168); }
  }
  // ash fleck: small dark irregular blob
  for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) if (rand() < 0.65) put(3 * s + x, y, 28, 26, 26);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false; tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export class AmbientParticles {
  constructor(env, cfg = {}) {
    this.env = env;
    this.group = new THREE.Group();
    this.rand = mulberry(cfg.seed ?? 4);
    const dust = { count: 420, box: [16, 7, 16], color: '#c4cfcc', alpha: 0.5, ...(cfg.dust || {}) };
    const floaters = { count: 40, box: [34, 11, 34], alpha: 0.95, speed: 0.6, ...(cfg.floaters || {}) };
    this.dustCfg = dust; this.floaterCfg = floaters;
    if (dust.count > 0) this.buildDust(dust);
    if (floaters.count > 0) this.buildFloaters(floaters);
    this.origin = new THREE.Vector3();
  }

  buildDust(cfg) {
    const n = cfg.count, r = this.rand;
    const [bx, by, bz] = cfg.box;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n), speed = new Float32Array(n);
    this.dustVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * bx; pos[i * 3 + 1] = (r() - 0.5) * by; pos[i * 3 + 2] = (r() - 0.5) * bz;
      const glint = r() < 0.08;
      size[i] = glint ? 2.2 : 0.8 + r() * 1.2;
      phase[i] = r() * Math.PI * 2;
      speed[i] = glint ? 6 + r() * 6 : 0.3 + r() * 1.2;
      this.dustVel[i * 3] = (r() - 0.5) * 0.12; this.dustVel[i * 3 + 1] = -0.03 - r() * 0.05; this.dustVel[i * 3 + 2] = (r() - 0.5) * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.env.uTime, uResolution: this.env.uResolution, uFogColor: this.env.uFogColor,
        uFogNear: this.env.uFogNear, uFogFar: this.env.uFogFar,
        uColor: { value: new THREE.Color(cfg.color) }, uAlpha: { value: cfg.alpha },
      },
      vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 6;
    this.group.add(this.dust);
  }

  buildFloaters(cfg) {
    const n = cfg.count, r = this.rand;
    const [bx, by, bz] = cfg.box;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const iPos = new Float32Array(n * 3), iSize = new Float32Array(n), iRot = new Float32Array(n), iTex = new Float32Array(n), iAlpha = new Float32Array(n);
    this.fl = [];
    for (let i = 0; i < n; i++) {
      const tex = Math.floor(r() * 4);
      iPos[i * 3] = (r() - 0.5) * bx; iPos[i * 3 + 1] = (r() - 0.5) * by; iPos[i * 3 + 2] = (r() - 0.5) * bz;
      iSize[i] = tex === 3 ? 0.08 + r() * 0.06 : 0.12 + r() * 0.16;
      iRot[i] = r() * Math.PI * 2; iTex[i] = tex; iAlpha[i] = cfg.alpha;
      this.fl.push({
        vx: (r() - 0.5) * 0.5 * cfg.speed, vy: -(0.05 + r() * 0.12) * (tex === 2 ? 0.5 : 1), vz: (r() - 0.5) * 0.5 * cfg.speed,
        spin: (r() - 0.5) * 2.5, bob: 0.4 + r() * 0.8, phase: r() * 6.28, amp: 0.2 + r() * 0.5,
      });
    }
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(iSize, 1));
    geo.setAttribute('iRot', new THREE.InstancedBufferAttribute(iRot, 1));
    geo.setAttribute('iTex', new THREE.InstancedBufferAttribute(iTex, 1));
    geo.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(iAlpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: this.env.uResolution, uFogColor: this.env.uFogColor, uFogNear: this.env.uFogNear, uFogFar: this.env.uFogFar,
        uMap: { value: makeFloaterAtlas() }, uTexCount: { value: 4 }, uLight: { value: new THREE.Color(cfg.light || '#9aa8aa') },
      },
      vertexShader: floaterVert, fragmentShader: floaterFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.floaters = new THREE.Mesh(geo, mat);
    this.floaters.frustumCulled = false;
    this.floaters.renderOrder = 7;
    this.group.add(this.floaters);
  }

  // Keep every particle inside a box centred on the camera by wrapping.
  wrap(arr, i, box, c) {
    for (let k = 0; k < 3; k++) {
      const half = box[k] / 2, v = arr[i * 3 + k] - c[k];
      if (v > half) arr[i * 3 + k] -= box[k];
      else if (v < -half) arr[i * 3 + k] += box[k];
    }
  }

  // Paper, petals, feathers and ash only drift outdoors; the fine dust stays.
  setIndoor(indoor) {
    if (this.floaters) this.floaters.visible = !indoor;
  }

  update(dt, time, camera) {
    const c = [camera.position.x, camera.position.y, camera.position.z];
    if (this.dust) {
      const p = this.dust.geometry.attributes.position, a = p.array, v = this.dustVel;
      const n = p.count;
      for (let i = 0; i < n; i++) {
        a[i * 3] += (v[i * 3] + Math.sin(time * 0.7 + i) * 0.04) * dt;
        a[i * 3 + 1] += (v[i * 3 + 1] + Math.sin(time * 0.5 + i * 1.3) * 0.03) * dt;
        a[i * 3 + 2] += (v[i * 3 + 2] + Math.cos(time * 0.6 + i * 0.7) * 0.04) * dt;
        this.wrap(a, i, this.dustCfg.box, c);
      }
      p.needsUpdate = true;
    }
    if (this.floaters) {
      const g = this.floaters.geometry;
      const p = g.attributes.iPos, rot = g.attributes.iRot;
      const a = p.array;
      for (let i = 0; i < p.count; i++) {
        const f = this.fl[i];
        a[i * 3] += (f.vx + Math.sin(time * f.bob + f.phase) * f.amp) * dt;
        a[i * 3 + 1] += (f.vy + Math.cos(time * f.bob * 0.8 + f.phase) * f.amp * 0.5) * dt;
        a[i * 3 + 2] += (f.vz + Math.cos(time * f.bob * 1.1 + f.phase) * f.amp) * dt;
        rot.array[i] += f.spin * dt;
        this.wrap(a, i, this.floaterCfg.box, c);
      }
      p.needsUpdate = true; rot.needsUpdate = true;
    }
  }
}

// Point lights that flicker, and the halos and lit fixtures tied to them.
// Each light has a profile: a constant wobble plus occasional stutters where
// it drops out and buzzes, the way old sodium lamps and tubes do.
import * as THREE from '../../vendor/three.module.js?v=d8a02e0';

const PROFILES = {
  soft:        { wobble: 0.07, speed: 0.8, every: [14, 30], len: [0.15, 0.4], low: 0.55 },
  sodium:      { wobble: 0.08, speed: 1.1, every: [6, 18], len: [0.25, 0.9], low: 0.12 },
  fluorescent: { wobble: 0.05, speed: 9.0, every: [4, 12], len: [0.15, 0.6], low: 0.08 },
  candle:      { wobble: 0.2, speed: 2.6, every: [8, 20], len: [0.2, 0.5], low: 0.5 },
  neon:        { wobble: 0.06, speed: 14, every: [5, 15], len: [0.1, 0.5], low: 0.05 },
  neonBad:     { wobble: 0.15, speed: 18, every: [1, 4], len: [0.2, 1.0], low: 0.05 },
  dying:       { wobble: 0.1, speed: 11, every: [1.5, 5], len: [0.3, 1.4], low: 0.04 },
};

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// `off` builds the light dark: its fixture and halo stay unlit until something
// sets `target` back to `base` (the intensity it was given).
export function createLight({ pos, color, intensity = 1, range = 8, profile = 'soft', seed = 1, off = false }) {
  const p = PROFILES[profile] || PROFILES.soft;
  const start = off ? 0 : intensity;
  return {
    position: new THREE.Vector3().fromArray(pos),
    color: new THREE.Color(color),
    intensity: start, target: start, base: intensity, range, current: start, k: 1,
    profile: PROFILES[profile] ? profile : 'soft', seed,
    nextStutter: p.every[0] + hash(seed) * (p.every[1] - p.every[0]) * 1.5,
    stutterEnd: -1,
    emissive: [], halos: [],
  };
}

export function updateLights(lights, time, camera, audio) {
  for (const l of lights) {
    if (l.target !== undefined && l.target !== l.intensity) l.intensity += (l.target - l.intensity) * 0.05;
    const p = PROFILES[l.profile];
    const s = l.seed;
    const w = 0.5 * Math.sin(time * p.speed + s) + 0.3 * Math.sin(time * p.speed * 2.31 + s * 1.7) + 0.2 * Math.sin(time * p.speed * 5.13 + s * 3.1);
    let k = 1 + w * p.wobble;
    if (time >= l.nextStutter) {
      const len = p.len[0] + hash(s + time) * (p.len[1] - p.len[0]);
      l.stutterEnd = time + len;
      l.nextStutter = l.stutterEnd + p.every[0] + hash(s * 3.7 + time) * (p.every[1] - p.every[0]);
      if (camera && audio) {
        const d = camera.position.distanceTo(l.position);
        if (d < 10) audio.buzz?.(1 - d / 10);
      }
    }
    if (time < l.stutterEnd) {
      const on = hash(Math.floor(time * 22) + s * 10) > 0.45;
      k *= on ? 0.85 : p.low;
    }
    l.k = k;
    l.current = l.intensity * k;
    // Fixtures and halos follow the light when it is dimmed or switched off.
    const lit = l.base > 0 ? Math.min(1.2, l.intensity / l.base) : 1;
    for (const e of l.emissive) e.material.uniforms.uColor.value.copy(e.base).multiplyScalar(Math.max(0.15, Math.min(1.15, k)) * lit);
    for (const h of l.halos) h.uniforms.uIntensity.value = h.base * k * lit;
  }
}

const haloVert = /* glsl */ `
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vFog;
void main() {
  vUv = uv;
  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float sx = length(vec3(modelMatrix[0]));
  vec3 wp = c + right * position.x * sx + up * position.y * sx;
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  vFog = smoothstep(uFogNear, uFogFar * 1.3, length(vp.xyz));
  gl_Position = projectionMatrix * vp;
}
`;
const haloFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
varying float vFog;
void main() {
  float a = texture2D(uMap, vUv).a * uIntensity * (1.0 - vFog * 0.6);
  gl_FragColor = vec4(uColor, a);
}
`;

// A pool of light on the floor under a lamp: the same glow, lying flat.
const poolVert = /* glsl */ `
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vFog;
void main() {
  vUv = uv;
  vec4 vp = modelViewMatrix * vec4(position, 1.0);
  vFog = smoothstep(uFogNear, uFogFar * 1.3, length(vp.xyz));
  gl_Position = projectionMatrix * vp;
}
`;
export function makePool(env, map, color, size, strength) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uColor: { value: new THREE.Color(color) }, uIntensity: { value: strength }, uFogNear: env.uFogNear, uFogFar: env.uFogFar },
    vertexShader: poolVert, fragmentShader: haloFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(size, 1, size);
  mesh.renderOrder = 7;
  mesh.userData.noOcclude = true;
  return mesh;
}

// A shaft of light standing on the floor: dust lit from above. Faint, soft at
// its edges, brighter toward the top where the light comes in.
const shaftVert = /* glsl */ `
uniform float uFogNear;
uniform float uFogFar;
varying float vEdge;
varying float vUp;
varying float vFog;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * normal);
  vec3 toCam = normalize(cameraPosition - wp.xyz);
  vEdge = abs(dot(wn, toCam));
  vUp = uv.y;
  vec4 vp = viewMatrix * wp;
  vFog = smoothstep(uFogNear, uFogFar * 1.3, length(vp.xyz));
  gl_Position = projectionMatrix * vp;
}
`;
const shaftFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying float vEdge;
varying float vUp;
varying float vFog;
void main() {
  float a = uIntensity * pow(vEdge, 1.6) * (0.35 + 0.65 * vUp) * (1.0 - vFog * 0.7);
  gl_FragColor = vec4(uColor, a);
}
`;
export function makeShaft(env, color, radius, height, strength) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: strength }, uFogNear: env.uFogNear, uFogFar: env.uFogFar },
    vertexShader: shaftVert, fragmentShader: shaftFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const geo = new THREE.CylinderGeometry(radius * 0.55, radius, height, 10, 1, true);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 6;
  mesh.userData.noOcclude = true;
  return mesh;
}

export function makeHalo(env, map, color, size, strength) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uColor: { value: new THREE.Color(color) }, uIntensity: { value: strength }, uFogNear: env.uFogNear, uFogFar: env.uFogFar },
    vertexShader: haloVert, fragmentShader: haloFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.scale.set(size, size, 1);
  mesh.renderOrder = 8;
  return mesh;
}

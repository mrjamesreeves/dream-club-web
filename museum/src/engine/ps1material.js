// PS1-style material: vertex snapping, affine texture mapping, Gouraud lighting
// (ambient + one directional + up to 4 nearest point lights), per-vertex fog.
import * as THREE from '../../vendor/three.module.js?v=6b6dcd0';

export const MAX_POINT_LIGHTS = 4;

const vertexShader = /* glsl */ `
uniform vec2 uResolution;
uniform float uJitter;
uniform float uTexScale;
uniform float uWorldUV;
uniform vec2 uUvOffset;
uniform vec3 uAmbient;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uPointPos[${MAX_POINT_LIGHTS}];
uniform vec3 uPointColor[${MAX_POINT_LIGHTS}];
uniform float uPointRange[${MAX_POINT_LIGHTS}];
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogHeight;
uniform float uFogHeightRange;
uniform float uFogHeightStrength;
uniform float uFogEnabled;
uniform float uUnlit;
uniform float uBillboard;
uniform float uTime;
uniform vec3 uRim;
uniform float uRimK;

varying vec3 vUvW;
varying vec3 vLight;
varying float vFog;

void main() {
  vec4 wp;
  vec3 wn;
  if (uBillboard > 0.5) {
    vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float sx = length(vec3(modelMatrix[0]));
    float sy = length(vec3(modelMatrix[1]));
    wp = vec4(center + right * position.x * sx + up * position.y * sy, 1.0);
    wn = vec3(0.0, 1.0, 0.0);
  } else {
    wp = modelMatrix * vec4(position, 1.0);
    wn = normalize(mat3(modelMatrix) * normal);
  }

  vec3 light = uAmbient + uSkyColor * (wn.y * 0.5 + 0.5) + uSunColor * max(dot(wn, uSunDir), 0.0);
  for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
    vec3 d = uPointPos[i] - wp.xyz;
    float dist = max(length(d), 0.001);
    float att = clamp(1.0 - dist / max(uPointRange[i], 0.001), 0.0, 1.0);
    att *= att;
    light += uPointColor[i] * max(dot(wn, d / dist), 0.0) * att;
  }
  light = mix(light, vec3(1.0), uUnlit);
  #ifdef USE_COLOR
  light *= color;
  #endif
  // Rim light: a glow along the edges facing away from the camera, so a
  // person or thing stands off a dark background with no lamp to explain it.
  if (uRimK > 0.0) {
    vec3 toCam = normalize(cameraPosition - wp.xyz);
    float rim = pow(1.0 - max(dot(wn, toCam), 0.0), 2.2);
    light += uRim * rim * uRimK;
  }
  vLight = light;

  vec4 vp = viewMatrix * wp;
  float dist = length(vp.xyz);
  float f = smoothstep(uFogNear, uFogFar, dist);
  float h = clamp((uFogHeight - wp.y) / uFogHeightRange, 0.0, 1.0) * uFogHeightStrength * smoothstep(0.0, uFogFar * 0.4, dist);
  vFog = clamp(f + h, 0.0, 1.0) * uFogEnabled;

  vec4 cp = projectionMatrix * vp;
  if (uJitter > 0.0 && cp.w > 0.0) {
    vec2 grid = uResolution * 0.5 / uJitter;
    vec2 ndc = cp.xy / cp.w;
    ndc = floor(ndc * grid + 0.5) / grid;
    cp.xy = ndc * cp.w;
  }

  vec2 texUv;
  if (uWorldUV > 0.5) {
    vec3 an = abs(wn);
    vec3 p = wp.xyz / uTexScale;
    if (an.y >= an.x && an.y >= an.z) texUv = p.xz;
    else if (an.x >= an.z) texUv = p.zy;
    else texUv = p.xy;
  } else {
    texUv = uv * uTexScale;
  }
  texUv += uUvOffset;
  vUvW = vec3(texUv * cp.w, cp.w);
  gl_Position = cp;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform float uAlphaTest;
uniform float uOpacity;

varying vec3 vUvW;
varying vec3 vLight;
varying float vFog;

void main() {
  vec2 uv = vUvW.xy / vUvW.z;
  vec4 t = texture2D(uMap, uv);
  if (t.a < uAlphaTest) discard;
  vec3 c = t.rgb * uColor * vLight;
  c = mix(c, uFogColor, vFog);
  gl_FragColor = vec4(c, t.a * uOpacity);
}
`;

// Uniforms shared by every PS1 material in the scene. The same {value} objects
// are referenced by each material, so updating them here updates everything.
export function createEnvironment() {
  const env = {
    uResolution: { value: new THREE.Vector2(320, 240) },
    uJitter: { value: 1.0 },
    uAmbient: { value: new THREE.Color('#1b2328') },
    uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.4).normalize() },
    uSunColor: { value: new THREE.Color('#7f98a0') },
    uSkyColor: { value: new THREE.Color('#2c3a40') },
    uFogColor: { value: new THREE.Color('#4f6268') },
    uFogNear: { value: 4 },
    uFogFar: { value: 60 },
    uFogHeight: { value: 1.5 },
    uFogHeightRange: { value: 6 },
    uFogHeightStrength: { value: 0.35 },
    uTime: { value: 0 },
  };
  env.pointLights = []; // { position: Vector3, color: Color, range }
  return env;
}

export function applyEnvironmentConfig(env, cfg = {}) {
  if (cfg.ambient) env.uAmbient.value.set(cfg.ambient);
  if (cfg.sunDir) env.uSunDir.value.fromArray(cfg.sunDir).normalize();
  if (cfg.sunColor) env.uSunColor.value.set(cfg.sunColor);
  if (cfg.skyColor) env.uSkyColor.value.set(cfg.skyColor);
  if (cfg.fogColor) env.uFogColor.value.set(cfg.fogColor);
  if (cfg.fogNear !== undefined) env.uFogNear.value = cfg.fogNear;
  if (cfg.fogFar !== undefined) env.uFogFar.value = cfg.fogFar;
  if (cfg.fogHeight !== undefined) env.uFogHeight.value = cfg.fogHeight;
  if (cfg.fogHeightRange !== undefined) env.uFogHeightRange.value = cfg.fogHeightRange;
  if (cfg.fogHeightStrength !== undefined) env.uFogHeightStrength.value = cfg.fogHeightStrength;
  if (cfg.jitter !== undefined) env.uJitter.value = cfg.jitter;
}

export function createPS1Material(env, opts = {}) {
  const uniforms = {
    uResolution: env.uResolution,
    uJitter: env.uJitter,
    uAmbient: env.uAmbient,
    uSunDir: env.uSunDir,
    uSunColor: env.uSunColor,
    uSkyColor: env.uSkyColor,
    uFogColor: env.uFogColor,
    uFogNear: env.uFogNear,
    uFogFar: env.uFogFar,
    uFogHeight: env.uFogHeight,
    uFogHeightRange: env.uFogHeightRange,
    uFogHeightStrength: env.uFogHeightStrength,
    uTime: env.uTime,
    uMap: { value: opts.map || null },
    uColor: { value: new THREE.Color(opts.color || '#ffffff') },
    uTexScale: { value: opts.texScale !== undefined ? opts.texScale : 1 },
    uWorldUV: { value: opts.worldUV ? 1 : 0 },
    uUvOffset: { value: new THREE.Vector2(0, 0) },
    uFogEnabled: { value: opts.fog === false ? 0 : 1 },
    uUnlit: { value: opts.unlit ? 1 : 0 },
    uRim: { value: new THREE.Color(opts.rim || '#ffd9a0') },
    uRimK: { value: opts.rimK || 0 },
    uBillboard: { value: opts.billboard ? 1 : 0 },
    uAlphaTest: { value: opts.alphaTest !== undefined ? opts.alphaTest : 0 },
    uOpacity: { value: opts.opacity !== undefined ? opts.opacity : 1 },
    uPointPos: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Vector3()) },
    uPointColor: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
    uPointRange: { value: new Array(MAX_POINT_LIGHTS).fill(0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    vertexColors: true,
    transparent: !!opts.transparent,
    depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : true,
    side: opts.side || THREE.FrontSide,
    blending: opts.blending || THREE.NormalBlending,
  });
  mat.userData.ps1 = true;
  return mat;
}

// Nearest point lights for a world position (up to MAX_POINT_LIGHTS).
const _tmp = new THREE.Vector3();
export function nearestLights(env, position) {
  return env.pointLights
    .map((l) => ({ l, d: _tmp.copy(l.position).sub(position).length() - l.range }))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_POINT_LIGHTS)
    .map((e) => e.l);
}

// Writes a material's light uniforms from its light refs, using each
// light's current (flickering) intensity.
export function refreshLightColors(material) {
  const refs = material.userData.lightRefs;
  if (!refs) return;
  const u = material.uniforms;
  for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
    const l = refs[i];
    if (l) {
      u.uPointPos.value[i].copy(l.position);
      u.uPointColor.value[i].copy(l.color).multiplyScalar(l.current ?? l.intensity);
      u.uPointRange.value[i] = l.range;
    } else {
      u.uPointColor.value[i].setRGB(0, 0, 0);
      u.uPointRange.value[i] = 0;
    }
  }
}

export function assignLights(env, material, position) {
  material.userData.lightRefs = nearestLights(env, position);
  refreshLightColors(material);
}

export function assignLightsToObject(env, object, position) {
  const p = position || object.getWorldPosition(new THREE.Vector3());
  const refs = nearestLights(env, p);
  object.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m.userData.ps1) { m.userData.lightRefs = refs; refreshLightColors(m); }
  });
}

// Fills (or overwrites) a geometry's vertex color attribute with a flat shade.
export function setVertexShade(geometry, shade) {
  const n = geometry.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const [r, g, b] = Array.isArray(shade) ? shade : [shade, shade, shade];
  for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geometry;
}

// Rim light on everything under an object (a character's rig, an item's shapes).
export function setRim(object, k, color) {
  object.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m.uniforms || !m.uniforms.uRimK) continue;
      m.uniforms.uRimK.value = k;
      if (color) m.uniforms.uRim.value.set(color);
    }
  });
}

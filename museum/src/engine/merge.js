// Combines many small static meshes that share a material into one mesh, so
// a furnished room is a few dozen draw calls instead of a few thousand.
import * as THREE from '../../vendor/three.module.js?v=d8a02e0';

const ATTRS = ['position', 'normal', 'uv', 'color'];

// Vertices are baked relative to `root`, so a merged mesh added back under
// root keeps its place even when root itself is moved or rotated.
function mergeInto(meshes, tint, root) {
  let vcount = 0, icount = 0;
  for (const m of meshes) {
    const g = m.geometry;
    vcount += g.attributes.position.count;
    icount += g.index ? g.index.count : g.attributes.position.count;
  }
  const out = {};
  for (const a of ATTRS) out[a] = new Float32Array(vcount * (a === 'uv' ? 2 : 3));
  const index = vcount > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), rel = new THREE.Matrix4();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  let vo = 0, io = 0;
  for (const m of meshes) {
    const g = m.geometry, n = g.attributes.position.count;
    const c = tint ? m.material.uniforms.uColor.value : null;
    rel.multiplyMatrices(inv, m.matrixWorld);
    nm.getNormalMatrix(rel);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(rel);
      out.position.set([v.x, v.y, v.z], (vo + i) * 3);
      if (g.attributes.normal) { v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize(); out.normal.set([v.x, v.y, v.z], (vo + i) * 3); }
      if (g.attributes.uv) out.uv.set([g.attributes.uv.getX(i), g.attributes.uv.getY(i)], (vo + i) * 2);
      let r = 1, gr = 1, b = 1;
      if (g.attributes.color) { r = g.attributes.color.getX(i); gr = g.attributes.color.getY(i); b = g.attributes.color.getZ(i); }
      if (c) { r *= c.r; gr *= c.g; b *= c.b; }
      out.color.set([r, gr, b], (vo + i) * 3);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < n; i++) index[io++] = i + vo;
    vo += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(out.uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(out.color, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  return geo;
}

// Uniforms each merged material needs its own copy of; the rest (fog, sun,
// time, resolution) stay shared with the scene so they keep updating.
const OWN = ['uMap', 'uColor', 'uTexScale', 'uWorldUV', 'uUvOffset', 'uFogEnabled', 'uUnlit', 'uBillboard', 'uAlphaTest', 'uOpacity'];

function cloneForMerge(mat) {
  const u = {};
  for (const [k, v] of Object.entries(mat.uniforms)) u[k] = v;
  for (const k of OWN) {
    const val = mat.uniforms[k].value;
    u[k] = { value: val && val.clone && !val.isTexture ? val.clone() : val };
  }
  u.uColor.value.setRGB(1, 1, 1);
  u.uPointPos = { value: mat.uniforms.uPointPos.value.map((x) => x.clone()) };
  u.uPointColor = { value: mat.uniforms.uPointColor.value.map((x) => x.clone()) };
  u.uPointRange = { value: mat.uniforms.uPointRange.value.slice() };
  const m = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: mat.vertexShader, fragmentShader: mat.fragmentShader,
    vertexColors: true, transparent: false, depthWrite: mat.depthWrite, side: mat.side, blending: mat.blending,
  });
  m.userData.ps1 = true;
  m.userData.lightRefs = mat.userData.lightRefs;
  return m;
}

// Materials that differ only in tint can share a draw: the tint is baked into
// vertex colours, which the shader multiplies in the same way.
function signature(m, lightIds) {
  const u = m.uniforms;
  if (u.uBillboard.value || u.uUvOffset.value.x || u.uUvOffset.value.y) return null;
  const refs = u.uUnlit.value ? 'unlit' : m.userData.lightRefs ? m.userData.lightRefs.map((l) => lightIds.get(l)).sort().join(',') : '-';
  return [u.uMap.value ? u.uMap.value.uuid : '0', u.uTexScale.value, u.uWorldUV.value, u.uFogEnabled.value, u.uUnlit.value,
    u.uAlphaTest.value, u.uOpacity.value, m.side, m.depthWrite, m.blending, refs].join('|');
}

// root: the scene group. keep(mesh) -> true for meshes that must stay
// separate. lights: the scene's point lights, so meshes lit by the same set
// can be grouped. Returns the new materials, which need light refreshes.
export function mergeStatic(root, keep, lights = []) {
  root.updateMatrixWorld(true);
  const lightIds = new Map(lights.map((l, i) => [l, i]));
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || keep(o)) return;
    const m = o.material;
    if (!m || Array.isArray(m) || !m.userData.ps1 || m.transparent) return;
    const key = signature(m, lightIds);
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  let merged = 0, removed = 0;
  const outs = [], materials = [];
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const mats = new Set(meshes.map((m) => m.material));
    let mat = meshes[0].material;
    if (mats.size > 1) { const from = mat; mat = cloneForMerge(from); materials.push({ material: mat, from }); }
    // Split very large buckets so a single draw stays a sensible size.
    for (let s = 0; s < meshes.length; s += 400) {
      const part = meshes.slice(s, s + 400);
      const mesh = new THREE.Mesh(mergeInto(part, mats.size > 1, root), mat);
      mesh.userData.merged = true;
      outs.push(mesh);
      for (const p of part) { p.parent.remove(p); p.userData.mergedAway = true; removed++; }
      merged++;
    }
  }
  for (const m of outs) root.add(m);
  return { merged, removed, materials };
}

// Frees everything a scene owns on the GPU, leaving shared textures alone.
export function disposeTree(root, sharedTextures, extraGeometries = []) {
  const seenG = new Set(), seenM = new Set();
  const disposeMat = (m) => {
    if (!m || seenM.has(m)) return;
    seenM.add(m);
    const map = m.uniforms?.uMap?.value;
    if (map && !sharedTextures.has(map)) map.dispose();
    m.dispose();
  };
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared && !seenG.has(o.geometry)) { seenG.add(o.geometry); o.geometry.dispose(); }
    if (o.material) [].concat(o.material).forEach(disposeMat);
  });
  for (const g of extraGeometries) if (!seenG.has(g) && !g.userData.shared) { seenG.add(g); g.dispose(); }
}

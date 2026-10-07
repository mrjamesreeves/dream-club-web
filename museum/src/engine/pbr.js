// Physically based rendering for a scene that asks for it (render.pbr):
// three.js standard materials, a sun with shadow maps, hemisphere and ambient
// light, scene fog, and a bloom + tone-mapping pass. Dreams that do not ask
// keep the PS1 path untouched.
import * as THREE from '../../vendor/three.module.js?v=970753f';
import { EffectComposer } from '../../vendor/postprocessing/EffectComposer.js?v=970753f';
import { RenderPass } from '../../vendor/postprocessing/RenderPass.js?v=970753f';
import { UnrealBloomPass } from '../../vendor/postprocessing/UnrealBloomPass.js?v=970753f';
import { OutputPass } from '../../vendor/postprocessing/OutputPass.js?v=970753f';

export class PBR {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.rig = new THREE.Group(); this.rig.name = 'pbr-rig';
    this.composer = null;
    this.on = false;
  }

  ensure() {
    if (this.composer) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(size.clone(), 0.2, 0.5, 0.95);
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
  }

  configure(def) {
    const r = def.render || {}, p = typeof r.pbr === 'object' ? r.pbr : {}, e = def.environment || {};
    this.ensure();
    this.on = true;
    const R = this.renderer;
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.toneMapping = THREE.ACESFilmicToneMapping;
    R.toneMappingExposure = p.exposure ?? 1;
    R.shadowMap.enabled = true;
    R.shadowMap.type = THREE.PCFShadowMap;
    const b = p.bloom || {};
    this.bloom.strength = b.strength ?? 0.2; this.bloom.radius = b.radius ?? 0.5; this.bloom.threshold = b.threshold ?? 0.95;
    this.clearRig();
    // The sun, from the environment's direction, casting shadows over the whole scene.
    const dir = new THREE.Vector3().fromArray(e.sunDir || [0.3, 0.6, 0.4]).normalize();
    const sun = new THREE.DirectionalLight(p.sunColor || '#ffffff', p.sun ?? 3);
    sun.position.copy(dir).multiplyScalar(90);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = p.shadows !== false;
    const ext = p.shadowExtent ?? 70;
    const c = sun.shadow.camera; c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 1; c.far = 240;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    const hemi = new THREE.HemisphereLight(p.skyColor || e.skyColor || '#ffffff', p.groundColor || '#444444', p.hemi ?? 0.8);
    const amb = new THREE.AmbientLight(p.ambientColor || '#ffffff', p.ambient ?? 0.15);
    this.rig.add(sun, sun.target, hemi, amb);
    this.scene.add(this.rig);
    this.scene.fog = p.fog === false ? null : new THREE.Fog(e.fogColor || '#888888', e.fogNear ?? 10, e.fogFar ?? 100);
  }

  clearRig() {
    while (this.rig.children.length) { const c = this.rig.children.pop(); if (c.dispose) c.dispose(); }
  }

  clear() {
    if (!this.on) return;
    this.on = false;
    this.clearRig();
    this.scene.remove(this.rig);
    this.scene.fog = null;
    const R = this.renderer;
    R.outputColorSpace = THREE.LinearSRGBColorSpace;
    R.toneMapping = THREE.NoToneMapping;
    R.toneMappingExposure = 1;
    R.shadowMap.enabled = false;
  }

  resize(w, h) {
    if (!this.composer) return;
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  render() {
    this.renderer.setRenderTarget(null);
    this.composer.render();
  }
}

// Texture coordinates from world position, the way the PS1 shader did it, so
// a tiled texture reads in metres on standard materials too.
export function bakeWorldUV(geo, pos, s) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  if (!uv || !n) return;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + pos[0], y = p.getY(i) + pos[1], z = p.getZ(i) + pos[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv.setXY(i, u / s, v / s);
  }
  uv.needsUpdate = true;
}

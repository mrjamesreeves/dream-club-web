// A planar mirror: the scene rendered again from below the plane into a
// texture, projected back onto it. After three.js's Reflector, trimmed to
// what a dark pool needs: a base colour the reflection is mixed into, fog,
// and a low-resolution target so the water reads soft rather than sharp.
// With `lit`, the plane is a standard lit surface instead (it takes light
// and shadows like a floor) with the reflection folded into its colour.
import * as THREE from '../../vendor/three.module.js?v=50be1f4';

export class Reflector extends THREE.Mesh {
  constructor(geometry, { color = '#000000', strength = 0.4, scale = 0.4, clipBias = 0.003, lit = false, roughness = 0.2 } = {}) {
    const shared = { tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, strength: { value: strength } };
    const material = lit ? new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }) : new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { baseColor: { value: new THREE.Color(color) } }]),
      vertexShader: `
        uniform mat4 textureMatrix; varying vec4 vUv;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vUv = textureMatrix * vec4(position, 1.0);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec3 baseColor; uniform float strength; varying vec4 vUv;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          vec3 refl = texture2DProj(tDiffuse, vUv).rgb;
          gl_FragColor = vec4(mix(baseColor, refl, strength), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      fog: true,
    });
    if (lit) {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, shared);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform mat4 textureMatrix; varying vec4 vReflUv;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvReflUv = textureMatrix * vec4(position, 1.0);');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D tDiffuse; uniform float strength; varying vec4 vReflUv;')
          .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, texture2DProj(tDiffuse, vReflUv).rgb, strength);');
      };
    } else Object.assign(material.uniforms, shared);
    super(geometry, material);
    this.uniforms = shared;
    this.isReflector = true;
    if (lit) this.receiveShadow = true;
    this.camera = new THREE.PerspectiveCamera();
    this.target = new THREE.WebGLRenderTarget(960, 540, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.scale_ = scale; this.clipBias = clipBias;
    shared.tDiffuse.value = this.target.texture;
    const plane = new THREE.Plane(), normal = new THREE.Vector3(), pos = new THREE.Vector3(), camPos = new THREE.Vector3();
    const rot = new THREE.Matrix4(), look = new THREE.Vector3(), view = new THREE.Vector3(), target = new THREE.Vector3();
    const clip = new THREE.Vector4(), q = new THREE.Vector4(), clipPlane = new THREE.Plane();
    this.onBeforeRender = (renderer, scene, camera) => {
      if (renderer.getRenderTarget() !== null && renderer.getRenderTarget().isXRRenderTarget) return;
      pos.setFromMatrixPosition(this.matrixWorld);
      camPos.setFromMatrixPosition(camera.matrixWorld);
      rot.extractRotation(this.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rot);
      view.subVectors(pos, camPos);
      if (view.dot(normal) > 0) return;
      view.reflect(normal).negate().add(pos);
      rot.extractRotation(camera.matrixWorld);
      look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
      target.subVectors(pos, look).reflect(normal).negate().add(pos);
      const vc = this.camera;
      vc.position.copy(view); vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal); vc.lookAt(target);
      vc.far = camera.far; vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix);
      const tm = this.uniforms.textureMatrix.value;
      tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      tm.multiply(vc.projectionMatrix); tm.multiply(vc.matrixWorldInverse); tm.multiply(this.matrixWorld);
      // Oblique near plane at the mirror, so nothing below it reflects.
      plane.setFromNormalAndCoplanarPoint(normal, pos); plane.applyMatrix4(vc.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const P = vc.projectionMatrix;
      q.x = (Math.sign(clip.x) + P.elements[8]) / P.elements[0];
      q.y = (Math.sign(clip.y) + P.elements[9]) / P.elements[5];
      q.z = -1; q.w = (1 + P.elements[10]) / P.elements[14];
      clip.multiplyScalar(2 / clip.dot(q));
      P.elements[2] = clip.x; P.elements[6] = clip.y; P.elements[10] = clip.z + 1 - this.clipBias; P.elements[14] = clip.w;
      // Size the target to the canvas, scaled down.
      const size = renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(this.scale_);
      const tw = Math.max(960, Math.floor(size.x)), th = Math.max(540, Math.floor(size.y));
      if (this.target.width !== tw || this.target.height !== th) this.target.setSize(tw, th);
      this.visible = false;
      const prevTarget = renderer.getRenderTarget(), prevXR = renderer.xr.enabled, prevShadow = renderer.shadowMap.autoUpdate;
      renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(this.target);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, vc);
      renderer.xr.enabled = prevXR; renderer.shadowMap.autoUpdate = prevShadow;
      renderer.setRenderTarget(prevTarget);
      this.visible = true;
    };
  }
}

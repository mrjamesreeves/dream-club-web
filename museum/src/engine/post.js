// Low-resolution render target + full-screen pass: 15-bit colour quantization
// with ordered dithering, a little grain, a vignette and a fade for scene ends.
import * as THREE from '../../vendor/three.module.js?v=970753f';

const vert = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uGrain;
uniform float uQuant;
uniform float uVignette;
in vec2 vUv;
out vec4 fragColor;

const int bayer[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 px = floor(vUv * uRes);
  vec3 c = texture(tDiffuse, (px + 0.5) / uRes).rgb;
  int bx = int(mod(px.x, 4.0));
  int by = int(mod(px.y, 4.0));
  float d = (float(bayer[by * 4 + bx]) / 16.0 - 0.5) / 31.0;
  c += (hash(px + fract(uTime * 7.1)) - 0.5) * uGrain;
  if (uQuant > 0.5) c = floor((c + d) * 31.0 + 0.5) / 31.0;
  float vig = 1.0 - smoothstep(0.55, 1.25, length((vUv - 0.5) * vec2(1.6, 1.2)));
  c *= mix(1.0, mix(0.72, 1.0, vig), uVignette);
  c = mix(c, uFadeColor, uFade);
  fragColor = vec4(c, 1.0);
}
`;

export class PostPass {
  constructor(renderer, { height = 216 } = {}) {
    this.renderer = renderer;
    this.height = height;
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.uniforms = {
      tDiffuse: { value: this.target.texture },
      uRes: { value: new THREE.Vector2(4, 4) },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color('#4f6268') },
      uGrain: { value: 0.035 },
      uQuant: { value: 1 },
      uVignette: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.width = 4;
    this.heightPx = 4;
  }

  resize(screenW, screenH) {
    let w, h;
    if (screenW >= screenH) { h = this.height; w = Math.round((h * screenW) / screenH); }
    else { w = this.height; h = Math.round((w * screenH) / screenW); }
    this.width = w; this.heightPx = h;
    this.target.setSize(w, h);
    this.uniforms.uRes.value.set(w, h);
    this.renderer.setSize(screenW, screenH, false);
  }

  // The look of a scene: quantize (15-bit colour + dither), grain, vignette.
  // Absent keys go back to the PS1 defaults.
  setLook(r = {}) {
    this.uniforms.uQuant.value = r.quantize === false || r.quantize === 0 ? 0 : 1;
    this.uniforms.uGrain.value = r.grain !== undefined ? r.grain : 0.035;
    this.uniforms.uVignette.value = r.vignette !== undefined ? r.vignette : 1;
  }

  render(scene, camera, time, overlay, portrait) {
    const r = this.renderer;
    this.uniforms.uTime.value = time;
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);
    if (overlay) {
      r.autoClear = false;
      r.clearDepth();
      r.render(overlay.scene, overlay.camera);
      r.autoClear = true;
    }
    if (portrait) this.renderPortrait(portrait);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }

  // The speaker's portrait, an overlay of its own, lit from the front and
  // brighter than the scene so a face from a dark room still reads.
  renderPortrait({ scene, camera, env }) {
    const r = this.renderer;
    this._amb = this._amb || new THREE.Color(); this._sun = this._sun || new THREE.Color(); this._dir = this._dir || new THREE.Vector3();
    this._amb.copy(env.uAmbient.value); this._sun.copy(env.uSunColor.value); this._dir.copy(env.uSunDir.value);
    env.uAmbient.value.set('#5a5e60');
    env.uSunDir.value.set(0.35, 0.45, 1).normalize();
    env.uSunColor.value.set('#9a948a');
    r.autoClear = false;
    r.clearDepth();
    r.render(scene, camera);
    r.autoClear = true;
    env.uAmbient.value.copy(this._amb); env.uSunColor.value.copy(this._sun); env.uSunDir.value.copy(this._dir);
  }
}

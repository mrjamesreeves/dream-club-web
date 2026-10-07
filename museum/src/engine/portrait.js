// The speaker's portrait: their head and neck, cloned from the rig so the
// clone shares the live face material (blinks, glances, the moving mouth),
// drawn small over the scene at the top-left corner of the dialogue box.
// Nothing is drawn behind it; the clone sits in its own overlay scene.
import * as THREE from '../../vendor/three.module.js?v=6b6dcd0';

export class Portrait {
  constructor() {
    this.scene = new THREE.Scene();
    // Overlay units: height 2 for the whole page, width 2 * aspect.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.aspect = 1;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.id = null;
    this.live = null;
    this.turn = 0;
  }

  resize(aspect) {
    this.aspect = aspect;
    this.camera.left = -aspect; this.camera.right = aspect;
    this.camera.updateProjectionMatrix();
  }

  clear() { this.root.clear(); this.id = null; this.live = null; }

  // e: the speaking entity, or null; box: the dialogue box's client rect.
  // Returns true when there is a portrait to draw this frame.
  update(dt, e, box) {
    const rig = e && e.rig && e.rig.rig;
    const head = rig && rig.head;
    if (!head || !box) { if (this.id) this.clear(); return false; }
    if (this.id !== e.id) {
      this.clear();
      const h = head.clone(true);
      h.position.set(0, 0, 0); h.rotation.set(0, 0, 0);
      this.root.add(h);
      if (rig.neck) {
        const n = rig.neck.clone(true);
        n.position.set(0, rig.neck.position.y - head.position.y, 0); n.rotation.set(0, 0, 0);
        this.root.add(n);
      }
      this.id = e.id; this.live = head; this.head = h;
      this.turn = 0;
    }
    // Nods carry over from the live head; turns only a little, so the face
    // stays toward the player. A slow sway keeps it from looking pasted on.
    this.turn += dt;
    this.head.rotation.x = this.live.rotation.x * 0.7;
    this.head.rotation.y = this.live.rotation.y * 0.3 + Math.sin(this.turn * 0.7) * 0.12;
    this.head.rotation.z = this.live.rotation.z * 0.5;
    // Size: the head and neck stand about 11% of the page's height, placed
    // just above the box's top-left corner, the neck's end at the box.
    const W = window.innerWidth, H = window.innerHeight;
    const k = (0.11 * 2) / 0.36;
    const x = (box.left / W * 2 - 1) * this.aspect + 0.17 * k;
    const y = 1 - (box.top / H) * 2 + 0.11 * k;
    this.root.position.set(x, y, -2);
    this.root.scale.setScalar(k);
    return true;
  }
}

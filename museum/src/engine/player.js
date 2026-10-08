// First-person player. Desktop: pointer-lock look, WASD, with a drag-to-look
// fallback where pointer lock is unavailable. Touch: left half of the screen
// is an invisible stick for walking, right half drags to look, a tap
// interacts, a long press listens. Collision is AABB walls + floor raycast.
import * as THREE from '../../vendor/three.module.js?v=43c83b1';
const DOWN = new THREE.Vector3(0, -1, 0);

const KEYS = { w: 'f', s: 'b', a: 'l', d: 'r', arrowup: 'f', arrowdown: 'b', arrowleft: 'l', arrowright: 'r' };

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.position = new THREE.Vector3(0, 0, 0); // feet
    this.yaw = 0;
    this.pitch = 0;
    this.eyeHeight = 1.6;
    this.radius = 0.35;
    this.speed = 2.1;
    this.stepHeight = 0.4;
    this.vy = 0;
    this.grounded = false;
    this.keys = new Set();
    this.locked = false;
    this.dragLook = false;
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.enabled = true;
    this.bobPhase = 0;
    this.bob = 0;
    this.distanceWalked = 0;
    this.lastStepAt = 0;
    this.onStep = null;
    this.onTap = null;
    this.colliders = []; // { min: Vector3, max: Vector3 }
    this.walkables = []; // meshes
    this.ray = new THREE.Raycaster();
    this.ray.far = 6;
    this.tmp = new THREE.Vector3();
    this.lookDir = new THREE.Vector3(0, 0, -1);
    this.surface = 'concrete';
    this.touchMove = { f: 0, r: 0 };
    this.touchListen = false;
    this.touches = new Map();
    this.pointerLockFailed = false;
    this.lookLock = false;
    // Seated: no walking, the body stays put, the head turns within a range.
    this.seated = null; // { yaw, range }
    // Set from outside each frame: a lean of the whole view (a car swerving,
    // a train rocking), a shove (wind), and a scale on walking speed (numb).
    this.sway = { roll: 0, pitch: 0, y: 0, x: 0 };
    this.push = new THREE.Vector3();
    this.speedScale = 1;

    window.addEventListener('keydown', (e) => { this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) this.keys.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.pointerLockFailed = true;
      this.dragLook = true;
      if (this.onLockChange) this.onLockChange(true);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      const s = 0.0022;
      if (this.locked) this.turn(-e.movementX * s, -e.movementY * s);
      else if (this.dragLook && this.dragging) this.turn(-e.movementX * s * 1.4, -e.movementY * s * 1.4);
    });
    dom.addEventListener('mousedown', (e) => { if (e.button === 0) this.dragging = true; });
    window.addEventListener('mouseup', () => { this.dragging = false; });

    // Touch.
    const opts = { passive: false };
    dom.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const zone = t.clientX < window.innerWidth * 0.45 ? 'move' : 'look';
        this.touches.set(t.identifier, { zone, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now(), moved: 0 });
      }
    }, opts);
    dom.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        s.moved += Math.hypot(dx, dy);
        s.x = t.clientX; s.y = t.clientY;
        if (s.zone === 'look' && this.enabled) this.turn(-dx * 0.0045, -dy * 0.0045);
      }
      this.updateTouchMove();
    }, opts);
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        const dt = performance.now() - s.t0;
        if (s.moved < 12 && dt < 350) this.onTap?.(t.clientX, t.clientY);
        this.touches.delete(t.identifier);
      }
      this.updateTouchMove();
    };
    dom.addEventListener('touchend', end, opts);
    dom.addEventListener('touchcancel', end, opts);
  }

  // The active state is "the player can look around": pointer locked, drag
  // fallback, or a touch device.
  get active() { return this.locked || this.dragLook || this.isTouch; }

  turn(dyaw, dpitch) {
    if (this.lookLock) return; // the game is pointing the camera
    this.yaw += dyaw;
    if (this.seated && this.seated.range < Math.PI) {
      const c = this.seated.yaw;
      let d = this.yaw - c; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw = c + Math.max(-this.seated.range, Math.min(this.seated.range, d));
    }
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dpitch));
  }

  // Sit the player down at a point, facing yawDeg, able to turn +-rangeDeg.
  seat(pos, yawDeg = 0, rangeDeg = 180, eyeHeight = 1.15) {
    this.position.set(pos[0], pos[1], pos[2]);
    this.yaw = THREE.MathUtils.degToRad(yawDeg); this.pitch = 0;
    this.seated = { yaw: this.yaw, range: THREE.MathUtils.degToRad(rangeDeg) };
    this.eyeHeight = eyeHeight;
    this.vy = 0; this.lastSafe = null; this.keys.clear();
  }

  stand() { this.seated = null; this.eyeHeight = 1.6; }

  updateTouchMove() {
    let f = 0, r = 0;
    for (const s of this.touches.values()) {
      if (s.zone !== 'move') continue;
      const dx = s.x - s.x0, dy = s.y - s.y0;
      const dead = 10, max = 70;
      const len = Math.hypot(dx, dy);
      if (len < dead) continue;
      const k = Math.min(1, (len - dead) / (max - dead));
      r = (dx / len) * k;
      f = (-dy / len) * k;
    }
    this.touchMove.f = f; this.touchMove.r = r;
  }

  lock() {
    if (this.isTouch) return;
    if (!this.locked && !this.pointerLockFailed) {
      try {
        const p = this.dom.requestPointerLock?.();
        if (p && p.catch) p.catch(() => { this.pointerLockFailed = true; this.dragLook = true; this.onLockChange?.(true); });
      } catch (e) {
        this.pointerLockFailed = true; this.dragLook = true; this.onLockChange?.(true);
      }
    } else if (this.pointerLockFailed) {
      this.dragLook = true; this.onLockChange?.(true);
    }
  }

  setPose(pos, yawDeg = 0, pitchDeg = 0) {
    this.position.set(pos[0], pos[1], pos[2]);
    this.lastSafe = null;
    this.yaw = THREE.MathUtils.degToRad(yawDeg);
    this.pitch = THREE.MathUtils.degToRad(pitchDeg);
    this.vy = 0;
  }

  // Would the player, standing with their feet at `feet`, overlap a wall at (x, z)?
  // The same test move() uses.
  blockedAt(x, z, feet) {
    for (const c of this.colliders) {
      if (c.max.y <= feet + this.stepHeight || c.min.y >= feet + 1.7) continue;
      if (x + this.radius > c.min.x && x - this.radius < c.max.x && z + this.radius > c.min.z && z - this.radius < c.max.z) return true;
    }
    return false;
  }

  // The floor under (x, z), looking down from `fromY`; null over a void.
  floorAt(x, z, fromY) {
    this.ray.set(this.tmp.set(x, fromY, z), DOWN);
    const hits = this.ray.intersectObjects(this.walkables, false);
    return hits.length ? hits[0].point.y : null;
  }

  move(dt) {
    const p = this.position;
    if (this.seated) { this.bob = 0; this.grounded = true; this.placeCamera(); return; }
    let f = 0, r = 0;
    if (this.enabled && this.active) {
      for (const k of this.keys) {
        const d = KEYS[k];
        if (d === 'f') f += 1; else if (d === 'b') f -= 1; else if (d === 'l') r -= 1; else if (d === 'r') r += 1;
      }
      if (this.isTouch) { f += this.touchMove.f; r += this.touchMove.r; }
    }
    const moving = Math.abs(f) > 0.01 || Math.abs(r) > 0.01;
    let dx = 0, dz = 0;
    if (moving) {
      const len = Math.max(1, Math.hypot(f, r));
      f /= len; r /= len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // forward is -z at yaw 0
      dx = (-sin * f + cos * r) * this.speed * this.speedScale * dt;
      dz = (-cos * f - sin * r) * this.speed * this.speedScale * dt;
    }
    dx += this.push.x * dt; dz += this.push.z * dt;

    // Horizontal collision, one axis at a time. The feet are taken where the
    // move would land: a step no higher than stepHeight is climbed, so the
    // step after it does not count as a wall before this one is gained.
    const landing = this.floorAt(p.x + dx, p.z + dz, p.y + this.stepHeight + 0.05);
    const feet = (landing !== null && landing > p.y && landing <= p.y + this.stepHeight) ? landing : p.y;
    const wallHits = (x, z) => {
      const out = [];
      for (const c of this.colliders) {
        if (c.max.y <= feet + this.stepHeight || c.min.y >= feet + 1.7) continue;
        if (x + this.radius > c.min.x && x - this.radius < c.max.x && z + this.radius > c.min.z && z - this.radius < c.max.z) out.push(c);
      }
      return out;
    };
    // Anything we already overlap is ignored this frame, so a bad spawn or a
    // reset can never pin the player in place.
    const already = new Set(wallHits(p.x, p.z));
    const test = (x, z) => wallHits(x, z).some((c) => !already.has(c));
    if (!test(p.x + dx, p.z)) p.x += dx;
    if (!test(p.x, p.z + dz)) p.z += dz;

    // Floor.
    this.ray.set(this.tmp.set(p.x, p.y + this.stepHeight + 0.05, p.z), new THREE.Vector3(0, -1, 0));
    const hits = this.ray.intersectObjects(this.walkables, false);
    let floorY = null;
    if (hits.length) {
      floorY = hits[0].point.y;
      this.surface = hits[0].object.userData.surface || 'concrete';
    }
    this.vy -= 12 * dt;
    if (this.terminal != null && this.vy < -this.terminal) this.vy = -this.terminal;
    let ny = p.y + this.vy * dt;
    if (floorY !== null && ny <= floorY + 0.001) {
      ny = floorY;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    if (this.grounded && floorY !== null && this.surface !== 'water') {
      if (!this.lastSafe) this.lastSafe = new THREE.Vector3();
      this.lastSafe.copy(p);
    }
    // A long fall a scene has asked for (the fall action) drifts down at its
    // terminal speed and is not put back on safe ground; a teleport ends it.
    if (this.safeReset !== false && ny < -12 && this.lastSafe) { p.copy(this.lastSafe); this.vy = 0; ny = p.y; this.keys.clear(); }
    else if (ny < (this.safeReset === false ? -400 : -40)) { ny = this.safeReset === false ? -400 : -40; this.vy = 0; }
    p.y = ny;

    // Head bob and footsteps.
    if (moving && this.grounded) {
      const dist = Math.hypot(dx, dz);
      this.distanceWalked += dist;
      this.bobPhase += dist * 4.2;
      this.bob = THREE.MathUtils.lerp(this.bob, 1, dt * 8);
      if (this.distanceWalked - this.lastStepAt > 1.45) {
        this.lastStepAt = this.distanceWalked;
        this.onStep?.(this.surface);
      }
    } else {
      this.bob = THREE.MathUtils.lerp(this.bob, 0, dt * 6);
    }

    this.placeCamera();
  }

  placeCamera() {
    const p = this.position, cam = this.camera, sw = this.sway;
    const bobY = Math.sin(this.bobPhase) * 0.035 * this.bob;
    const bobX = Math.cos(this.bobPhase * 0.5) * 0.02 * this.bob + sw.x;
    cam.position.set(p.x + bobX * Math.cos(this.yaw), p.y + this.eyeHeight + bobY + sw.y, p.z - bobX * Math.sin(this.yaw));
    cam.rotation.set(0, 0, 0, 'YXZ');
    cam.rotation.y = this.yaw;
    cam.rotation.x = this.pitch + sw.pitch;
    cam.rotation.z = sw.roll;
    cam.getWorldDirection(this.lookDir);
  }
}

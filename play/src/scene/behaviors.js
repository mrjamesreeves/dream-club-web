// Declarative per-entity behaviors. Each is a function (entity, dt, ctx) that
// moves the entity's group and fills the pose state used by its rig.
import * as THREE from '../../vendor/three.module.js?v=395730b';

const _v = new THREE.Vector3();

// Head-tracking target in the entity's local frame (yaw/pitch for the rig).
function lookAtPlayer(e, ctx, radius = 7) {
  const p = ctx.camera ? ctx.camera.position : ctx.player.position;
  const g = e.group;
  const dx = p.x - g.position.x, dz = p.z - g.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > radius) { e.pose.lookAt = null; return; }
  let yaw = Math.atan2(dx, dz) - g.rotation.y;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const pitch = -Math.atan2(p.y - (g.position.y + 1.65), dist);
  e.pose.lookAt = { yaw, pitch };
}

function faceToward(entity, x, z, dt, rate = 4) {
  const g = entity.group;
  const target = Math.atan2(x - g.position.x, z - g.position.z);
  let d = target - g.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += d * Math.min(1, dt * rate);
}

function snapToGround(entity, ctx) {
  const g = entity.group;
  ctx.groundRay.set(_v.set(g.position.x, g.position.y + 1.0, g.position.z), ctx.down);
  const hits = ctx.groundRay.intersectObjects(ctx.walkables, false);
  if (hits.length) g.position.y = hits[0].point.y;
}

function stepToward(entity, tx, tz, speed, dt, ctx) {
  const g = entity.group;
  const dx = tx - g.position.x, dz = tz - g.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return 0;
  const step = Math.min(dist, speed * dt);
  g.position.x += (dx / dist) * step;
  g.position.z += (dz / dist) * step;
  snapToGround(entity, ctx);
  return dist - step;
}

export const behaviors = {
  idle(e, dt, ctx) {
    e.pose.moving = false;
    lookAtPlayer(e, ctx);
    if (e.behavior.facePlayer !== false) {
      const p = ctx.player.position;
      if (p.distanceTo(e.group.position) < (e.behavior.noticeRadius ?? 6)) faceToward(e, p.x, p.z, dt, 2.5);
    }
  },

  wave(e, dt, ctx) {
    behaviors.idle(e, dt, ctx);
    e.pose.wave = true;
  },

  // Walk after the player, keeping a few metres back, along the path the
  // player actually took so corners and stairs work.
  follow(e, dt, ctx) {
    const p = ctx.player.position;
    const g = e.group;
    const dist = Math.hypot(p.x - g.position.x, p.z - g.position.z);
    const far = e.behavior.distance ?? 3.2;
    const speed = e.behavior.speed ?? 1.6;
    if (dist > far + 0.3) e._following = true;
    else if (dist < far) e._following = false;
    const trail = ctx.playerTrail; // newest first, each { x, y, z, seq }
    if (e._seq === undefined) {
      // Start from the trail point nearest to where we stand.
      let best = -1, bd = Infinity;
      for (const t of trail) { const d = Math.hypot(t.x - g.position.x, t.z - g.position.z); if (d < bd) { bd = d; best = t.seq; } }
      e._seq = best;
    }
    if (e._following && dist > 0.1) {
      let target = null;
      // Oldest point we have not passed yet.
      for (let i = trail.length - 1; i >= 0; i--) {
        const t = trail[i];
        if (t.seq <= e._seq) continue;
        if (Math.hypot(t.x - g.position.x, t.z - g.position.z) < 0.5) { e._seq = t.seq; continue; }
        target = t; break;
      }
      // Close and nothing in the way: head straight for the player.
      const straight = dist < 4 && Math.abs(p.y - g.position.y) < 0.6;
      const tx = (straight || !target) ? p.x : target.x, tz = (straight || !target) ? p.z : target.z;
      faceToward(e, tx, tz, dt, 6);
      stepToward(e, tx, tz, speed, dt, ctx);
      e.pose.moving = true;
    } else {
      e.pose.moving = false;
      faceToward(e, p.x, p.z, dt, 2.5);
    }
    lookAtPlayer(e, ctx);
  },

  walkTo(e, dt, ctx) {
    const b = e.behavior;
    if (!b._path) { b._path = (b.path || [b.target]).slice(); }
    const [tx, tz] = b._path[0];
    const speed = b.speed ?? 1.2;
    const left = stepToward(e, tx, tz, speed, dt, ctx);
    faceToward(e, tx, tz, dt, 6);
    e.pose.moving = left > 0.05;
    e.pose.sit = false;
    if (left <= 0.05) {
      b._path.shift();
      if (b._path.length) return;
      ctx.flags.add(`arrived:${e.id}`);
      const then = b.then || 'idle';
      if (then === 'hide') { e.group.visible = false; e.behavior = { name: 'none' }; return; }
      e.behavior = typeof then === 'string' ? { name: then, yaw: b.yaw, facePlayer: b.facePlayer } : { ...then };
      if (b.yaw !== undefined) e.group.rotation.y = THREE.MathUtils.degToRad(b.yaw);
    }
  },

  // Seated at a table, facing a fixed direction, glancing at the player.
  sit(e, dt, ctx) {
    e.pose.moving = false;
    e.pose.sit = true;
    e.pose.seatHeight = e.behavior.seatHeight ?? 0.45;
    e.pose.lean = e.behavior.lean ?? 0;
    // Turned round in the seat to face the player (a driver talking to the back seat).
    if (e.behavior.turn) {
      const p = ctx.player.position, g = e.group;
      let yaw = Math.atan2(p.x - g.position.x, p.z - g.position.z) - g.rotation.y;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      e.pose.twist = THREE.MathUtils.clamp(yaw, -1.6, 1.6);
    } else e.pose.twist = 0;
    if (e.behavior.yaw !== undefined) e.group.rotation.y = THREE.MathUtils.degToRad(e.behavior.yaw);
    if (e.behavior.facePlayer !== false) lookAtPlayer(e, ctx, 6); else e.pose.lookAt = null;
    if (e.behavior.lookAt) {
      const [lx, lz] = e.behavior.lookAt; const g = e.group;
      let yaw = Math.atan2(lx - g.position.x, lz - g.position.z) - g.rotation.y;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      e.pose.lookAt = { yaw, pitch: 0.1 };
    }
  },

  // Moves through the air along a 3D path: a dog under a parachute, a thing
  // falling. No ground snap. path: [[x, y, z], ...], speed, then, sway.
  fly(e, dt, ctx) {
    const b = e.behavior;
    if (!b._path) { b._path = b.path.map((p) => new THREE.Vector3().fromArray(p)); b._t = 0; }
    const g = e.group, tgt = b._path[0];
    const d = _v.copy(tgt).sub(g.position); const dist = d.length();
    const step = Math.min(dist, (b.speed ?? 1) * dt);
    if (dist > 1e-4) g.position.addScaledVector(d.normalize(), step);
    b._t += dt;
    e.pose.hang = true; e.pose.moving = false;
    if (b.sway) { g.rotation.z = Math.sin(b._t * 1.1) * 0.18; g.rotation.x = Math.sin(b._t * 0.7) * 0.1; }
    if (b.face) faceToward(e, tgt.x, tgt.z, dt, 3);
    if (dist - step <= 0.02) {
      b._path.shift();
      if (b._path.length) return;
      ctx.flags.add(`arrived:${e.id}`);
      const then = b.then || 'none';
      if (then === 'hide') { g.visible = false; e.behavior = { name: 'none' }; return; }
      e.behavior = typeof then === 'string' ? { name: then } : { ...then };
    }
  },

  // Walks toward the player until within `distance`, then does `then`.
  approach(e, dt, ctx) {
    const b = e.behavior, p = ctx.player.position, g = e.group;
    const dist = Math.hypot(p.x - g.position.x, p.z - g.position.z);
    if (dist > (b.distance ?? 1.2)) {
      faceToward(e, p.x, p.z, dt, 6);
      stepToward(e, p.x, p.z, b.speed ?? 1.3, dt, ctx);
      e.pose.moving = true;
    } else {
      e.pose.moving = false;
      ctx.flags.add(`arrived:${e.id}`);
      e.behavior = typeof (b.then || 'idle') === 'string' ? { name: b.then || 'idle', facePlayer: true } : { ...b.then };
    }
    lookAtPlayer(e, ctx);
  },

  // Crawls a looping route on hands and knees, slowly, looking up at the player.
  creep(e, dt, ctx) {
    e.pose.crawl = true;
    behaviors.patrol(e, dt, ctx);
    lookAtPlayer(e, ctx, 5);
  },

  // Stands about at a party: turns toward whoever is near, drifts a little,
  // the drink coming up now and then (see the glass prop).
  mingle(e, dt, ctx) {
    const b = e.behavior, g = e.group;
    if (b._home === undefined) { b._home = [g.position.x, g.position.z]; b._next = 2 + Math.random() * 6; b._yaw = g.rotation.y; }
    b._next -= dt;
    if (b._next <= 0) {
      b._next = 4 + Math.random() * 8;
      const a = Math.random() * Math.PI * 2, r = (b.wander ?? 0.6) * Math.random();
      b._to = [b._home[0] + Math.sin(a) * r, b._home[1] + Math.cos(a) * r];
      b._yaw = (b.yaw !== undefined ? THREE.MathUtils.degToRad(b.yaw) : b._yaw) + (Math.random() - 0.5) * 1.2;
    }
    if (b._to) {
      const left = stepToward(e, b._to[0], b._to[1], 0.5, dt, ctx);
      faceToward(e, b._to[0], b._to[1], dt, 4);
      e.pose.moving = left > 0.05;
      if (left <= 0.05) b._to = null;
    } else {
      e.pose.moving = false;
      const p = ctx.player.position;
      if (Math.hypot(p.x - g.position.x, p.z - g.position.z) < (b.noticeRadius ?? 2.6)) faceToward(e, p.x, p.z, dt, 3);
      else { let d = b._yaw - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 2); }
    }
    lookAtPlayer(e, ctx, 4);
  },

  // A dog standing, head following the player, growling if asked.
  guard(e, dt, ctx) {
    behaviors.stand(e, dt, ctx);
    e.pose.alert = true;
  },

  // Stands where they are and reaches for a point: [x, y, z] in the world.
  reach(e, dt, ctx) {
    const b = e.behavior;
    e.pose.moving = false;
    e.pose.sit = false;
    if (b.yaw !== undefined) e.group.rotation.y = THREE.MathUtils.degToRad(b.yaw);
    if (!b._at) b._at = new THREE.Vector3();
    // A point in the world, or someone's throat: { id } follows their neck.
    const who = b.target && b.target.id && ctx.game.entities.get(b.target.id);
    const neck = who && who.rig && who.rig.rig && who.rig.rig.head;
    if (b.target && b.target.id === 'player') { b._at.copy(ctx.camera.position); b._at.y -= 0.45; }
    else if (neck) { neck.updateWorldMatrix(true, false); b._at.set(0, 0.02, 0.09); neck.localToWorld(b._at); }
    else if (Array.isArray(b.target)) b._at.fromArray(b.target);
    e.pose.reach = b._at;
    e.pose.reachLean = b.lean ?? 0.9;
    e.pose.lookAt = { yaw: 0, pitch: 0.35 };
  },

  // Keels over sideways in the seat and stays there.
  slump(e, dt, ctx) {
    e.pose.moving = false;
    e.pose.sit = e.behavior.sit !== false;
    e.pose.seatHeight = e.behavior.seatHeight ?? 0.45;
    e.pose.slump = true;
    e.pose.slumpDir = e.behavior.dir ?? -1;
    e.pose.slumpRate = e.behavior.rate ?? 1.2;
    e.pose.lookAt = null;
    if (e.behavior.yaw !== undefined) e.group.rotation.y = THREE.MathUtils.degToRad(e.behavior.yaw);
  },

  // Seated at an instrument, playing.
  play(e, dt, ctx) {
    behaviors.sit(e, dt, ctx);
    e.pose.play = true;
    e.pose.lookAt = null;
  },

  // Seated and eating, glancing at companions or the player.
  dine(e, dt, ctx) {
    behaviors.sit(e, dt, ctx);
    e.pose.eat = true;
    e.pose.eatPeriod = e.behavior.period ?? 6.5;
    // Now and then look across at the player if they are close.
    e._glance = (e._glance ?? Math.random() * 8) + dt;
    if (e._glance % 9 > 6.5) lookAtPlayer(e, ctx, 4);
  },

  // Walks a looping route, pausing at each stop. Waiters, mostly.
  patrol(e, dt, ctx) {
    const b = e.behavior;
    const route = b.route || [];
    if (!route.length) return;
    if (b._i === undefined) { b._i = 0; b._wait = 0; }
    e.pose.carry = !!b.carry;
    if (b._wait > 0) {
      b._wait -= dt;
      e.pose.moving = false;
      const stop = route[b._i];
      if (stop[2] !== undefined) faceToward(e, e.group.position.x + Math.sin(THREE.MathUtils.degToRad(stop[2])), e.group.position.z + Math.cos(THREE.MathUtils.degToRad(stop[2])), dt, 4);
      if (b._wait <= 0) b._i = (b._i + 1) % route.length;
      return;
    }
    const [tx, tz] = route[b._i];
    const left = stepToward(e, tx, tz, b.speed ?? 1.1, dt, ctx);
    faceToward(e, tx, tz, dt, 6);
    e.pose.moving = left > 0.05;
    if (left <= 0.05) b._wait = (route[b._i][3] ?? b.pause ?? 2) * (0.7 + Math.random() * 0.6);
  },

  // Rolls paint on a wall, facing a fixed direction.
  paint(e, dt, ctx) {
    e.pose.moving = false;
    e.pose.paint = true;
    e.pose.lookAt = null;
    if (e.behavior.yaw !== undefined) e.group.rotation.y = THREE.MathUtils.degToRad(e.behavior.yaw);
  },

  // Faces a direction and stays put, head tracking the player.
  stand(e, dt, ctx) {
    e.pose.moving = false;
    if (e.behavior.yaw !== undefined) e.group.rotation.y = THREE.MathUtils.degToRad(e.behavior.yaw);
    lookAtPlayer(e, ctx, e.behavior.noticeRadius ?? 7);
  },

  stir(e, dt, ctx) {
    e.pose.stir = true;
  },

  // The amalgam drags itself toward a target in lurches.
  crawl(e, dt, ctx) {
    const [tx, tz] = e.behavior.target;
    const speed = e.behavior.speed ?? 2.2;
    e._crawlT = (e._crawlT ?? 0) + dt;
    const cycle = e.behavior.period ?? 1.6;
    const phase = (e._crawlT % cycle) / cycle;
    const effort = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI) : 0;
    if (phase < 0.05 && !e._scraped) { e._scraped = true; ctx.audio.scrape(1); }
    if (phase > 0.5) e._scraped = false;
    e.pose.lurch = effort;
    faceToward(e, tx, tz, dt, 1.5);
    const left = stepToward(e, tx, tz, speed * effort, dt, ctx);
    if (left <= 0.1) {
      ctx.flags.add(`arrived:${e.id}`);
      e.behavior = { name: 'writhe' };
    }
  },

  writhe(e, dt, ctx) {
    e._wT = (e._wT ?? 0) + dt;
    e.pose.lurch = Math.max(0, Math.sin(e._wT * 1.1)) * 0.5;
    if (Math.random() < dt * 0.35) ctx.audio.scrape(0.5);
  },

  none() {},
};

export function updateBehavior(e, dt, ctx) {
  e.pose.eat = false; e.pose.carry = false; e.pose.play = false; e.pose.headTilt = 0; e.pose.reach = null; e.pose.lean = 0; e.pose.crawl = false; e.pose.hang = false; e.pose.alert = false;
  const b = e.behavior && behaviors[e.behavior.name];
  if (b) b(e, dt, ctx);
  else if (e.behavior) behaviors.idle(e, dt, ctx);
  // The gesture layer: a reaction set by an event wins while it lasts, then
  // whatever the behavior (or the character) names, else fidgeting.
  const now = ctx.game ? ctx.game.time : 0;
  if (e.reaction && now > e.reaction.until) e.reaction = null;
  e.pose.gesture = e.reaction ? e.reaction.gesture : (e.behavior && e.behavior.gesture) || e.gesture || 'fidget';
  e.pose.gazeSide = e.behavior && e.behavior.gazeSide;
  e.pose.talking = !!(ctx.game && ctx.game.dialog.open && ctx.game.speaker === e.id);
  e.pose.typing = e.pose.talking && (ctx.game.dialog.typing || ctx.game.dialog.speaking());
}

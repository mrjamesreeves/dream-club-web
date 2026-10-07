// Scripted events: a list of { id, when: {conditions}, do: [actions], once }.
// Conditions are checked every frame; actions run in order (dialogue awaits).
import * as THREE from '../../vendor/three.module.js?v=970753f';
import { setRim } from '../engine/ps1material.js?v=970753f';

const _a = new THREE.Vector3();

export class Events {
  constructor(game, defs = []) {
    this.game = game;
    this.defs = defs.map((d) => ({ once: true, ...d }));
    this.fired = new Map(); // id -> time fired
    this.flags = game.flags;
    this.running = false;
    this.time = 0;
    this.started = false;
  }

  start() { this.started = true; }

  check(when) {
    const g = this.game;
    const p = g.player.position;
    for (const [key, val] of Object.entries(when)) {
      switch (key) {
        case 'start':
          if (!this.started) return false; break;
        case 'enter': {
          const d = Math.hypot(p.x - val.pos[0], p.z - val.pos[1]);
          if (d > val.radius) return false;
          if (val.maxY !== undefined && p.y > val.maxY) return false;
          break;
        }
        case 'look': {
          const e = g.entities.get(val.target);
          if (!e || !e.group.visible) return false;
          e.group.getWorldPosition(_a);
          _a.y += (e.hitHeight || 1) * 0.5;
          const cam = g.camera.position;
          const dist = _a.distanceTo(cam);
          if (dist > (val.within ?? 15)) return false;
          _a.sub(cam).normalize();
          const cos = Math.cos(THREE.MathUtils.degToRad(val.angle ?? 12));
          if (_a.dot(g.player.lookDir) < cos) return false;
          break;
        }
        case 'flag':
          if (!this.flags.has(val)) return false; break;
        case 'flags':
          for (const f of val) if (!this.flags.has(f)) return false; break;
        case 'not':
          for (const f of Array.isArray(val) ? val : [val]) if (this.flags.has(f)) return false; break;
        case 'after': {
          const t = this.fired.get(val.event);
          if (t === undefined || this.time - t < (val.seconds ?? 0)) return false;
          break;
        }
        case 'since': {
          const age = this.flags.age ? this.flags.age(val.flag) : -1;
          if (age < 0 || age < (val.seconds ?? 0)) return false;
          break;
        }
        case 'near': {
          // Player within radius of a character or a named object.
          const pos = g.positionOf(val.id);
          if (!pos || Math.hypot(p.x - pos.x, p.z - pos.z) > (val.radius ?? 2)) return false;
          break;
        }
        case 'has':
          if (!g.inventory.has(val)) return false; break;
        case 'facing': {
          // The camera is pointed at a point in space, within an angle.
          _a.fromArray(val.pos);
          const cam = g.camera.position;
          if (val.within !== undefined && _a.distanceTo(cam) > val.within) return false;
          _a.sub(cam).normalize();
          if (_a.dot(g.player.lookDir) < Math.cos(THREE.MathUtils.degToRad(val.angle ?? 14))) return false;
          break;
        }
        case 'below':
          // The player has fallen below a height.
          if (p.y > val) return false; break;
        case 'riding':
          // The vehicle is (true) or is not (false) moving.
          if (!!(g.ride && g.ride.speed > 0.2) !== !!val) return false; break;
        case 'arrived':
          if (!this.flags.has(`arrived:${val}`)) return false; break;
        case 'listened':
          if (!this.flags.has('listened')) return false; break;
        default:
          console.warn('unknown condition', key);
      }
    }
    return true;
  }

  update(dt) {
    this.time += dt;
    if (this.running || this.game.dialog.open || this.game.ending || this.game.talking) return;
    for (const d of this.defs) {
      if (d.once && this.fired.has(d.id)) continue;
      if (!this.check(d.when || {})) continue;
      this.fired.set(d.id, this.time);
      this.run(d.do || []);
      break;
    }
  }

  async run(actions) {
    this.running = true;
    try {
      for (const a of actions) await this.act(a);
    } finally {
      this.running = false;
    }
  }

  async act(a) {
    const g = this.game;
    if (a.ending) g.beginEnding(a.ending);
    if (a.fade) g.beginEnding(a.fade);
    if (a.give) g.give(a.give);
    if (a.say) {
      // Scripted lines wait for any conversation in progress to finish.
      while (g.dialog.open && !g.ending) await g.wait(0.25);
      await g.dialog.say(a.say, g.names, { auto: !a.manual });
    }
    if (a.set) for (const f of Array.isArray(a.set) ? a.set : [a.set]) this.flags.add(f);
    if (a.clear) for (const f of Array.isArray(a.clear) ? a.clear : [a.clear]) this.flags.delete(f);
    if (a.behavior) {
      const e = g.entities.get(a.behavior.id);
      if (e) { const { id, ...spec } = a.behavior; e.behavior = spec; }
    }
    if (a.show) { const e = g.entities.get(a.show); if (e) e.group.visible = true; else g.world.setObjectVisible(a.show, true); }
    if (a.hide) { const e = g.entities.get(a.hide); if (e) e.group.visible = false; else g.world.setObjectVisible(a.hide, false); }
    if (a.take) g.inventory.remove(a.take);
    if (a.machine) g.world.setMachine(a.machine.id, a.machine.on !== false);
    if (a.ride !== undefined) g.setRide(a.ride);
    if (a.focus) g.focus(a.focus);
    if (a.watch) g.watchTelevision(a.watch);
    if (a.release) g.releaseFocus();
    if (a.ambience) for (const [k, v] of Object.entries(a.ambience)) g.ambienceGain[k] = v;
    // The light and the fog of the dream change: a window onto a long view, a flight.
    if (a.environment) g.setEnvironment(a.environment);
    if (a.sky && g.world) g.world.setSky(a.sky);
    if (a.swerve) g.swerve(a.swerve.amount ?? 1, a.swerve.seconds ?? 1.2, a.swerve.sound !== false);
    if (a.tween) g.tween(a.tween);
    if (a.seat) g.player.seat(a.seat.pos, a.seat.yaw ?? 0, a.seat.range ?? 180, a.seat.eye ?? 1.15);
    if (a.stand) g.player.stand();
    if (a.fov !== undefined) g.fovTarget = a.fov;
    if (a.light) { const l = g.world.lightById.get(a.light.id); if (l) l.target = a.light.intensity; }
    if (a.move) { const e = g.entities.get(a.move.id); if (e) { e.group.position.fromArray(a.move.pos); if (a.move.yaw !== undefined) e.group.rotation.y = THREE.MathUtils.degToRad(a.move.yaw); } }
    if (a.hint) g.dialog.showHint(a.hint, a.seconds ?? 7);
    if (a.sfx) g.audio[a.sfx]?.(a.intensity ?? 1);
    if (a.listen) g.give('listener');
    if (a.wait) await g.wait(a.wait);
    if (a.fall) { g.player.terminal = a.fall.terminal ?? 3; g.player.safeReset = false; g.player.vy = Math.min(g.player.vy, 0); }
    if (a.teleport) {
      g.player.terminal = null; g.player.safeReset = true; g.player.vy = 0;
      g.player.setPose(a.teleport.pos, a.teleport.yaw ?? 0, a.teleport.pitch ?? 0);
      g.playerTrail.length = 0;
      g.player.move(0);
      if (a.teleport.flash !== false) g.flash(a.teleport.flash ?? 1.4);
    }
    if (a.card) g.showCard(a.card, a.hold ?? 3.2);
    if (a.sleep) g.sleep(a.sleep);
    if (a.voice) g.setVoiceStyle(a.voice);
    // Rim light on a person (or a list of them): { id, k (0 clears), color }.
    if (a.rim) for (const id of [].concat(a.rim.id)) { const e = g.entities.get(id); if (e) setRim(e.group, a.rim.k ?? 0.5, a.rim.color); }
    // A gesture for a while: one id, a list, or everyone within `radius` of a point / the player.
    if (a.react) {
      const r = a.react;
      let ids = r.id === undefined ? [] : [].concat(r.id);
      if (r.all || r.radius) {
        const c = r.pos ? { x: r.pos[0], z: r.pos[1] } : g.player.position;
        for (const e of g.entities.values()) if (e.group.visible && (!r.radius || Math.hypot(e.group.position.x - c.x, e.group.position.z - c.z) <= r.radius)) ids.push(e.id);
      }
      for (const id of ids) { const e = g.entities.get(id); if (e) e.reaction = { gesture: r.gesture || 'startled', until: g.time + (r.seconds ?? 2.5) }; }
    }
    if (a.chooser) g.openChooser();
    if (a.flash) g.flash(a.flash);
  }
}

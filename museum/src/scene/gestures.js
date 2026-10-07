// The animation library: named gestures layered over whatever a humanoid is
// doing (standing, sitting, walking). A gesture sets target rotations for
// the arms, head and upper body and the rig blends toward them.
//
// Every humanoid runs `fidget` unless told otherwise: small things, now and
// then, so nobody stands like a mannequin. A behavior can name a gesture
// (`"behavior": { "name": "sit", "gesture": "brace" }`), an event can set one
// for a while (`{ "react": { "id": "friend1", "gesture": "startled", "seconds": 2 } }`),
// and whoever's line is on screen gestures with it (`talk`).
//
// Rotation conventions (see characters.js): shoulder.x negative raises the
// arm forward; shoulder.z positive on the left arm (negative on the right)
// swings it out to the side; elbow.x negative bends the forearm up.
import * as THREE from '../../vendor/three.module.js?v=41d35b4';

const L = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

// Blend one arm toward shoulder x/z and elbow x/z.
function arm(a, sx, sz, ex, ez, k) {
  a.shoulder.rotation.x = L(a.shoulder.rotation.x, sx, k);
  a.shoulder.rotation.z = L(a.shoulder.rotation.z, sz, k);
  a.elbow.rotation.x = L(a.elbow.rotation.x, ex, k);
  a.elbow.rotation.z = L(a.elbow.rotation.z, ez, k);
}
// Both arms, mirrored in z.
function arms(rig, sx, sz, ex, k, ez = 0) {
  arm(rig.armL, sx, sz, ex, ez, k);
  arm(rig.armR, sx, -sz, ex, -ez, k);
}
// A smooth in/out envelope over a span.
const env = (t, d, ramp = 0.5) => clamp(Math.min(t / ramp, (d - t) / ramp), 0, 1);

// Small idle business. Each micro is [name, seconds]; one plays, then a gap.
const MICROS = {
  stand: [['glance', 2.6], ['scratch', 2.8], ['face', 2.4], ['clasp', 7], ['cross', 9], ['shift', 5], ['down', 3], ['hips', 6], ['glance', 2.2], ['shift', 5]],
  sit: [['glance', 2.6], ['scratch', 2.8], ['face', 2.4], ['clasp', 8], ['down', 3], ['cross', 7], ['lean', 5], ['glance', 2.2], ['knee', 6]],
};

function micro(rig, s, state, dt, k) {
  const sitting = !!s.sit;
  if (state.microT === undefined) { state.microT = 1 + Math.random() * 4; state.micro = null; }
  state.microT -= dt;
  if (!state.micro && state.microT <= 0) {
    const list = MICROS[sitting ? 'sit' : 'stand'];
    const pick = list[Math.floor(Math.random() * list.length)];
    state.micro = { name: pick[0], d: pick[1], t: 0 };
  }
  if (!state.micro) return;
  const m = state.micro;
  m.t += dt;
  const w = env(m.t, m.d) * k;
  const t = state.t;
  switch (m.name) {
    case 'glance': state.headYawAdd = L(state.headYawAdd, (state.microSide ??= Math.random() < 0.5 ? -1 : 1) * 0.55, w); break;
    case 'scratch': arm(rig.armR, -0.3, -0.9, -2.6, 0.2, w); state.headTiltAdd = L(state.headTiltAdd, 0.12, w); break;
    case 'face': arm(rig.armR, -1.0, -0.15, -2.3, 0, w); state.headTiltAdd = L(state.headTiltAdd, 0.18, w); break;
    case 'clasp': arms(rig, sitting ? -0.4 : -0.25, 0.14, sitting ? -0.9 : -1.15, w, 0.25); break;
    case 'cross': arms(rig, -0.55, 0.3, -1.95, w, 0.45); break;
    case 'hips': arms(rig, 0.35, 0.5, -1.35, w, 0.1); break;
    case 'shift': rig.upper.rotation.z += (state.microSide ??= Math.random() < 0.5 ? -1 : 1) * 0.06 * w * Math.sin(Math.min(1, m.t / m.d) * Math.PI); break;
    case 'down': state.headTiltAdd = L(state.headTiltAdd, 0.35, w); break;
    case 'lean': rig.upper.rotation.x -= 0.12 * w; break;
    case 'knee': arm(rig.armR, -0.9, -0.1, -0.45, 0, w); arm(rig.armL, -0.4, 0.14, -0.9, 0.25, w); break;
  }
  if (m.t >= m.d) { state.micro = null; state.microSide = undefined; state.microT = 2.5 + Math.random() * 6; }
}

export const GESTURES = {
  // Default: breathing, weight shifts, and a small thing every few seconds.
  fidget(rig, s, state, dt, k) { micro(rig, s, state, dt, k); },

  // Speaking: the right hand moves with the words, the head nods along.
  talk(rig, s, state, dt, k) {
    const t = state.t;
    const beat = Math.sin(t * 3.3) * 0.5 + Math.sin(t * 5.1) * 0.3;
    arm(rig.armR, -0.75 + beat * 0.25, -0.35, -1.75 + beat * 0.35, -0.2, k);
    arm(rig.armL, -0.3, 0.2, -1.1 + Math.sin(t * 2.1) * 0.15, 0.15, k * 0.6);
    state.headTiltAdd = L(state.headTiltAdd, Math.sin(t * 4.2) * 0.06, k);
    state.headYawAdd = L(state.headYawAdd, Math.sin(t * 1.3) * 0.08, k);
  },

  // Holding on with both hands, head down, shaking.
  brace(rig, s, state, dt, k) {
    const t = state.t;
    arms(rig, -1.25, 0.45, -1.45, k, 0.1);
    state.headTiltAdd = L(state.headTiltAdd, 0.45, k);
    rig.upper.rotation.x += 0.12 * k;
    rig.upper.rotation.z += Math.sin(t * 17) * 0.025 * k;
  },

  // One hand up on a strap, swaying with the carriage.
  strap(rig, s, state, dt, k) {
    const t = state.t;
    arm(rig.armR, -2.75, -0.25, -0.35, 0, k);
    rig.upper.rotation.z += Math.sin(t * 1.4) * 0.03 * k;
    micro(rig, s, state, dt, k);
  },

  // Holding a pole or rail in front at chest height.
  pole(rig, s, state, dt, k) {
    arm(rig.armR, -1.0, -0.15, -0.5, 0, k);
    micro(rig, s, state, dt, k);
  },

  // Hands up and back, leaning away from something.
  startled(rig, s, state, dt, k) {
    const t = state.t;
    arms(rig, -1.4, 0.55, -2.1, k, 0.2);
    rig.upper.rotation.x -= 0.18 * k;
    state.headTiltAdd = L(state.headTiltAdd, -0.25, k);
    rig.upper.rotation.z += Math.sin(t * 9) * 0.02 * k;
  },

  // Arms over the head, flailing.
  panic(rig, s, state, dt, k) {
    const t = state.t;
    arm(rig.armR, -2.6 + Math.sin(t * 9) * 0.3, -0.5 + Math.sin(t * 7) * 0.3, -0.6, 0, k);
    arm(rig.armL, -2.6 + Math.sin(t * 9 + 2) * 0.3, 0.5 - Math.sin(t * 7 + 1) * 0.3, -0.6, 0, k);
    state.headYawAdd = L(state.headYawAdd, Math.sin(t * 6) * 0.3, k);
  },

  // Both arms up, waving.
  cheer(rig, s, state, dt, k) {
    const t = state.t;
    arm(rig.armR, -2.7, -0.4 + Math.sin(t * 5) * 0.2, -0.5, 0, k);
    arm(rig.armL, -2.7, 0.4 - Math.sin(t * 5 + 1) * 0.2, -0.5, 0, k);
    state.headTiltAdd = L(state.headTiltAdd, -0.2, k);
  },

  clap(rig, s, state, dt, k) {
    const t = state.t;
    const c = Math.max(0, Math.sin(t * 8)) * 0.35;
    arm(rig.armR, -0.9, -0.1 - c, -1.9, 0, k);
    arm(rig.armL, -0.9, 0.1 + c, -1.9, 0, k);
  },

  // Head only.
  nod(rig, s, state, dt, k) { state.headTiltAdd = L(state.headTiltAdd, Math.sin(state.t * 6) * 0.18, k); },
  shake(rig, s, state, dt, k) { state.headYawAdd = L(state.headYawAdd, Math.sin(state.t * 6) * 0.35, k); },

  // Pointing straight ahead with the right arm.
  point(rig, s, state, dt, k) { arm(rig.armR, -1.5, -0.08, -0.05, 0, k); },

  armsCrossed(rig, s, state, dt, k) { arms(rig, -0.55, 0.3, -1.95, k, 0.45); micro(rig, s, state, dt, k * 0.3); },
  handsOnHips(rig, s, state, dt, k) { arms(rig, 0.35, 0.5, -1.35, k, 0.1); },

  // Reading something held in both hands, head down.
  read(rig, s, state, dt, k) {
    arms(rig, -0.85, 0.12, -1.45, k, 0.3);
    state.headTiltAdd = L(state.headTiltAdd, 0.45, k);
    state.headYawAdd = L(state.headYawAdd, Math.sin(state.t * 0.5) * 0.08, k);
  },

  // Standing at controls: hands on a lever and a wheel, small moves.
  drive(rig, s, state, dt, k) {
    const t = state.t;
    arm(rig.armR, -0.7 + Math.sin(t * 0.9) * 0.05, -0.2, -0.45, 0, k);
    arm(rig.armL, -0.8, 0.25, -0.55, 0, k);
    state.headTiltAdd = L(state.headTiltAdd, 0.08, k);
  },

  // Asleep where they are: head dropped, arms slack, slow breathing.
  sleep(rig, s, state, dt, k) {
    const t = state.t;
    arms(rig, s.sit ? -0.25 : 0.05, 0.1, s.sit ? -0.5 : -0.15, k);
    state.headTiltAdd = L(state.headTiltAdd, 0.75 + Math.sin(t * 0.8) * 0.03, k);
    rig.upper.rotation.x += (0.2 + Math.sin(t * 0.8) * 0.02) * k;
    state.headYawAdd = L(state.headYawAdd, 0.25, k);
  },

  shrug(rig, s, state, dt, k) {
    arms(rig, -0.35, 0.55, -1.6, k, 0.2);
    state.headTiltAdd = L(state.headTiltAdd, -0.1, k);
    rig.upper.rotation.z += 0.05 * k;
  },

  // Looking out of a window: turned a little, head up and to the side.
  gaze(rig, s, state, dt, k) {
    state.headYawAdd = L(state.headYawAdd, (s.gazeSide ?? 1) * 0.9, k);
    state.headTiltAdd = L(state.headTiltAdd, -0.08, k);
    micro(rig, s, state, dt, k * 0.5);
  },

  // Hunched, elbows on the knees, head in the hands.
  grieve(rig, s, state, dt, k) {
    arms(rig, -1.3, 0.12, -2.4, k, 0.1);
    rig.upper.rotation.x += 0.45 * k;
    state.headTiltAdd = L(state.headTiltAdd, 0.6, k);
  },

  // Playing a guitar: left hand up the neck, right hand strumming.
  guitar(rig, s, state, dt, k) {
    const t = state.t;
    arm(rig.armL, -0.9, 0.55, -1.9, 0.2, k);
    arm(rig.armR, -0.55 + Math.sin(t * 7) * 0.08, -0.15, -1.6 + Math.sin(t * 7) * 0.12, -0.2, k);
    state.headTiltAdd = L(state.headTiltAdd, 0.25 + Math.sin(t * 1.1) * 0.06, k);
    rig.upper.rotation.z += Math.sin(t * 1.7) * 0.03 * k;
  },

  // A dramatic pose for a photograph: one hand on the hip, the other raised, chin up.
  pose(rig, s, state, dt, k) {
    const t = state.t;
    arm(rig.armL, 0.3, 0.55, -1.4, 0.1, k);
    arm(rig.armR, -2.4 + Math.sin(t * 0.6) * 0.08, -0.7, -0.6, 0, k);
    state.headTiltAdd = L(state.headTiltAdd, -0.3, k);
    state.headYawAdd = L(state.headYawAdd, 0.35, k);
    rig.upper.rotation.z -= 0.08 * k;
  },

  // Holding a camera up to the eye.
  photo(rig, s, state, dt, k) {
    arm(rig.armR, -1.5, -0.25, -2.3, 0, k);
    arm(rig.armL, -1.4, 0.35, -2.2, 0, k);
    state.headTiltAdd = L(state.headTiltAdd, 0.1, k);
  },

  // Carrying a tall stack in both arms, leaning back a little under it.
  carryStack(rig, s, state, dt, k) {
    const t = state.t;
    arms(rig, -1.15, 0.15, -1.9, k, 0.3);
    rig.upper.rotation.x -= 0.12 * k;
    rig.upper.rotation.z += Math.sin(t * 2.3) * 0.02 * k;
  },

  // Eating with chopsticks: right hand up to the mouth now and then.
  eatSticks(rig, s, state, dt, k) {
    const t = state.t;
    const c = Math.max(0, Math.sin(t * 1.3)) ** 3;
    arm(rig.armR, -0.9 - c * 0.45, -0.2, -1.6 - c * 0.6, 0, k);
    arm(rig.armL, -0.5, 0.15, -1.1, 0.25, k);
    state.headTiltAdd = L(state.headTiltAdd, 0.15 * c, k);
  },

  none() {},
};

// Applies the current gesture (and fades the last one out). Called by the
// humanoid rig after its base pose each frame.
export function applyGesture(rig, s, state, dt) {
  const name = s.talking ? 'talk' : (s.gesture || 'fidget');
  state.headTiltAdd = state.headTiltAdd ?? 0; state.headYawAdd = state.headYawAdd ?? 0;
  if (state.gestName !== name) {
    if (state.gestName) state.gestPrev = { name: state.gestName, k: state.gestK || 0 };
    state.gestName = name; state.gestK = 0; state.micro = null; state.microT = 0.5 + Math.random() * 2;
  }
  state.gestK = L(state.gestK || 0, 1, Math.min(1, dt * 3.5));
  if (state.gestPrev) {
    state.gestPrev.k -= dt * 2.5;
    if (state.gestPrev.k <= 0) state.gestPrev = null;
    else { const G = GESTURES[state.gestPrev.name]; if (G && G !== GESTURES.fidget) G(rig, s, state, dt, state.gestPrev.k); }
  }
  const G = GESTURES[name];
  // Walking keeps the arms; only the head and body layers apply.
  const k = state.gestK * (s.moving ? 0.25 : 1);
  if (G) G(rig, s, state, dt, k);
  // Additive head offsets decay when nothing feeds them.
  state.headTiltAdd *= 1 - Math.min(1, dt * 2.5);
  state.headYawAdd *= 1 - Math.min(1, dt * 2.5);
}

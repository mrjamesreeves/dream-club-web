// Low-poly PS1 figures: a jointed humanoid rig, the lone arm, and the amalgam.
// Limbs are tapered 5-sided cylinders hung from joint groups so they bend.
import * as THREE from '../../vendor/three.module.js?v=9fadaff';
import { applyGesture } from './gestures.js?v=9fadaff';
import { createPS1Material, setVertexShade } from '../engine/ps1material.js?v=9fadaff';
import { paintFace, stylizeFace, wrapHead, FACE_PRESETS } from '../engine/faces.js?v=9fadaff';
import { buildSculptedHead } from './heads.js?v=9fadaff';
import { headAtlas } from '../engine/faces.js?v=9fadaff';
import { mergeStatic } from '../engine/merge.js?v=9fadaff';

function box(w, h, d, mats, shade = 1) {
  return new THREE.Mesh(setVertexShade(new THREE.BoxGeometry(w, h, d), shade), mats);
}

// A limb segment hanging down from its pivot: top radius r0, bottom radius r1.
function limb(len, r0, r1, mat, sides = 5, shade = 1) {
  const g = new THREE.CylinderGeometry(r0, r1, len, sides, 1, false);
  g.translate(0, -len / 2, 0);
  setVertexShade(g, shade);
  return new THREE.Mesh(g, mat);
}

// Box whose top is wider than its bottom (shoulders vs waist).
function taperedBox(w, h, d, topScale, bottomScale, mat, shade = 1) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 2, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    const k = bottomScale + (topScale - bottomScale) * t;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * (0.85 + 0.15 * k));
  }
  g.computeVertexNormals();
  setVertexShade(g, shade);
  return new THREE.Mesh(g, mat);
}

export function makeBlobShadow(ctx, size = 0.7) {
  const m = createPS1Material(ctx.env, { map: ctx.T.blob, color: '#000000', unlit: true, transparent: true, opacity: 0.55, depthWrite: false, alphaTest: 0.5 });
  const mesh = new THREE.Mesh(setVertexShade(new THREE.PlaneGeometry(size, size), 1), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = 1;
  return mesh;
}

// A box that widens toward +z (knuckles) and narrows toward the wrist.
function wedgeBox(w, h, d, frontScale, backScale, mat, shade = 1) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getZ(i) + d / 2) / d;
    const k = backScale + (frontScale - backScale) * t;
    p.setX(i, p.getX(i) * k);
  }
  g.computeVertexNormals();
  setVertexShade(g, shade);
  return new THREE.Mesh(g, mat);
}

// A finger segment pointing +z from its pivot: tapered, 5-sided.
function fingerSeg(len, r0, r1, mat, sides = 5) {
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, false);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  setVertexShade(g, 1);
  return new THREE.Mesh(g, mat);
}

// Spindly hand. Origin at the wrist, palm along +z, back of the hand +y.
// Four fingers and a thumb, each with two joints, pointed nails at the tips.
export function buildHand(ctx, skinMat, scale = 1, opts = {}) {
  const nailMat = opts.nails === false ? skinMat : createPS1Material(ctx.env, { map: ctx.T.nail, color: opts.nailColor || '#ff6a7a' });
  const hand = new THREE.Group();
  const palm = wedgeBox(0.058, 0.02, 0.085, 1.35, 0.85, skinMat); palm.position.z = 0.0425; hand.add(palm);
  const fingers = [];
  const spec = [[-0.03, 0.055, 0.045], [-0.01, 0.062, 0.05], [0.01, 0.06, 0.048], [0.03, 0.045, 0.036]];
  for (const [x, l1, l2] of spec) {
    const j1 = new THREE.Group(); j1.position.set(x, 0.002, 0.085);
    j1.add(fingerSeg(l1, 0.0105, 0.0085, skinMat));
    const j2 = new THREE.Group(); j2.position.z = l1; j1.add(j2);
    j2.add(fingerSeg(l2, 0.0085, 0.0055, skinMat));
    const nail = fingerSeg(0.028, 0.006, 0.0012, nailMat, 4); nail.position.set(0, 0.003, l2 - 0.006); j2.add(nail);
    hand.add(j1); fingers.push({ j1, j2 });
  }
  const t1 = new THREE.Group(); t1.position.set(0.038, -0.002, 0.03); t1.rotation.y = -0.85; t1.rotation.z = 0.3;
  t1.add(fingerSeg(0.045, 0.012, 0.0095, skinMat));
  const t2 = new THREE.Group(); t2.position.z = 0.045; t2.rotation.y = -0.35; t1.add(t2);
  t2.add(fingerSeg(0.04, 0.0095, 0.006, skinMat));
  const tn = fingerSeg(0.024, 0.0065, 0.0012, nailMat, 4); tn.position.set(0, 0.003, 0.034); t2.add(tn);
  hand.add(t1);
  hand.scale.setScalar(scale);
  // curl: 0 = open, 1 = clenched. spread: fan the fingers a little.
  function curl(amount, spread = 0) {
    fingers.forEach(({ j1, j2 }, i) => {
      j1.rotation.x = 0.15 + 1.1 * amount;
      j2.rotation.x = 0.2 + 1.3 * amount;
      j1.rotation.y = (i - 1.5) * 0.12 * spread;
    });
    t1.rotation.x = 0.1 + 0.6 * amount;
    t2.rotation.x = 0.15 + 0.9 * amount;
  }
  curl(0.15);
  hand.userData.curl = curl;
  return hand;
}

// Arm chain hanging from a shoulder group: upper arm -> elbow -> forearm -> wrist -> hand.
let ctxRef = null;
function buildArmChain(skin, sleeve, { upper = 0.3, fore = 0.28, r = 0.05, handMat, shade = 1, keepFingers = false, sleeveTop } = {}) {
  const shoulder = new THREE.Group();
  shoulder.add(limb(upper, r * 1.08, r * 0.88, sleeveTop || sleeve, 6, shade));
  const elbow = new THREE.Group(); elbow.position.y = -upper; shoulder.add(elbow);
  elbow.add(limb(fore, r * 0.86, r * 0.66, sleeve, 6, shade));
  const wrist = new THREE.Group(); wrist.position.y = -fore; elbow.add(wrist);
  const hand = buildHand(ctxRef, handMat || skin, 0.95, { nails: false }); hand.rotation.x = Math.PI / 2; wrist.add(hand);
  if (!keepFingers) mergeStatic(hand, () => false);
  return { shoulder, elbow, wrist, hand };
}

// Leg chain hanging from a hip group: thigh -> knee -> shin -> ankle -> foot.
function buildLegChain(cloth, shoe, { thigh = 0.42, shin = 0.42, r = 0.065, shade = 1, clothLower } = {}) {
  const hip = new THREE.Group();
  hip.add(limb(thigh, r * 1.05, r * 0.82, cloth, 6, shade));
  const knee = new THREE.Group(); knee.position.y = -thigh; hip.add(knee);
  knee.add(limb(shin, r * 0.82, r * 0.6, clothLower || cloth, 6, shade));
  const ankle = new THREE.Group(); ankle.position.y = -shin; knee.add(ankle);
  const foot = wedgeBox(0.09, 0.07, 0.25, 0.85, 1.0, shoe, shade); foot.position.set(0, -0.035, 0.05); ankle.add(foot);
  return { hip, knee, ankle, foot };
}

const SKIN_HEX = { skin: '#c69a78', skinPale: '#dcc6b4', skinTan: '#b07850', skinDeep: '#7a4e34' };
const HAIR_HEX = { hairDark: '#2a221e', hairBlack: '#161214', hairBrown: '#4a3222', hairGrey: '#9a948a', hairWhite: '#cfc9bf' };

// look: { skin, face, hair, top, bottom, hat, skirt, headStyle, faceStyle }  (texture names / flags)
export function buildHumanoid(ctx, look = {}) {
  ctxRef = ctx;
  const T = ctx.T;
  const mat = (name, extra) => createPS1Material(ctx.env, { map: T[name] || T.skin, ...extra });
  const skin = mat(look.skin || 'skin');
  let faceTex = look.facePhoto || ((look.face && typeof look.face === 'object') ? paintFace({ skin: look.skinColor, ...look.face }) : (T[look.face] || T.faceYoungMan));
  if (look.faceStyle && look.faceStyle !== 'painted') faceTex = stylizeFace(faceTex, look.faceStyle);
  const face = createPS1Material(ctx.env, { map: faceTex });
  // The face is repainted for its states (lids down, a glance, the mouth
  // open) and cached, so blinking and talking swap textures, never pixels.
  // A face given as an object, or named from the presets (the default is the
  // young man), can be repainted; a photograph cannot.
  const faceSpec = look.facePhoto ? null
    : (look.face && typeof look.face === 'object') ? { skin: look.skinColor, ...look.face }
    : FACE_PRESETS[look.face || 'faceYoungMan'] ? { ...FACE_PRESETS[look.face || 'faceYoungMan'], ...(look.skinColor ? { skin: look.skinColor } : {}) } : null;
  const faceCache = new Map();
  const faceFrame = (key, extra) => {
    if (!faceSpec) return faceTex;
    let t = faceCache.get(key);
    if (!t) { t = paintFace({ ...faceSpec, ...extra }); if (look.faceStyle && look.faceStyle !== 'painted') t = stylizeFace(t, look.faceStyle); faceCache.set(key, t); }
    return t;
  };
  const hair = mat(look.hair || 'hairDark');
  // Clothes are painted sheets: the folds, collar, buttons, cuffs and hems
  // live in the texture (see T.garment), one per face of the body.
  const topName = look.top || 'coat', bottomName = look.bottom || 'trousers';
  const gm = (name, kind) => createPS1Material(ctx.env, { map: T.garment(name, kind) });
  const dressy = !!look.skirt;
  const top = gm(topName, 'back');
  const topFront = gm(topName, dressy ? 'dressFront' : 'front'), topSide = gm(topName, 'sleeveTop');
  const sleeve = gm(topName, 'sleeve'), sleeveTop = gm(topName, 'sleeveTop');
  const bottom = gm(bottomName, 'legUpper'), bottomLower = gm(bottomName, 'legLower');
  const shoes = mat('shoe');

  const root = new THREE.Group();
  const rig = {};

  // Proportions: feet at 0, hips 0.92, shoulders 1.52, head centre 1.75.
  const HIP = 0.92, SHOULDER = 1.52;
  rig.legL = buildLegChain(bottom, shoes, { clothLower: bottomLower }); rig.legL.hip.position.set(-0.085, HIP, 0);
  rig.legR = buildLegChain(bottom, shoes, { clothLower: bottomLower }); rig.legR.hip.position.set(0.085, HIP, 0);
  root.add(rig.legL.hip, rig.legR.hip);

  const pelvis = taperedBox(0.3, 0.16, 0.18, 1.0, 0.9, bottom); pelvis.position.y = HIP + 0.04; root.add(pelvis);
  if (!dressy) { const belt = box(0.31, 0.045, 0.19, mat('belt')); belt.position.y = HIP + 0.11; root.add(belt); }
  if (look.skirt) {
    const skirt = limb(0.62, 0.15, 0.22, bottom, 6); skirt.position.y = HIP + 0.1; root.add(skirt);
    rig.skirt = skirt;
  }
  // Everything above the hips hangs from one pivot so the body can lean and slump.
  const upper = new THREE.Group(); upper.position.y = HIP + 0.08; root.add(upper); rig.upper = upper;
  const U = (y) => y - (HIP + 0.08);
  // Torso in two pieces, chest over waist, so it reads as a body and not a crate.
  const bodyMats = [topSide, topSide, top, top, topFront, top];
  const torso = taperedBox(0.33, 0.5, 0.2, 1.16, 0.8, bodyMats); torso.position.y = U(HIP + 0.37); upper.add(torso); rig.torso = torso;
  const chest = taperedBox(0.35, 0.2, 0.21, 1.0, 1.06, bodyMats); chest.position.y = U(SHOULDER - 0.1); chest.position.z = 0.005; upper.add(chest);
  for (const sx of [-1, 1]) { const pad = taperedBox(0.11, 0.07, 0.15, 0.75, 1.0, top, 0.7); pad.position.set(sx * 0.19, U(SHOULDER + 0.015), 0); upper.add(pad); }

  rig.armL = buildArmChain(skin, sleeve, { sleeveTop }); rig.armL.shoulder.position.set(-0.21, U(SHOULDER), 0);
  rig.armR = buildArmChain(skin, sleeve, { sleeveTop }); rig.armR.shoulder.position.set(0.21, U(SHOULDER), 0);
  upper.add(rig.armL.shoulder, rig.armR.shoulder);
  if (look.prop === 'roller' || look.prop === 'tray' || look.prop === 'needle') rig.holdsProp = true;
  if (look.prop === 'roller') {
    const pole = box(0.03, 0.5, 0.03, mat('metal')); pole.position.set(0, -0.1, 0.02);
    const head = box(0.16, 0.05, 0.05, mat('shirt')); head.position.set(0, 0.16, 0.02);
    rig.armR.wrist.add(pole, head);
  }
  if (look.prop === 'tray') {
    // Held level on the palm when the forearm is raised (see carry pose).
    const tray = new THREE.Group(); tray.position.set(0, -0.06, 0.12); tray.rotation.x = 1.75;
    const plate = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 10), 1), mat('metal'));
    tray.add(plate);
    for (const [dx, dz, c] of [[-0.07, 0.03, 'shirt'], [0.08, -0.04, 'cream']]) {
      const d = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.06, 0.05, 0.03, 8), 1), mat(c)); d.position.set(dx, 0.02, dz); tray.add(d);
    }
    const gl = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.025, 0.022, 0.1, 6), 1), mat('shirt')); gl.position.set(0.02, 0.05, 0.1); tray.add(gl);
    rig.armR.wrist.add(tray);
  }
  if (look.prop === 'glass') {
    // A wine glass held by the stem. It is kept upright every frame (see pose).
    const gm = createPS1Material(ctx.env, { map: T.white, color: '#c8d4d8', transparent: true, opacity: 0.6, depthWrite: false });
    const glass = new THREE.Group();
    const base = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.028, 0.03, 0.005, 8), 1), gm); base.position.y = -0.05; glass.add(base);
    const stem = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.004, 0.005, 0.06, 5), 1), gm); stem.position.y = -0.02; glass.add(stem);
    const bowl = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.032, 0.012, 0.075, 7, 1, true), 1), gm); bowl.position.y = 0.047; glass.add(bowl);
    const wine = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.024, 0.013, 0.035, 7), 1), createPS1Material(ctx.env, { map: T.white, color: look.drink || '#6a1a2a' })); wine.position.y = 0.03; glass.add(wine);
    glass.position.set(0, -0.06, 0.05);
    rig.armR.wrist.add(glass);
    rig.glass = glass;
    rig.holdsGlass = true;
  }
  if (look.prop === 'guitar') {
    const wood = createPS1Material(ctx.env, { map: T.wood, color: '#c89050' }), darkWood = createPS1Material(ctx.env, { map: T.woodDark });
    const g = new THREE.Group(); g.position.set(0.02, U(HIP + 0.3), 0.2); g.rotation.set(0.15, 0, -0.45); upper.add(g);
    const body1 = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 10), 1), wood); body1.rotation.x = Math.PI / 2; body1.position.y = -0.09; g.add(body1);
    const body2 = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.14, 0.14, 0.07, 10), 1), wood); body2.rotation.x = Math.PI / 2; body2.position.y = 0.1; g.add(body2);
    const hole = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 8), 1), createPS1Material(ctx.env, { map: T.white, color: '#141210' })); hole.rotation.x = Math.PI / 2; hole.position.set(0, 0.02, 0.04); g.add(hole);
    const neck = box(0.05, 0.55, 0.03, darkWood); neck.position.set(0, 0.42, 0.015); g.add(neck);
    const head = box(0.07, 0.1, 0.03, darkWood); head.position.set(0, 0.73, 0.015); g.add(head);
    for (let i = 0; i < 4; i++) { const str = box(0.003, 0.9, 0.002, createPS1Material(ctx.env, { map: T.white, color: '#e8e0c0' })); str.position.set(-0.015 + i * 0.01, 0.3, 0.045); g.add(str); }
    rig.holdsProp = true;
  }
  if (look.prop === 'cleaver') {
    // A cleaver in the left hand, blade down.
    const steel = createPS1Material(ctx.env, { map: T.chrome });
    const blade = box(0.012, 0.2, 0.13, steel); blade.position.set(0, -0.2, 0.1); rig.armL.wrist.add(blade);
    const handle = box(0.025, 0.13, 0.03, createPS1Material(ctx.env, { map: T.woodDark })); handle.position.set(0, -0.06, 0.1); rig.armL.wrist.add(handle);
  }
  if (look.prop === 'giftbox') {
    // A small wrapped box held in both hands at the chest.
    const gb = box(0.14, 0.1, 0.12, createPS1Material(ctx.env, { map: T.gingham, color: '#d8b0c0' })); gb.position.set(-0.1, -0.2, 0.06); rig.armR.wrist.add(gb);
    const ribbon = box(0.15, 0.02, 0.02, createPS1Material(ctx.env, { map: T.white, color: '#c02040' })); ribbon.position.set(-0.1, -0.145, 0.06); rig.armR.wrist.add(ribbon);
    rig.holdsBox = true;
  }
  if (look.prop === 'needle') {
    const needle = box(0.008, 0.12, 0.008, mat('shirt')); needle.position.set(0, -0.12, 0.03); rig.armR.wrist.add(needle);
  }

  const neck = limb(0.1, 0.045, 0.05, skin); neck.position.y = U(SHOULDER + 0.12); upper.add(neck);
  // Head: +z is the face. Hangs from a neck pivot so it can turn.
  const headPivot = new THREE.Group(); headPivot.position.y = U(SHOULDER + 0.1); upper.add(headPivot);
  // Head styles: 'box' (a tapered block, the face on its front), 'octagon'
  // (an eight-sided prism) and 'round' (a sphere of eight by six), the last
  // two wrapped in one strip with the face at the front.
  const headStyle = look.headStyle || 'box';
  const style = look.hairStyle || (look.skirt ? 'long' : 'short');
  let head;
  const skinHexOf = look.skinColor || (look.face && look.face.skin) || SKIN_HEX[look.skin] || '#c69a78';
  const hairHexOf = look.hairColor || (look.face && look.face.hair) || HAIR_HEX[look.hair] || '#2a221e';
  if (headStyle === 'box') {
    head = taperedBox(0.2, 0.25, 0.22, 1.0, 0.84, [skin, skin, hair, skin, face, hair]);
  } else if (headStyle === 'sculpt') {
    head = buildSculptedHead(ctx, { faceTex, skinHex: skinHexOf, hairHex: hairHexOf, bald: style === 'bald' });
  } else {
    const skinHex = look.skinColor || (look.face && look.face.skin) || SKIN_HEX[look.skin] || '#c69a78';
    const hairHex = look.hairColor || (look.face && look.face.hair) || HAIR_HEX[look.hair] || '#2a221e';
    const strip = createPS1Material(ctx.env, { map: wrapHead(faceTex, skinHex, hairHex, style === 'bald', headStyle === 'round' ? 0.42 : 0.25) });
    let geo;
    if (headStyle === 'round') { geo = new THREE.SphereGeometry(0.125, 8, 6); geo.scale(0.9, 1.0, 0.95); }
    else { geo = new THREE.CylinderGeometry(0.105, 0.098, 0.25, 8, 1, true, -Math.PI / 2, Math.PI * 2); geo.scale(1.0, 1.0, 1.05); }
    head = new THREE.Mesh(setVertexShade(geo, 1), strip);
    if (headStyle !== 'round') {
      const top = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.105, 0.105, 0.02, 8), 1), style === 'bald' ? skin : hair); top.position.y = 0.125; head.add(top);
      const bottom = new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.098, 0.098, 0.02, 8), 1), skin); bottom.position.y = -0.125; head.add(bottom);
    }
  }
  head.position.y = 0.14; headPivot.add(head);
  // How a new face frame reaches the head: straight onto the box's front, or
  // composed into the wrapped strip or the sculpted head's atlas.
  if (faceSpec) {
    const headMat = headStyle === 'box' ? face : head.material;
    const compose = headStyle === 'box' ? ((t) => t) : headStyle === 'sculpt' ? ((t) => headAtlas(t, skinHexOf, hairHexOf, style === 'bald')) : ((t) => wrapHead(t, skinHexOf, hairHexOf, style === 'bald', headStyle === 'round' ? 0.42 : 0.25));
    const composed = new Map();
    rig.face = { apply: (key, extra) => { let t = composed.get(key); if (!t) { t = compose(faceFrame(key, extra)); composed.set(key, t); } if (headMat.uniforms.uMap.value !== t) headMat.uniforms.uMap.value = t; }, key: 'idle' };
  }
  if (headStyle !== 'sculpt') { const nose = taperedBox(0.035, 0.05, 0.03, 0.7, 1.0, skin); nose.position.set(0, 0.125, 0.12); headPivot.add(nose); }
  for (const sx of [-1, 1]) {
    const ear = box(0.018, 0.05, 0.035, skin); ear.position.set(sx * 0.1, 0.14, -0.01); headPivot.add(ear);
  }
  if (style !== 'bald' && !(headStyle === 'sculpt' && style === 'short')) {
    if (headStyle === 'round') { const dome = new THREE.Mesh(setVertexShade(new THREE.SphereGeometry(0.131, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.5), 1), hair); dome.scale.set(0.9, 1.0, 0.95); dome.position.set(0, 0.14, 0); headPivot.add(dome); }
    else { const cap = box(0.215, 0.07, 0.235, hair); cap.position.set(0, 0.235, -0.01); headPivot.add(cap); }
    const back = box(0.21, style === 'long' ? 0.3 : 0.16, 0.06, hair); back.position.set(0, style === 'long' ? 0.1 : 0.17, -0.1); headPivot.add(back);
    if (style === 'long') {
      for (const sx of [-1, 1]) { const side = box(0.03, 0.26, 0.16, hair); side.position.set(sx * 0.11, 0.1, -0.04); headPivot.add(side); }
    }
    if (style === 'up') {
      // A tall 1960s set: volume on top and a swept back.
      const crown = taperedBox(0.24, 0.16, 0.25, 0.8, 1.0, hair); crown.position.set(0, 0.33, -0.02); headPivot.add(crown);
      const sweep = box(0.22, 0.2, 0.08, hair); sweep.position.set(0, 0.2, -0.13); headPivot.add(sweep);
      for (const sx of [-1, 1]) { const side = box(0.025, 0.14, 0.12, hair); side.position.set(sx * 0.11, 0.17, -0.05); headPivot.add(side); }
    }
    if (style === 'veil') {
      // Long wet hair hanging over the face.
      const front = box(0.21, 0.3, 0.04, hair); front.position.set(0, 0.09, 0.11); headPivot.add(front);
      for (const sx of [-1, 1]) { const side = box(0.04, 0.34, 0.2, hair); side.position.set(sx * 0.115, 0.06, -0.02); headPivot.add(side); }
      const back2 = box(0.2, 0.36, 0.05, hair); back2.position.set(0, 0.06, -0.11); headPivot.add(back2);
    }
    if (style === 'bob') {
      for (const sx of [-1, 1]) { const side = box(0.03, 0.2, 0.2, hair); side.position.set(sx * 0.115, 0.13, -0.02); headPivot.add(side); }
      const fringe = box(0.2, 0.05, 0.03, hair); fringe.position.set(0, 0.24, 0.1); headPivot.add(fringe);
    }
  }
  if (look.hat) {
    const hatMat = mat(look.hatTex || 'trousers');
    const brim = box(0.34, 0.025, 0.34, hatMat); brim.position.y = 0.265;
    const crown = taperedBox(0.21, 0.13, 0.22, 0.9, 1.0, hatMat); crown.position.y = 0.335;
    headPivot.add(brim, crown);
  }
  if (look.cap) {
    const capMat = mat(look.capTex || 'suit');
    const dome = taperedBox(0.22, 0.08, 0.24, 0.85, 1.0, capMat); dome.position.y = 0.27; headPivot.add(dome);
    const peak = box(0.2, 0.02, 0.1, capMat); peak.position.set(0, 0.235, 0.15); headPivot.add(peak);
  }
  if (look.glasses) {
    // Wire frames: two small rectangles, a bridge, and arms back to the ears.
    const fm = mat(look.glassesTex || 'dark');
    for (const sx of [-1, 1]) {
      const cx = sx * 0.05;
      for (const [w, h, ox, oy] of [[0.075, 0.01, 0, 0.026], [0.075, 0.01, 0, -0.022], [0.01, 0.05, -0.036, 0.002], [0.01, 0.05, 0.036, 0.002]]) {
        const b = box(w, h, 0.01, fm); b.position.set(cx + ox, 0.16 + oy, 0.118); headPivot.add(b);
      }
      const arm = box(0.008, 0.008, 0.2, fm); arm.position.set(sx * 0.103, 0.175, 0.02); headPivot.add(arm);
    }
    const bridge = box(0.03, 0.008, 0.01, fm); bridge.position.set(0, 0.172, 0.12); headPivot.add(bridge);
  }
  rig.head = headPivot; rig.neck = neck;
  if (look.shirtFront) {
    // Jacket open over a shirt and tie.
    const shirt = taperedBox(0.1, 0.42, 0.01, 1.2, 0.6, mat(look.shirtFront)); shirt.position.set(0, U(HIP + 0.4), 0.1); upper.add(shirt);
    if (look.tie) {
      const tie = taperedBox(0.035, 0.32, 0.012, 0.8, 1.3, createPS1Material(ctx.env, { map: T.white, color: look.tie })); tie.position.set(0, U(HIP + 0.43), 0.108); upper.add(tie);
    }
  }
  if (look.scarf) {
    const sm = createPS1Material(ctx.env, { map: T[look.scarfTex] || T.white, color: look.scarf });
    const wrap = taperedBox(0.17, 0.07, 0.15, 1.0, 1.1, sm); wrap.position.y = U(SHOULDER + 0.06); upper.add(wrap);
    for (const [sx, len] of [[-0.06, 0.42], [0.05, 0.3]]) {
      const tail = box(0.07, len, 0.02, sm); tail.position.set(sx, U(SHOULDER + 0.04) - len / 2, 0.11); tail.rotation.z = sx * 0.4; upper.add(tail);
    }
  }
  if (look.coatTails) {
    // A long coat below the waist: back and side panels to the knee, open at the front.
    const cm = mat(look.coatTails);
    const back = taperedBox(0.32, 0.58, 0.03, 1.0, 1.15, cm); back.position.set(0, HIP - 0.24, -0.1); root.add(back);
    for (const sx of [-1, 1]) {
      const side = taperedBox(0.03, 0.58, 0.18, 1.0, 1.1, cm); side.position.set(sx * 0.165, HIP - 0.24, -0.01); root.add(side);
      const flap = box(0.06, 0.56, 0.02, cm); flap.position.set(sx * 0.13, HIP - 0.25, 0.09); root.add(flap);
    }
    rig.coat = true;
  }
  root.add(makeBlobShadow(ctx, 0.7));

  const state = { phase: 0, moving: 0, wave: 0, sit: 0, slump: 0, paint: 0, carry: 0, reach: 0, crawl: 0, drinkT: Math.random() * 9, eatT: Math.random() * 6, t: Math.random() * 10, headYaw: 0, headPitch: 0,
    blinkAt: 1 + Math.random() * 4, blinkT: -1, glanceAt: 2 + Math.random() * 6, glanceT: -1, glanceDir: 1, mouthT: 0, mouth: 0 };
  const _t = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  // Eyes and mouth. A blink every few seconds (lids half, shut, half);
  // now and then a glance to one side, toward where the head is turning if
  // it is; while the character's line is being written out, the mouth
  // moves between closed, part open and wide.
  function animateFace(dt, s) {
    if (!rig.face) return;
    let blink = 0;
    if (state.blinkT >= 0) {
      state.blinkT += dt;
      blink = state.blinkT < 0.06 ? 0.5 : state.blinkT < 0.16 ? 1 : state.blinkT < 0.22 ? 0.5 : 0;
      if (state.blinkT > 0.22) { state.blinkT = -1; state.blinkAt = state.t + 2.2 + Math.random() * 4.5; }
    } else if (state.t > state.blinkAt) state.blinkT = 0;
    let gaze = 0;
    if (state.glanceT >= 0) {
      state.glanceT += dt; gaze = state.glanceDir;
      if (state.glanceT > 0.7 + Math.random() * 0.3) { state.glanceT = -1; state.glanceAt = state.t + 3 + Math.random() * 7; }
    } else if (state.t > state.glanceAt && !s.talking) { state.glanceT = 0; state.glanceDir = Math.abs(state.headYaw) > 0.25 ? Math.sign(state.headYaw) : (Math.random() < 0.5 ? -1 : 1); }
    let mouth = 0;
    if (s.typing) {
      state.mouthT -= dt;
      if (state.mouthT <= 0) { state.mouth = Math.random() < 0.3 ? 0 : Math.random() < 0.55 ? 1 : 2; state.mouthT = 0.07 + Math.random() * 0.09; }
      mouth = state.mouth;
    } else state.mouth = 0;
    const key = `b${blink}g${gaze}m${mouth}`;
    if (key !== rig.face.key) { rig.face.key = key; rig.face.apply(key, { blink, gaze: [gaze * 0.9, 0], mouthOpen: mouth * 0.5 }); }
  }

  function pose(dt, s) {
    state.t += dt;
    const t = state.t;
    animateFace(dt, s);
    // A held glass stays upright whatever the arm does.
    if (rig.glass) { rig.armR.wrist.getWorldQuaternion(_q); rig.glass.quaternion.copy(_q).invert(); }
    state.moving = THREE.MathUtils.lerp(state.moving, s.moving ? 1 : 0, dt * 6);
    state.wave = THREE.MathUtils.lerp(state.wave, s.wave ? 1 : 0, dt * 4);
    state.sit = THREE.MathUtils.lerp(state.sit, s.sit ? 1 : 0, dt * 5);
    state.slump = THREE.MathUtils.lerp(state.slump, s.slump ? 1 : 0, dt * (s.slumpRate ?? 1.2));
    state.paint = THREE.MathUtils.lerp(state.paint, s.paint ? 1 : 0, dt * 4);
    state.carry = THREE.MathUtils.lerp(state.carry, s.carry ? 1 : 0, dt * 4);
    state.reach = THREE.MathUtils.lerp(state.reach, s.reach ? 1 : 0, dt * (s.reach ? 7 : 3));
    state.crawl = THREE.MathUtils.lerp(state.crawl, s.crawl ? 1 : 0, dt * 4);
    if (s.moving) state.phase += dt * 6.5;
    const m = state.moving, p = state.phase;
    const sit = state.sit, slump = state.slump, paint = state.paint;

    // Legs: thigh swings, knee bends while the leg comes forward.
    const legs = [[rig.legL, 0], [rig.legR, Math.PI]];
    for (const [leg, off] of legs) {
      const sw = Math.sin(p + off);
      leg.hip.rotation.x = -sw * 0.55 * m;
      leg.knee.rotation.x = (Math.max(0, Math.sin(p + off + 1.1)) * 0.9 + 0.08) * m + 0.04;
      leg.ankle.rotation.x = -leg.knee.rotation.x * 0.4;
    }
    // Arms swing opposite to the legs; elbows keep a slight bend.
    const armSwing = Math.sin(p) * 0.45 * m;
    rig.armL.shoulder.rotation.x = -armSwing;
    rig.armL.shoulder.rotation.z = 0.08 + Math.sin(t * 1.1) * 0.015;
    rig.armL.elbow.rotation.x = -(0.25 + Math.max(0, -armSwing) * 0.8);
    const w = state.wave;
    rig.armR.shoulder.rotation.x = armSwing * (1 - w);
    rig.armR.shoulder.rotation.z = THREE.MathUtils.lerp(-0.08 - Math.sin(t * 1.1) * 0.015, 2.5, w);
    rig.armR.elbow.rotation.x = -(0.25 + Math.max(0, -armSwing * (1 - w)) * 0.8);
    rig.armR.elbow.rotation.z = THREE.MathUtils.lerp(0, 0.9 + Math.sin(t * 7) * 0.35, w);

    // Sitting: thighs forward, shins down, body dropped to the seat.
    if (sit > 0.01) {
      for (const [leg] of legs) {
        leg.hip.rotation.x = THREE.MathUtils.lerp(leg.hip.rotation.x, -Math.PI / 2 + 0.1, sit);
        leg.knee.rotation.x = THREE.MathUtils.lerp(leg.knee.rotation.x, Math.PI / 2 - 0.15, sit);
        leg.ankle.rotation.x = THREE.MathUtils.lerp(leg.ankle.rotation.x, 0.1, sit);
      }
      // Hands resting in the lap.
      for (const [arm, side] of [[rig.armL, 1], [rig.armR, -1]]) {
        arm.shoulder.rotation.x = THREE.MathUtils.lerp(arm.shoulder.rotation.x, -0.32, sit * (1 - w));
        arm.shoulder.rotation.z = THREE.MathUtils.lerp(arm.shoulder.rotation.z, side * 0.1, sit * (1 - w));
        arm.elbow.rotation.x = THREE.MathUtils.lerp(arm.elbow.rotation.x, -0.95, sit * (1 - w));
        arm.elbow.rotation.z = THREE.MathUtils.lerp(arm.elbow.rotation.z, side * 0.3, sit * (1 - w));
      }
      if (rig.skirt) rig.skirt.scale.y = 1 - 0.55 * sit;
    }
    // Painting: right arm up and down a wall with the roller.
    if (paint > 0.01) {
      rig.armR.shoulder.rotation.x = THREE.MathUtils.lerp(rig.armR.shoulder.rotation.x, -2.2 + Math.sin(t * 2.2) * 0.6, paint);
      rig.armR.elbow.rotation.x = THREE.MathUtils.lerp(rig.armR.elbow.rotation.x, -0.4 + Math.sin(t * 2.2) * 0.3, paint);
      rig.armR.shoulder.rotation.z = THREE.MathUtils.lerp(rig.armR.shoulder.rotation.z, -0.1, paint);
    }
    // Carrying a tray: right forearm held level in front.
    if (state.carry > 0.01) {
      const c = state.carry;
      rig.armR.shoulder.rotation.x = THREE.MathUtils.lerp(rig.armR.shoulder.rotation.x, -0.35, c);
      rig.armR.shoulder.rotation.z = THREE.MathUtils.lerp(rig.armR.shoulder.rotation.z, -0.1, c);
      rig.armR.elbow.rotation.x = THREE.MathUtils.lerp(rig.armR.elbow.rotation.x, -1.4, c);
      rig.armR.elbow.rotation.z = THREE.MathUtils.lerp(rig.armR.elbow.rotation.z, 0, c);
    }
    // Playing the piano: both forearms forward, hands rising and falling.
    if (s.play) {
      for (const [arm, ph] of [[rig.armL, 0], [rig.armR, 1.7]]) {
        arm.shoulder.rotation.x = -0.75 + Math.sin(t * 3.1 + ph) * 0.06;
        arm.elbow.rotation.x = -0.9 + Math.sin(t * 5.3 + ph) * 0.12;
        arm.shoulder.rotation.z = (arm === rig.armL ? 1 : -1) * (0.05 + Math.sin(t * 0.7 + ph) * 0.12);
      }
      s.headTilt = 0.2 + Math.sin(t * 0.9) * 0.05;
      rig.upper.rotation.z = Math.sin(t * 0.6) * 0.04;
    }
    // Eating: every few seconds the right hand comes up to the mouth.
    if (s.eat) {
      state.eatT += dt;
      const cyc = state.eatT % (s.eatPeriod ?? 6.5);
      const k = cyc < 1.6 ? Math.sin((cyc / 1.6) * Math.PI) : 0;
      rig.armR.shoulder.rotation.x = THREE.MathUtils.lerp(rig.armR.shoulder.rotation.x, -1.15, k);
      rig.armR.elbow.rotation.x = THREE.MathUtils.lerp(rig.armR.elbow.rotation.x, -2.0, k);
      rig.armR.shoulder.rotation.z = THREE.MathUtils.lerp(rig.armR.shoulder.rotation.z, 0.12, k);
      s.headTilt = 0.18 * (1 - k);
    }
    if (rig.holdsBox && !s.moving && !state.crawl) {
      for (const arm of [rig.armL, rig.armR]) { arm.shoulder.rotation.x = -0.7; arm.elbow.rotation.x = -1.5; arm.elbow.rotation.z = 0; }
      rig.armL.shoulder.rotation.z = 0.25; rig.armR.shoulder.rotation.z = -0.25;
    }
    // Holding a drink: the glass stays up, and comes to the mouth now and then.
    if (rig.holdsGlass && !s.moving) {
      state.drinkT += dt;
      const cyc = state.drinkT % (s.drinkPeriod ?? 9);
      const k = cyc < 1.8 ? Math.sin((cyc / 1.8) * Math.PI) : 0;
      rig.armR.shoulder.rotation.x = THREE.MathUtils.lerp(-0.55, -1.1, k);
      rig.armR.elbow.rotation.x = THREE.MathUtils.lerp(-1.5, -2.1, k);
      rig.armR.shoulder.rotation.z = -0.15;
      rig.armR.elbow.rotation.z = 0;
      s.headTilt = -0.12 * k;
    }
    // Body: step bounce, idle sway and breathing, sit drop, slump.
    const bounce = Math.abs(Math.sin(p)) * 0.03 * m;
    root.position.y = bounce - sit * (HIP - (s.seatHeight ?? 0.45));
    rig.upper.rotation.z = Math.sin(t * 0.9) * 0.02 * (1 - m) + Math.sin(p) * 0.03 * m + (s.slumpDir ?? -1) * 1.15 * slump;
    rig.upper.rotation.x = 0.03 * m + 0.15 * sit + 0.25 * slump + (s.lean ?? 0) + (s.reachLean ?? 0.9) * state.reach;
    state.twist = THREE.MathUtils.lerp(state.twist ?? 0, s.twist ?? 0, dt * 3);
    rig.upper.rotation.y = state.twist;
    rig.torso.scale.y = 1 + Math.sin(t * 1.4) * 0.01 * (1 - slump);
    // Crawling: down on hands and knees, the hair hanging, head up to see.
    if (state.crawl > 0.01) {
      const c = state.crawl, crawlM = s.moving ? 1 : 0;
      const ph = state.phase;
      root.position.y = THREE.MathUtils.lerp(root.position.y, -(HIP - 0.48), c);
      rig.upper.rotation.x = THREE.MathUtils.lerp(rig.upper.rotation.x, 1.35, c);
      if (rig.skirt) { rig.skirt.scale.y = 1 - 0.7 * c; rig.skirt.rotation.x = 1.2 * c; rig.skirt.position.z = 0.1 * c; }
      for (const [leg, off] of legs) {
        leg.hip.rotation.x = THREE.MathUtils.lerp(leg.hip.rotation.x, -1.5 + Math.sin(ph + off) * 0.35 * crawlM, c);
        leg.knee.rotation.x = THREE.MathUtils.lerp(leg.knee.rotation.x, 1.6, c);
        leg.ankle.rotation.x = THREE.MathUtils.lerp(leg.ankle.rotation.x, 0.9, c);
      }
      for (const [arm, off] of [[rig.armL, Math.PI], [rig.armR, 0]]) {
        arm.shoulder.rotation.x = THREE.MathUtils.lerp(arm.shoulder.rotation.x, -1.5 + 0.05 + Math.sin(ph + off) * 0.4 * crawlM, c);
        arm.shoulder.rotation.z = THREE.MathUtils.lerp(arm.shoulder.rotation.z, (arm === rig.armL ? 0.12 : -0.12), c);
        arm.elbow.rotation.x = THREE.MathUtils.lerp(arm.elbow.rotation.x, -0.1, c);
        arm.elbow.rotation.z = 0;
      }
      s.headTilt = (s.headTilt || 0) - 1.0 * c;
    }
    if (slump > 0.01) {
      rig.head.rotation.z = (s.slumpDir ?? -1) * 0.6 * slump;
      rig.armL.shoulder.rotation.z = THREE.MathUtils.lerp(rig.armL.shoulder.rotation.z, 0.9, slump);
      rig.armR.shoulder.rotation.z = THREE.MathUtils.lerp(rig.armR.shoulder.rotation.z, -0.5, slump);
      rig.armL.elbow.rotation.x = THREE.MathUtils.lerp(rig.armL.elbow.rotation.x, -0.2, slump);
      rig.armR.elbow.rotation.x = THREE.MathUtils.lerp(rig.armR.elbow.rotation.x, -0.2, slump);
    } else {
      rig.head.rotation.z = 0;
    }
    // Reaching: lean over and point the right arm, elbow straight, at a
    // world point; the left hand braces on the table.
    if (state.reach > 0.01) {
      const k = state.reach;
      if (s.reach) state.reachAt = s.reach;
      rig.upper.updateWorldMatrix(true, false);
      rig.upper.worldToLocal(_t.copy(state.reachAt)).sub(rig.armR.shoulder.position).normalize();
      const a = Math.atan2(-_t.z, -_t.y), c = Math.asin(THREE.MathUtils.clamp(_t.x, -1, 1));
      rig.armR.shoulder.rotation.x = THREE.MathUtils.lerp(rig.armR.shoulder.rotation.x, a, k);
      rig.armR.shoulder.rotation.z = THREE.MathUtils.lerp(rig.armR.shoulder.rotation.z, c, k);
      rig.armR.elbow.rotation.x = THREE.MathUtils.lerp(rig.armR.elbow.rotation.x, -0.04, k);
      rig.armR.elbow.rotation.z = THREE.MathUtils.lerp(rig.armR.elbow.rotation.z, 0, k);
      rig.armL.shoulder.rotation.x = THREE.MathUtils.lerp(rig.armL.shoulder.rotation.x, -0.5, k);
      rig.armL.shoulder.rotation.z = THREE.MathUtils.lerp(rig.armL.shoulder.rotation.z, 0.25, k);
      rig.armL.elbow.rotation.x = THREE.MathUtils.lerp(rig.armL.elbow.rotation.x, -0.5, k);
    }

    // Gestures: what the hands and head do on top of all that. Props in the
    // right hand, painting, reaching, crawling and slumping keep their arms.
    if (!rig.holdsGlass && !rig.holdsBox && !rig.holdsProp && !s.paint && !s.play && state.reach < 0.01 && state.crawl < 0.01 && slump < 0.01 && !s.carry) applyGesture(rig, s, state, dt);
    // Head turns toward a point of interest (the player), within limits.
    let ty = 0, tp = 0;
    if (s.lookAt) { ty = THREE.MathUtils.clamp(s.lookAt.yaw, -1.1, 1.1); tp = THREE.MathUtils.clamp(s.lookAt.pitch, -0.5, 0.5); }
    state.headYaw = THREE.MathUtils.lerp(state.headYaw, ty, dt * 4);
    state.headPitch = THREE.MathUtils.lerp(state.headPitch, tp, dt * 4);
    rig.head.rotation.y = state.headYaw + (state.headYawAdd || 0);
    rig.head.rotation.x = state.headPitch + (s.headTilt || 0) + 0.5 * slump + (state.headTiltAdd || 0);
  }
  return { root, rig, pose, hitRadius: 0.5, hitHeight: 1.8 };
}

// A woman's arm lying on the ground, the rest of her in darkness. Hand toward +z.
export function buildArm(ctx) {
  ctxRef = ctx;
  const skin = createPS1Material(ctx.env, { map: ctx.T.skinPale });
  const root = new THREE.Group();
  // Forearm from the wrist back into the dark (-z), upper arm beyond it, bent at the elbow.
  const fore = new THREE.CylinderGeometry(0.052, 0.034, 0.46, 5, 1, false); fore.rotateX(-Math.PI / 2); fore.translate(0, 0, -0.23); setVertexShade(fore, 0.65);
  const forearm = new THREE.Mesh(fore, skin); forearm.position.set(0, 0.045, -0.02); root.add(forearm);
  const elbow = new THREE.Group(); elbow.position.set(0, 0.06, -0.48); elbow.rotation.y = 0.55; elbow.rotation.x = 0.2; root.add(elbow);
  const up = new THREE.CylinderGeometry(0.06, 0.052, 0.5, 5, 1, false); up.rotateX(-Math.PI / 2); up.translate(0, 0, -0.25); setVertexShade(up, 0.2);
  elbow.add(new THREE.Mesh(up, skin));
  const hand = buildHand(ctx, skin, 1.15, { nailColor: '#ff3a52' }); hand.position.set(0, 0.03, 0.0); hand.rotation.x = 0.08; root.add(hand);
  hand.userData.curl(0.25, 0.6);
  const state = { t: 0, twitch: 0, nextTwitch: 1, curl: 0.25 };
  function pose(dt, s) {
    state.t += dt;
    if (s.stir) {
      state.nextTwitch -= dt;
      if (state.nextTwitch <= 0) {
        state.nextTwitch = 0.8 + Math.random() * 2.5;
        state.twitch = 1;
        ctx.audio.stir();
      }
      state.twitch = Math.max(0, state.twitch - dt * 2.5);
      const c = 0.25 + Math.sin(state.t * 30) * 0.35 * state.twitch + 0.3 * state.twitch;
      hand.userData.curl(Math.max(0, c), 0.6 + 0.4 * state.twitch);
      hand.rotation.z = Math.sin(state.t * 40) * 0.12 * state.twitch;
      hand.rotation.x = 0.08 - 0.3 * state.twitch;
    }
  }
  return { root, pose, hand, hitRadius: 0.5, hitHeight: 0.3 };
}

// Two legs, something of a torso, another arm, and a long arm where the head should be.
export function buildAmalgam(ctx) {
  ctxRef = ctx;
  const skin = createPS1Material(ctx.env, { map: ctx.T.skinPale });
  const skinDark = createPS1Material(ctx.env, { map: ctx.T.skinPale, color: '#b09a90' });
  const bone = createPS1Material(ctx.env, { map: ctx.T.skinPale, color: '#d8ccc0' });
  const cloth = createPS1Material(ctx.env, { map: ctx.T.dress });
  const root = new THREE.Group();

  // A body of four segments lying along +z (the way it crawls), each hung
  // from the one behind so the spine can ripple. Pelvis -> belly -> ribs ->
  // a hump of shoulders. Each lump overlaps the next so there are no gaps.
  const lump = (w, h, len, front, back, mat) => {
    const m = taperedBox(w, len, h, front, back, mat);
    m.rotation.x = Math.PI / 2; // taper runs back (-z) to front (+z)
    return m;
  };
  const spine = [];
  const seg = (parent, pos, mesh) => {
    const g = new THREE.Group(); g.position.set(...pos); parent.add(g);
    if (mesh) g.add(mesh);
    spine.push(g); return g;
  };
  const pelvis = seg(root, [0, 0.19, -0.3], lump(0.3, 0.19, 0.3, 1.0, 0.8, skinDark), 2);
  const belly = seg(pelvis, [0, 0.01, 0.2], lump(0.27, 0.18, 0.28, 1.1, 0.95, skin), 2);
  const ribs = seg(belly, [0, 0.03, 0.22], lump(0.34, 0.24, 0.32, 1.12, 0.9, skin), 3);
  // Ribs showing through on both sides.
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const rib = box(0.02, 0.03, 0.2, bone); rib.position.set(sx * 0.17, 0.02 - i * 0.03, -0.04 + i * 0.06); rib.rotation.set(0, sx * 0.25, sx * 0.5); ribs.add(rib);
  }
  // What's left of her dress, torn across the ribs.
  const rag = lump(0.38, 0.12, 0.26, 0.9, 1.15, cloth); rag.position.set(0.02, 0.07, -0.02); rag.rotation.z = 0.12; ribs.add(rag);
  const scrap = box(0.12, 0.02, 0.22, cloth); scrap.position.set(-0.18, -0.06, -0.06); scrap.rotation.set(0.3, 0.2, 1.1); ribs.add(scrap);
  const hump = seg(ribs, [0, 0.04, 0.22], lump(0.4, 0.22, 0.22, 0.85, 1.1, skin), 2);

  // Legs trail behind from the pelvis, each with a knee that kicks.
  const legs = [];
  for (const [x, thigh, shin] of [[-0.12, 0.42, 0.45], [0.12, 0.4, 0.38]]) {
    const leg = buildLegChain(skinDark, skin, { thigh, shin, r: 0.06 });
    leg.hip.position.set(x, -0.02, -0.08);
    leg.hip.rotation.x = Math.PI / 2 - 0.15; // thigh points back along the ground
    pelvis.add(leg.hip); legs.push(leg);
  }
  // A side arm that flails, from the right of the hump.
  const side = buildArmChain(skin, skin, { upper: 0.28, fore: 0.26, r: 0.045, keepFingers: true });
  side.shoulder.position.set(0.2, 0.02, 0.02);
  side.shoulder.rotation.z = 1.9;
  const sideHand = side.hand; sideHand.scale.setScalar(1.05);
  hump.add(side.shoulder);
  // A joint like a shoulder where the left arm would be: just a stump.
  const stump = taperedBox(0.09, 0.1, 0.09, 0.7, 1.0, skinDark); stump.position.set(-0.21, 0.0, 0.02); stump.rotation.z = -1.2; hump.add(stump);

  // Neck-arm where the head should be: from the front of the hump, a shoulder
  // knob, arm, elbow, more arm, then the hand.
  const socket = taperedBox(0.13, 0.1, 0.13, 0.75, 1.0, skin); socket.position.set(0, 0.06, 0.11); socket.rotation.x = 0.9; hump.add(socket);
  const neck = buildArmChain(skin, skin, { upper: 0.42, fore: 0.4, r: 0.055, keepFingers: true });
  neck.shoulder.position.set(0, 0.08, 0.13);
  const neckHand = neck.hand; neckHand.scale.setScalar(1.25); neckHand.userData.curl(0.3, 0.8);
  hump.add(neck.shoulder);
  root.add(makeBlobShadow(ctx, 1.4));

  const state = { t: 0 };
  function pose(dt, s) {
    state.t += dt;
    const t = state.t;
    const k = s.lurch ?? 0; // 0..1 effort
    legs[0].hip.rotation.y = Math.sin(t * 5.1) * 0.35 * (0.3 + k);
    legs[1].hip.rotation.y = Math.sin(t * 4.3 + 1.7) * 0.4 * (0.3 + k);
    legs[0].knee.rotation.x = -(0.3 + Math.max(0, Math.sin(t * 5.1 + 0.6)) * (0.6 + k));
    legs[1].knee.rotation.x = -(0.4 + Math.max(0, Math.sin(t * 4.3 + 2.3)) * (0.5 + k));
    side.shoulder.rotation.y = Math.sin(t * 3.7) * 0.6;
    side.shoulder.rotation.z = 1.9 + Math.sin(t * 2.9 + 0.5) * 0.4;
    side.elbow.rotation.x = -(0.6 + Math.sin(t * 6.1) * 0.5);
    // The neck-arm rears up and reaches forward on each lurch.
    neck.shoulder.rotation.x = -Math.PI / 2 + 0.9 - Math.sin(t * 2.1) * 0.35 - k * 0.6;
    neck.shoulder.rotation.z = Math.sin(t * 1.3) * 0.3;
    neck.elbow.rotation.x = -(1.0 + Math.sin(t * 2.1 + 1.2) * 0.6 + k * 0.5);
    neck.wrist.rotation.x = 0.3 + Math.sin(t * 6.0) * 0.4;
    neck.wrist.rotation.z = Math.sin(t * 3.3) * 0.3;
    neckHand.userData.curl(0.35 + Math.sin(t * 4.1) * 0.3 + k * 0.3, 0.8);
    sideHand.userData.curl(0.5 + Math.sin(t * 5.3 + 1) * 0.4, 0.5);
    // The spine ripples front to back; on a lurch the front arches up.
    spine.forEach((g, i) => {
      g.rotation.x = -Math.sin(t * 2.2 - i * 0.9) * 0.08 * (0.5 + k) - (i > 0 ? k * 0.12 : 0);
      g.rotation.z = Math.sin(t * 1.7 - i * 0.7) * 0.07;
      g.rotation.y = Math.sin(t * 1.1 - i * 0.6) * 0.05;
    });
    pelvis.position.y = 0.19 + k * 0.05;
  }
  return { root, pose, hitRadius: 1.0, hitHeight: 1.0 };
}

// A dog: Doberman proportions, with options for a broken muzzle, a knitted
// sweater and a parachute. Faces +z. look: { coat, sweater, muzzle, parachute, size }
export function buildDog(ctx, look = {}) {
  ctxRef = ctx;
  const T = ctx.T;
  const mat = (name, extra) => createPS1Material(ctx.env, { map: T[name] || T.doberman, ...extra });
  const kind = look.kind || 'dog';
  const coat = mat(look.coat || { squirrel: 'hairGrey', beaver: 'hairBrown', mouse: 'hairGrey' }[kind] || 'doberman');
  const tan = createPS1Material(ctx.env, { map: T.skinTan, color: kind === 'mouse' ? '#e0a0a8' : '#9a6a44' });
  const dark = mat('dark');
  const root = new THREE.Group();
  const SH = 0.62; // shoulder height
  const body = new THREE.Group(); body.position.set(0, SH - 0.05, 0); root.add(body);
  const lump = (w, h, len, front, back, m) => { const b = taperedBox(w, len, h, front, back, m); b.rotation.x = Math.PI / 2; return b; };
  const fat = kind === 'beaver' ? 1.5 : kind === 'mouse' ? 1.15 : 1;
  const chest = lump(0.26 * fat, 0.3 * fat, 0.42, 1.0, 0.9, look.sweater ? mat(look.sweater) : coat); chest.position.z = 0.1; body.add(chest);
  const belly = lump(0.2 * fat, 0.22 * fat, 0.4, 0.95, 0.8, look.sweater ? mat(look.sweater) : coat); belly.position.set(0, 0.01, -0.3); body.add(belly);
  if (look.sweater) { const collar = box(0.26, 0.06, 0.2, mat(look.sweater)); collar.position.set(0, 0.1, 0.3); body.add(collar); }
  // Neck and head.
  const neck = new THREE.Group(); neck.position.set(0, 0.1, 0.3); body.add(neck);
  const neckMesh = limb(0.22, 0.065, 0.085, coat, 5); neckMesh.rotation.x = -2.0; neck.add(neckMesh);
  const headPivot = new THREE.Group(); headPivot.position.set(0, 0.1, 0.19); neck.add(headPivot);
  const skull = box(0.16, 0.14, 0.16, coat); headPivot.add(skull);
  const snout = taperedBox(0.1, 0.09, 0.2, 1.0, 0.85, [coat, coat, coat, tan, coat, coat]); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.03, 0.17); headPivot.add(snout);
  const nose = box(0.04, 0.03, 0.03, dark); nose.position.set(0, 0.0, 0.28); headPivot.add(nose);
  for (const sx of [-1, 1]) {
    const ear = kind === 'mouse' ? new THREE.Mesh(setVertexShade(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 8), 1), [coat, tan, tan])
      : kind === 'squirrel' ? taperedBox(0.04, 0.08, 0.03, 0.3, 1.0, coat) : taperedBox(0.05, 0.14, 0.03, 0.2, 1.0, coat);
    if (kind === 'mouse') { ear.rotation.x = Math.PI / 2; ear.position.set(sx * 0.09, 0.12, -0.03); }
    else { ear.position.set(sx * 0.06, 0.13, -0.02); ear.rotation.z = -sx * 0.25; }
    headPivot.add(ear);
    const eye = box(0.025, 0.02, 0.01, createPS1Material(ctx.env, { map: T.white, color: '#f0d060', unlit: true })); eye.position.set(sx * 0.055, 0.03, 0.081); headPivot.add(eye);
    const brow = box(0.04, 0.012, 0.012, tan); brow.position.set(sx * 0.055, 0.055, 0.081); headPivot.add(brow);
  }
  let muzzle = null;
  if (look.muzzle) {
    // A wire muzzle, broken off its strap, hanging from the jaw.
    muzzle = new THREE.Group(); muzzle.position.set(0, -0.07, 0.18); muzzle.rotation.x = 0.9; headPivot.add(muzzle);
    const wire = mat('metal');
    for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(setVertexShade(new THREE.TorusGeometry(0.06 - i * 0.008, 0.006, 3, 8), 1), wire); ring.position.z = i * 0.05; muzzle.add(ring); }
    for (let i = 0; i < 4; i++) { const bar = box(0.008, 0.008, 0.12, wire); const a = i * Math.PI / 2 + 0.4; bar.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.05); muzzle.add(bar); }
    const strap = box(0.02, 0.1, 0.006, dark); strap.position.set(0.05, 0.03, -0.02); strap.rotation.z = 0.6; muzzle.add(strap);
  }
  // Tail: a stub on a dog, a bush on a squirrel, a paddle on a beaver, a cord on a mouse.
  let tail;
  if (kind === 'squirrel') { tail = taperedBox(0.14, 0.5, 0.16, 1.2, 0.5, coat); tail.position.set(0, 0.25, -0.52); tail.rotation.x = 0.35; }
  else if (kind === 'beaver') { tail = box(0.18, 0.03, 0.36, dark); tail.position.set(0, -0.06, -0.66); tail.rotation.x = 0.15; }
  else if (kind === 'mouse') { tail = limb(0.6, 0.014, 0.005, tan, 4); tail.position.set(0, -0.02, -0.5); tail.rotation.x = -1.3; }
  else { tail = limb(0.1, 0.025, 0.015, coat, 4); tail.position.set(0, 0.08, -0.5); tail.rotation.x = -2.6; }
  body.add(tail);
  if (kind === 'beaver') { for (const sx of [-1, 1]) { const tooth = box(0.02, 0.05, 0.01, createPS1Material(ctx.env, { map: T.white, color: '#f0e4c0' })); tooth.position.set(sx * 0.014, -0.08, 0.27); headPivot.add(tooth); } }
  // Legs: shoulder/hip pivots on the body, knee, paw.
  const legs = [];
  for (const [x, z, front] of [[-0.09, 0.22, true], [0.09, 0.22, true], [-0.08, -0.38, false], [0.08, -0.38, false]]) {
    const hip = new THREE.Group(); hip.position.set(x, -0.08, z); body.add(hip);
    const upper = front ? 0.27 : 0.25, lower = front ? 0.25 : 0.28;
    hip.add(limb(upper, 0.05, 0.035, coat, 5));
    const knee = new THREE.Group(); knee.position.y = -upper; hip.add(knee);
    knee.add(limb(lower, 0.035, 0.028, front ? coat : tan, 5));
    const paw = box(0.06, 0.04, 0.09, tan); paw.position.set(0, -lower - 0.015, 0.02); knee.add(paw);
    legs.push({ hip, knee, front, phase: front ? 0 : Math.PI, side: x < 0 ? 0 : Math.PI * 0.15 });
  }
  let canopy = null;
  if (look.parachute) {
    const pm = createPS1Material(ctx.env, { map: T.parachute, side: THREE.DoubleSide, texScale: 1 });
    canopy = new THREE.Group(); canopy.position.set(0, 1.6, -0.1); root.add(canopy);
    const dome = new THREE.Mesh(setVertexShade(new THREE.SphereGeometry(0.9, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 1), pm); dome.scale.y = 0.6; canopy.add(dome);
    const lineMat = mat('dark');
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const line = box(0.006, 1.2, 0.006, lineMat);
      line.position.set(Math.cos(a) * 0.4, -0.55, Math.sin(a) * 0.4 - 0.05);
      line.rotation.z = Math.cos(a) * 0.55; line.rotation.x = -Math.sin(a) * 0.55;
      canopy.add(line);
    }
    const harness = box(0.3, 0.05, 0.5, dark); harness.position.set(0, SH + 0.1, -0.1); root.add(harness);
  }
  root.add(makeBlobShadow(ctx, 0.9));
  const state = { phase: 0, moving: 0, hang: 0, headYaw: 0, headPitch: 0, t: Math.random() * 10 };
  function pose(dt, s) {
    state.t += dt; const t = state.t;
    state.moving = THREE.MathUtils.lerp(state.moving, s.moving ? 1 : 0, dt * 6);
    state.hang = THREE.MathUtils.lerp(state.hang, s.hang ? 1 : 0, dt * 3);
    if (s.moving) state.phase += dt * (s.gallop ?? 11);
    const m = state.moving, p = state.phase, h = state.hang;
    // Gallop: front pair and back pair swing against each other, body rocks.
    for (const leg of legs) {
      const sw = Math.sin(p + leg.phase + leg.side);
      leg.hip.rotation.x = THREE.MathUtils.lerp(-sw * 0.8 * m, leg.front ? 0.5 : -0.4, h);
      leg.knee.rotation.x = THREE.MathUtils.lerp((Math.max(0, Math.sin(p + leg.phase + leg.side + 1.3)) * 1.1 + 0.1) * m + 0.05 * (1 - m), leg.front ? 0.9 : 0.8, h);
    }
    body.rotation.x = Math.sin(p) * 0.12 * m + THREE.MathUtils.lerp(0, 0.35, h);
    body.position.y = SH - 0.05 + Math.abs(Math.sin(p)) * 0.06 * m + Math.sin(t * 2.6) * 0.005;
    root.position.y = h * 0.25;
    tail.rotation.z = Math.sin(t * 9) * 0.3 * (s.alert ? 0 : 1);
    // Head: tracks the player when standing, stretches forward at a run, hangs when hung.
    let ty = 0, tp = 0;
    if (s.lookAt) { ty = THREE.MathUtils.clamp(s.lookAt.yaw, -1.0, 1.0); tp = THREE.MathUtils.clamp(s.lookAt.pitch, -0.5, 0.6); }
    state.headYaw = THREE.MathUtils.lerp(state.headYaw, ty * (1 - m), dt * 4);
    state.headPitch = THREE.MathUtils.lerp(state.headPitch, tp * (1 - m) - 0.3 * m + 0.6 * h + (s.alert ? 0.2 : 0), dt * 4);
    headPivot.rotation.y = state.headYaw;
    headPivot.rotation.x = state.headPitch;
    neck.rotation.x = -0.2 * m + 0.4 * h;
    if (muzzle) muzzle.rotation.x = 0.9 + Math.sin(t * 7) * 0.15 * m;
    if (canopy) canopy.rotation.z = Math.sin(t * 0.8) * 0.1;
  }
  return { root, pose, hitRadius: 0.7, hitHeight: 1.0, rig: { head: headPivot } };
}

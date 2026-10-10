// Pixel face painter. Produces a 32x40 texture for the front of a head box:
// shaded skin, eye sockets, lids, irises, brows, nose, lips, cheeks, age lines.
// Everything is parametric so dream characters can be described, not drawn.
import * as THREE from '../../vendor/three.module.js?v=82e941e';
import { mulberry } from './textures.js?v=82e941e';

const W = 32, H = 40;

function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class Painter {
  constructor(rand) { this.px = new Float32Array(W * H * 3); this.rand = rand; }
  set(x, y, c, a = 1) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.px[i] += (c[0] - this.px[i]) * a;
    this.px[i + 1] += (c[1] - this.px[i + 1]) * a;
    this.px[i + 2] += (c[2] - this.px[i + 2]) * a;
  }
  rect(x0, y0, w, h, c, a = 1) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a); }
  hline(x0, x1, y, c, a = 1) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c, a); }
  vline(x, y0, y1, c, a = 1) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c, a); }
  ellipse(cx, cy, rx, ry, c, a = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }
  // Soft-edged ellipse: alpha fades toward the rim.
  blob(cx, cy, rx, ry, c, a = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1) this.set(x, y, c, a * (1 - d) ** 0.8);
      }
    }
  }
  line(x0, y0, x1, y1, c, a = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, a);
  }
}

// opts: { skin, hair, eyes, lips, age (0..1), seed, grin, wideEyes, narrowEyes,
//         tired, stubble, browWeight (0..1), browArch (0..1), mood ('flat'|'sad'|'stern'),
//         gaze [x, y], hairline (true|false), lipstick }
export function paintFace(opts = {}) {
  const rand = mulberry(opts.seed ?? 11);
  const P = new Painter(rand);
  const skin = rgb(opts.skin || '#c69a78');
  const hair = rgb(opts.hair || '#2a221e');
  const iris = rgb(opts.eyes || '#45555c');
  const age = opts.age ?? 0.3;
  const hi = shade(skin, 1.14), sh = shade(skin, 0.78), deep = shade(skin, 0.56), deeper = shade(skin, 0.4);
  const lip = opts.lipstick ? rgb(opts.lipstick) : mix(skin, [150, 58, 66], 0.42);
  const lipDark = shade(lip, 0.7);
  const white = [228, 222, 212], pupil = [12, 10, 12], teeth = [236, 230, 218];
  const grin = !!opts.grin;
  const wide = !!opts.wideEyes;
  const narrow = !!opts.narrowEyes;
  const mood = opts.mood || 'flat';
  const [gx, gy] = opts.gaze || [0, 0];
  const blink = Math.max(0, Math.min(1, opts.blink || 0));        // 0 open, 1 shut
  const mouthOpen = Math.max(0, Math.min(1, opts.mouthOpen || 0)); // 0 closed, 1 wide

  // 1. Skin with vertical gradient, roundness at the edges, and grain.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x - 15.5) / 15.5;
      let k = 1.05 - (y / H) * 0.12;
      k *= 1 - 0.22 * Math.pow(Math.abs(u), 3.5);
      k += (rand() - 0.5) * 0.05;
      P.set(x, y, shade(skin, k));
    }
  }
  // Jaw: darken the bottom corners so the face reads narrower at the chin.
  for (let y = 30; y < H; y++) {
    const t = (y - 30) / (H - 30);
    const inset = Math.round(t * t * 7);
    P.hline(0, inset, y, deeper, 0.6 + t * 0.3);
    P.hline(W - 1 - inset, W - 1, y, deeper, 0.6 + t * 0.3);
  }
  // 2. Hairline.
  if (opts.hairline !== false) {
    const line = opts.hairHigh ? 5 : 3;
    for (let x = 0; x < W; x++) {
      const dip = Math.abs(x - 15.5) < 3 ? 1 : 0;
      const edge = line - dip + (rand() < 0.35 ? 1 : 0) + (Math.abs(x - 15.5) > 13 ? 2 : 0);
      P.vline(x, 0, edge, hair);
      P.set(x, edge + 1, mix(hair, skin, 0.5), 0.5);
    }
  }
  // 3. Brow ridge and sockets.
  P.hline(4, 27, 12, sh, 0.45);
  P.hline(5, 26, 13, sh, 0.2);
  for (const cx of [10.5, 21.5]) {
    P.blob(cx, 17, 5, 3.6, sh, 0.45);
    P.blob(cx, 15.5, 4.5, 1.6, deep, 0.3);
  }
  // Cheekbone highlight and cheek hollow.
  for (const [cx, sgn] of [[7, -1], [25, 1]]) {
    P.blob(cx, 22, 3.5, 1.8, hi, 0.35);
    P.blob(cx + sgn, 27, 4, 3, sh, 0.25 + age * 0.3);
  }
  // 4. Eyes.
  const ry = wide ? 2.3 : narrow ? 1.1 : 1.6;
  for (const [cx, side] of [[10.5, -1], [21.5, 1]]) {
    P.ellipse(cx, 16.5, 3.3, ry, white);
    P.ellipse(cx, 16.5, 3.3, ry, sh, 0.0);
    // iris and pupil
    const ix = cx + gx * 1.2, iy = 16.5 + gy * 0.6;
    P.ellipse(ix, iy, wide ? 1.2 : 1.4, wide ? 1.5 : 1.7, iris);
    P.ellipse(ix, iy, 0.75, 1.0, pupil);
    P.set(ix - 1, iy - 1, [250, 250, 250], 0.7);
    // lids
    P.line(cx - 3.5, 16.5 - ry + 0.2, cx + 3.5, 16.5 - ry + 0.2, deeper, 0.9);
    P.line(cx - 3.3, 16.5 - ry - 0.8, cx + 3.3, 16.5 - ry - 0.8, deep, 0.35);
    P.line(cx - 3, 16.5 + ry + 0.3, cx + 3, 16.5 + ry + 0.3, deep, 0.45);
    if (opts.tired) P.blob(cx, 19.5, 3.5, 1.4, mix(deep, [80, 60, 90], 0.3), 0.5);
    // The lid coming down: skin over the top of the eye, a line at its edge.
    if (blink > 0) {
      const top = 16.5 - ry - 0.5, bottom = 16.5 - ry - 0.5 + (2 * ry + 1.2) * blink;
      for (let y = Math.floor(top); y <= bottom; y++) P.hline(cx - 3.5, cx + 3.5, y, sh, 0.98);
      P.line(cx - 3.3, bottom, cx + 3.3, bottom, deeper, 0.95);
    }
    // outer corner lashes
    P.set(cx + side * 3.8, 16.5 - ry + 0.6, deeper, 0.8);
    // crow's feet
    if (age > 0.35) {
      P.line(cx + side * 4.2, 16, cx + side * 6, 14.5, deep, (age - 0.3) * 0.7);
      P.line(cx + side * 4.2, 17.5, cx + side * 6, 19, deep, (age - 0.3) * 0.7);
    }
  }
  // 5. Eyebrows.
  const bw = opts.browWeight ?? 0.6, arch = opts.browArch ?? 0.4;
  const browY = wide ? 10 : 11.5;
  for (const [cx, side] of [[10.5, -1], [21.5, 1]]) {
    for (let i = -4; i <= 4; i++) {
      const x = cx + i;
      const t = (i * side + 4) / 8; // 0 inner .. 1 outer
      let y = browY - Math.sin(t * Math.PI) * arch * 2.2 + (mood === 'stern' ? (1 - t) * -1.2 : 0) + (mood === 'sad' ? (1 - t) * -0.8 : 0);
      if (mood === 'stern') y += 0.8;
      const thick = 1 + bw * (1 - Math.abs(t - 0.4));
      P.vline(x, y - thick / 2, y + thick / 2 - 0.01, hair, 0.85);
      P.set(x, y + thick / 2 + 0.5, mix(hair, skin, 0.6), 0.4);
    }
  }
  // 6. Nose.
  P.vline(15, 14, 22, hi, 0.45); P.vline(16, 14, 22, hi, 0.45);
  P.vline(13, 17, 23, sh, 0.5); P.vline(18, 17, 23, sh, 0.3);
  P.blob(15.5, 22.5, 2.8, 1.8, hi, 0.35);
  P.hline(13, 18, 24, sh, 0.7);
  P.set(13, 24, deeper, 0.9); P.set(18, 24, deeper, 0.9);
  P.set(12, 23, deep, 0.5); P.set(19, 23, deep, 0.5);
  P.hline(14, 17, 25, sh, 0.35);
  // 7. Nasolabial folds and forehead lines with age.
  if (age > 0.25) {
    const a = (age - 0.2) * 0.8;
    P.line(12, 25, 10, 31, deep, a); P.line(19, 25, 21, 31, deep, a);
    P.line(8, 7, 23, 7, sh, a * 0.6); P.line(9, 9, 22, 9, sh, a * 0.5);
    P.set(15, 13, deep, a * 0.6); P.set(16, 13, deep, a * 0.6);
  }
  // 8. Mouth.
  if (grin) {
    P.blob(15.5, 30.5, 9.5, 3.4, deeper, 0.8);
    P.rect(7, 29, 18, 3, teeth);
    for (let x = 8; x < 24; x += 2) P.vline(x, 29, 31, mix(teeth, deeper, 0.45), 0.5);
    P.hline(7, 24, 28, lipDark, 0.9);
    P.hline(6, 25, 32, lip, 0.95);
    P.hline(7, 24, 33, lipDark, 0.5);
    P.set(6, 29, deeper); P.set(25, 29, deeper); P.set(5, 30, deeper, 0.7); P.set(26, 30, deeper, 0.7);
    // raised cheeks
    P.blob(7, 25, 3.5, 2.2, hi, 0.5); P.blob(24, 25, 3.5, 2.2, hi, 0.5);
    P.line(5, 27, 6, 33, deep, 0.6); P.line(26, 27, 25, 33, deep, 0.6);
  } else {
    const corner = mood === 'sad' ? 1 : 0;
    P.hline(11, 20, 29, lipDark, 0.8);
    P.hline(10, 21, 30, deeper, 0.9);
    P.set(10, 30 + corner, deeper); P.set(21, 30 + corner, deeper);
    P.hline(11, 20, 31, lip, 0.9);
    P.hline(12, 19, 32, mix(lip, hi, 0.5), 0.45);
    P.blob(15.5, 28, 1.6, 0.9, hi, 0.4); // philtrum
    P.set(15, 29, lip, 0.6); P.set(16, 29, lip, 0.6);
  }
  if (mouthOpen > 0.05) {
    // The mouth open: a dark hollow between the lips, teeth showing at the top when wide.
    const h = 1.2 + mouthOpen * 3.0, hollow = [38, 18, 22];
    P.ellipse(15.5, 30.8 + h * 0.5, 3.8 + mouthOpen * 1.4, h, hollow, 1);
    if (mouthOpen > 0.45) { P.hline(12, 19, 30, teeth, 0.95); P.hline(12, 19, 31, mix(teeth, hollow, 0.5), 0.7); }
    P.hline(11, 20, 29, lipDark, 0.95);
    P.hline(11, 20, Math.round(30.8 + h), lip, 0.95);
    P.hline(12, 19, Math.round(30.8 + h) + 1, lipDark, 0.6);
  }
  // 9. Chin.
  P.blob(15.5, 35.5, 4.5, 2.2, hi, 0.25);
  P.hline(10, 21, 34, sh, 0.35);
  P.hline(8, 23, 38, sh, 0.5); P.hline(9, 22, 39, deep, 0.6);
  // 10. Stubble.
  if (opts.stubble) {
    for (let y = 25; y < 39; y++) for (let x = 3; x < 29; x++) {
      const inJaw = y > 33 || Math.abs(x - 15.5) > 5 || y > 30;
      if (inJaw && rand() < 0.35) P.set(x, y, deeper, 0.3);
    }
  }
  // 11. Freckles / moles.
  if (opts.mole) P.set(opts.mole[0], opts.mole[1], deeper, 0.9);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) img.data[i * 4 + c] = Math.round(Math.max(0, Math.min(255, P.px[i * 3 + c])) / 8) * 8;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false; tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Named presets used by the example scene.
export const FACE_PRESETS = {
  faceDignified: { skin: '#c9a284', hair: '#cfc9bf', age: 0.8, browWeight: 0.8, browArch: 0.2, mood: 'stern', hairHigh: true, seed: 13 },
  faceSinger: { skin: '#e2c9ae', hair: '#161214', age: 0.1, eyes: '#2a2626', browArch: 1.0, browWeight: 0.45, lipstick: '#c0303a', narrowEyes: false, mood: 'flat', gaze: [0.4, 0], seed: 17 },
  faceHost: { skin: '#d2b094', hair: '#2a221e', age: 0.35, browWeight: 0.5, browArch: 0.5, mood: 'flat', seed: 19 },
  faceParamedic: { skin: '#b98a68', hair: '#2a221e', age: 0.3, browWeight: 0.7, browArch: 0.3, mood: 'flat', seed: 23 },
  faceInventor: { skin: '#c4a88c', hair: '#4a3222', age: 0.5, browWeight: 0.6, browArch: 0.7, mood: 'flat', wideEyes: true, seed: 29 },
  facePainter: { skin: '#c9a080', hair: '#161214', age: 0.25, browWeight: 0.6, browArch: 0.3, narrowEyes: true, stubble: true, seed: 31 },
  faceWaiter: { skin: '#d6b89c', hair: '#161214', age: 0.2, browWeight: 0.5, browArch: 0.4, mood: 'flat', seed: 37 },
  faceOld: { skin: '#c69a78', hair: '#8f8880', age: 0.85, tired: true, stubble: true, browWeight: 0.9, browArch: 0.25, mood: 'flat', seed: 3 },
  faceGrin: { skin: '#dcc6b4', hair: '#2a221e', age: 0.1, grin: true, wideEyes: true, browArch: 0.9, browWeight: 0.35, lipstick: '#b02838', eyes: '#3a4a52', seed: 7 },
  faceYoungMan: { skin: '#c9a080', hair: '#2a221e', age: 0.15, browWeight: 0.7, browArch: 0.3, mood: 'flat', seed: 5 },
};


// Other treatments of a painted face, for the character lab and for looks
// that ask for them (`look.faceStyle`): 'pixel' paints it at half the
// resolution so the features are chunkier; 'soft' adds shading, a nose
// shadow and a little colour in the cheeks.
export function stylizeFace(tex, style) {
  const src = tex.image; const W = src.width, H = src.height;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  if (style === 'pixel') {
    const small = document.createElement('canvas'); small.width = W / 2; small.height = H / 2;
    const sc = small.getContext('2d'); sc.imageSmoothingEnabled = false; sc.drawImage(src, 0, 0, W / 2, H / 2);
    ctx.drawImage(small, 0, 0, W, H);
  } else {
    ctx.drawImage(src, 0, 0);
    if (style === 'soft') {
      ctx.globalCompositeOperation = 'multiply';
      const vign = ctx.createRadialGradient(W * 0.5, H * 0.52, W * 0.22, W * 0.5, H * 0.52, W * 0.72);
      vign.addColorStop(0, 'rgba(255,255,255,1)'); vign.addColorStop(1, 'rgba(150,130,120,1)');
      ctx.fillStyle = vign; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(120,90,80,0.35)'; ctx.fillRect(W * 0.52, H * 0.42, W * 0.08, H * 0.2);   // the nose's shadow
      ctx.globalCompositeOperation = 'overlay';
      for (const cx of [0.28, 0.72]) { const g = ctx.createRadialGradient(W * cx, H * 0.6, 0, W * cx, H * 0.6, W * 0.14); g.addColorStop(0, 'rgba(230,110,110,0.55)'); g.addColorStop(1, 'rgba(230,110,110,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  return canvasTexture(canvas);
}

// One strip to wrap round a head: the face at the front (u 0.25), skin to
// the sides, hair behind. Heads built as an octagon or a sphere use it.
export function wrapHead(faceTex, skinHex, hairHex, bald = false, span = 0.25) {
  const face = faceTex.image; const W = 128, H = 32;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = skinHex || '#c69a78'; ctx.fillRect(0, 0, W, H);
  if (!bald) { ctx.fillStyle = hairHex || '#2a221e'; ctx.fillRect(W * 0.56, 0, W * 0.38, H); ctx.fillRect(0, 0, W, 3); }
  // Ears' shadow where the strip turns the corner.
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(W * (0.25 - span / 2) - 3, H * 0.35, 2, H * 0.3); ctx.fillRect(W * (0.25 + span / 2) + 1, H * 0.35, 2, H * 0.3);
  ctx.drawImage(face, W * (0.25 - span / 2), 0, W * span, H);
  return canvasTexture(canvas);
}

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false; tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}


// A photograph as a face: cropped to a square (centre, zoom and offset
// given as fractions), scaled down to `size` pixels with no smoothing, and
// quantised to the renderer's 5-bit palette, so it sits with the painted
// textures. `img` is an Image or canvas.
export function photoFace(img, { size = 48, zoom = 1, dx = 0, dy = 0, contrast = 1.0 } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true;
  const side = Math.min(img.width, img.height) / zoom;
  const sx = (img.width - side) / 2 + dx * img.width, sy = (img.height - side) / 2 + dy * img.height;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < d.data.length; i += 4) {
    for (let c = 0; c < 3; c++) { let v = (d.data[i + c] - 128) * contrast + 128; d.data[i + c] = Math.round(Math.max(0, Math.min(255, v)) / 8) * 8; }
  }
  ctx.putImageData(d, 0, 0);
  return canvasTexture(canvas);
}


// The one texture a sculpted head wears, 128 by 64: the face (photograph or
// painted) in the left half, and in the right half the paint for the rest of
// the head: skin below, hair above, both darkening toward the back.
export function headAtlas(faceTex, skinHex, hairHex, bald = false) {
  const W = 128, H = 64;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(faceTex.image, 0, 0, W / 2, H);
  const skin = skinHex || '#c69a78', hair = bald ? skin : (hairHex || '#2a221e');
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  for (let i = 0; i < 16; i++) {
    const k = 1.0 - i * 0.022;                       // darker toward the back of the head
    ctx.fillStyle = shade(skin, k); ctx.fillRect(W / 2 + i * 4, H / 2, 4, H / 2);
    ctx.fillStyle = shade(hair, k + 0.04); ctx.fillRect(W / 2 + i * 4, 0, 4, H / 2);
  }
  // A little grain in the hair, as the painted textures have.
  for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`; ctx.fillRect(W / 2 + Math.random() * (W / 2), Math.random() * (H / 2), 1, 2); }
  return canvasTexture(canvas);
}

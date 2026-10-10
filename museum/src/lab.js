// The character lab: the humanoid builder's options side by side, in the
// game's own renderer, so a head shape, a face treatment, a hairstyle or a
// garment can be judged before it goes into a dream. Open lab.html.
import * as THREE from '../vendor/three.module.js?v=24e2c73';
import { createEnvironment, createPS1Material, assignLightsToObject, applyEnvironmentConfig } from './engine/ps1material.js?v=24e2c73';
import { createTextures } from './engine/textures.js?v=24e2c73';
import { PostPass } from './engine/post.js?v=24e2c73';
import { FACE_PRESETS, paintFace, stylizeFace, photoFace } from './engine/faces.js?v=24e2c73';
import { buildHumanoid } from './scene/characters.js?v=24e2c73';
import { createLight, updateLights } from './engine/lights.js?v=24e2c73';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
const env = createEnvironment();
applyEnvironmentConfig(env, { fogColor: '#0b0d10', ambient: '#4a4a52', skyColor: '#2a2c34', sunDir: [0.3, 0.8, 0.5], sunColor: '#9a9aa4', fogNear: 20, fogFar: 60 });
renderer.setClearColor(env.uFogColor.value);
const T = createTextures();
const ctx = { env, T };
const post = new PostPass(renderer, { height: 270 });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);

// A floor and three warm lights, so the figures read as they do in a dream.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40, 8, 8), createPS1Material(env, { map: T.parquet, texScale: 2 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const lights = [];
for (const [x, z, c] of [[0, 3.5, '#ffd9a0'], [-3, 0, '#c8d8ff'], [3, 0, '#ffb080'], [0, -3, '#d0c0ff']]) {
  const l = createLight({ pos: [x, 2.4, z], color: c, intensity: 3.0, range: 12, profile: 'soft' });
  env.pointLights.push(l); lights.push(l);
}

const $ = (id) => document.getElementById(id);
const presetSel = $('preset');
for (const k of Object.keys(FACE_PRESETS)) { const o = document.createElement('option'); o.value = k; o.textContent = k.replace(/^face/, '').toLowerCase(); presetSel.appendChild(o); }
const SKIN_HEX = { skin: '#c69a78', skinPale: '#dcc6b4', skinTan: '#b07850', skinDeep: '#7a4e34' };
const HAIR_HEX = { hairDark: '#2a221e', hairBlack: '#161214', hairBrown: '#4a3222', hairGrey: '#9a948a', hairWhite: '#cfc9bf' };

// Photographs for the face: the samples listed in lab/faces/index.json, or
// one the person uploads. Loaded as images; cut and scaled in photoFace().
const photos = {};   // name -> Image
let photoName = '';
const photoSel = $('photo');
fetch('./lab/faces/index.json').then((r) => (r.ok ? r.json() : [])).then((list) => {
  for (const f of list) { const o = document.createElement('option'); o.value = f.file; o.textContent = f.name || f.file; photoSel.appendChild(o); }
}).catch(() => {});
function loadPhoto(name, src) {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => { photos[name] = img; resolve(img); }; img.onerror = () => resolve(null); img.src = src; });
}
photoSel.addEventListener('change', async () => { photoName = photoSel.value; if (photoName && !photos[photoName]) await loadPhoto(photoName, './lab/faces/' + photoName); rebuild(); });
$('upload').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const url = URL.createObjectURL(file); await loadPhoto('upload', url);
  let o = photoSel.querySelector('option[value="upload"]'); if (!o) { o = document.createElement('option'); o.value = 'upload'; o.textContent = 'uploaded photo'; photoSel.appendChild(o); }
  photoSel.value = 'upload'; photoName = 'upload'; rebuild();
});
for (const id of ['pzoom', 'pdx', 'pdy', 'psize']) $(id).addEventListener('input', rebuild);
function currentPhotoTex() {
  const img = photoName && photos[photoName]; if (!img) return null;
  return photoFace(img, { size: +$('psize').value, zoom: +$('pzoom').value, dx: +$('pdx').value, dy: +$('pdy').value });
}

function lookFromPanel() {
  const preset = FACE_PRESETS[presetSel.value] || FACE_PRESETS.faceYoungMan;
  const skin = $('skin').value, hairTex = $('hairTex').value;
  const mood = $('mood').value;
  return {
    skin, skinColor: SKIN_HEX[skin], hair: hairTex, facePhoto: currentPhotoTex(),
    face: { ...preset, skin: SKIN_HEX[skin], hair: HAIR_HEX[hairTex], age: +$('age').value, mood: mood === 'grin' ? 'flat' : mood, grin: mood === 'grin', seed: +$('seed').value },
    hairStyle: $('hair').value, top: $('top').value, bottom: $('bottom').value, skirt: $('skirt').checked, glasses: $('glasses').checked, hat: $('hat').checked,
  };
}

let figures = [];
function clear() { for (const f of figures) scene.remove(f.root); figures = []; }
function place(look, x, z, label) {
  const h = buildHumanoid(ctx, look);
  h.root.position.set(x, 0, z);
  scene.add(h.root);
  h.root.updateMatrixWorld(true);
  assignLightsToObject(env, h.root);
  figures.push({ ...h, label });
  return h;
}

function rebuild() {
  clear();
  const base = lookFromPanel();
  const mode = $('mode').value;
  const labels = [];
  if (mode === 'compare') {
    const heads = ['sculpt', 'box', 'octagon', 'round'], faces = ['painted', 'pixel', 'soft'];
    heads.forEach((hs, r) => faces.forEach((fs, c) => { place({ ...base, headStyle: hs, faceStyle: fs }, (c - 1) * 1.35, (r - 1.5) * -1.7, `${hs} / ${fs}`); }));
    labels.push(...faces.map((f) => `face: ${f}`));
    setRows(heads.map((h) => `head: ${h}`));
  } else if (mode === 'hair') {
    const styles = ['short', 'long', 'up', 'bob', 'veil', 'bald'];
    styles.forEach((hs, i) => place({ ...base, hairStyle: hs, headStyle: $('headStyle').value, faceStyle: $('faceStyle').value }, (i % 3 - 1) * 1.35, (Math.floor(i / 3) - 0.5) * -1.9, hs));
    labels.push('', '', ''); setRows(['', '']);
  } else if (mode === 'clothes') {
    const fits = [['coat', 'trousers', false], ['suit', 'suit', false], ['shirtWhite', 'jeans', false], ['dress', 'dress', true], ['floral', 'velvet', true], ['overalls', 'trousers', false]];
    fits.forEach(([t, b, sk], i) => place({ ...base, top: t, bottom: b, skirt: sk, headStyle: $('headStyle').value, faceStyle: $('faceStyle').value }, (i % 3 - 1) * 1.35, (Math.floor(i / 3) - 0.5) * -1.9, `${t} / ${b}`));
    labels.push('', '', ''); setRows(['', '']);
  } else {
    const rand = mulberry(+$('seed').value);
    for (let i = 0; i < 6; i++) {
      const skin = ['skin', 'skinPale', 'skinTan', 'skinDeep'][Math.floor(rand() * 4)];
      const hairTex = Object.keys(HAIR_HEX)[Math.floor(rand() * 5)];
      const female = rand() < 0.5;
      const look = {
        skin, skinColor: SKIN_HEX[skin], hair: hairTex,
        face: { skin: SKIN_HEX[skin], hair: HAIR_HEX[hairTex], age: rand(), browWeight: 0.3 + rand() * 0.6, browArch: rand(), mood: ['flat', 'flat', 'stern', 'sad'][Math.floor(rand() * 4)], lipstick: female && rand() < 0.5 ? '#b03040' : undefined, seed: Math.floor(rand() * 9999) },
        hairStyle: female ? ['long', 'bob', 'up'][Math.floor(rand() * 3)] : ['short', 'short', 'bald'][Math.floor(rand() * 3)],
        top: ['coat', 'shirt', 'shirtWhite', 'suit', 'tweed', 'dress', 'floral', 'gingham', 'sweater'][Math.floor(rand() * 9)], bottom: ['trousers', 'suit', 'jeans'][Math.floor(rand() * 3)],
        skirt: female && rand() < 0.6, glasses: rand() < 0.2, headStyle: $('headStyle').value, faceStyle: $('faceStyle').value, facePhoto: currentPhotoTex(),
      };
      if (look.skirt) { look.top = ['dress', 'floral', 'velvet'][Math.floor(rand() * 3)]; look.bottom = look.top; }
      place(look, (i % 3 - 1) * 1.35, (Math.floor(i / 3) - 0.5) * -1.9, `${look.hairStyle} · ${look.top}`);
    }
    labels.push('', '', ''); setRows(['', '']);
  }
  $('labels').innerHTML = (mode === 'compare' ? labels : figures.slice(0, 3).map((f) => f.label)).map((l) => `<div>${l}</div>`).join('');
  if (mode !== 'compare') $('labels').innerHTML += figures.slice(3, 6).map((f) => `<div>${f.label}</div>`).join('');
  showFaces(base);
}
function setRows(rows) { $('hint').textContent = (rows.filter(Boolean).length ? 'rows, front to back: ' + rows.join(' · ') + '   ·   ' : '') + 'drag to turn · wheel to zoom'; }

// The painted face and its treatments, as flat textures.
function showFaces(base) {
  const box = $('faces'); box.innerHTML = '';
  const tex = base.facePhoto || paintFace({ skin: base.skinColor, ...base.face });
  for (const style of ['painted', 'pixel', 'soft']) {
    const t = style === 'painted' ? tex : stylizeFace(tex, style);
    const c = document.createElement('canvas'); c.width = t.image.width; c.height = t.image.height; c.title = style;
    c.getContext('2d').drawImage(t.image, 0, 0); box.appendChild(c);
  }
}

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Camera: orbit by dragging, zoom with the wheel; the figures turn slowly.
let yaw = 0.15, pitch = 0.3, dist = 6.0, turn = 0, walking = false, talking = false, drag = null, auto = true, heads = false;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; auto = false; });
window.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('pointermove', (e) => { if (!drag) return; yaw += (e.clientX - drag.x) * 0.006; pitch = Math.max(-0.2, Math.min(1.2, pitch + (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('wheel', (e) => { dist = Math.max(2.5, Math.min(14, dist + e.deltaY * 0.004)); e.preventDefault(); }, { passive: false });
$('walk').addEventListener('click', () => { walking = !walking; });
$('talk').addEventListener('click', () => { talking = !talking; });
$('zoom').addEventListener('click', () => { heads = !heads; });
$('random').addEventListener('click', () => { $('seed').value = Math.floor(Math.random() * 9999); presetSel.selectedIndex = Math.floor(Math.random() * presetSel.options.length); $('skin').selectedIndex = Math.floor(Math.random() * 4); $('hair').selectedIndex = Math.floor(Math.random() * 6); $('hairTex').selectedIndex = Math.floor(Math.random() * 5); $('top').selectedIndex = Math.floor(Math.random() * 11); $('age').value = Math.random().toFixed(2); rebuild(); });
for (const id of ['mode', 'preset', 'headStyle', 'faceStyle', 'skin', 'hair', 'hairTex', 'top', 'bottom', 'age', 'mood', 'skirt', 'glasses', 'hat', 'seed']) $(id).addEventListener('input', rebuild);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  post.resize(w, h);
  env.uResolution.value.set(post.width, post.heightPx);
}
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (auto) turn += dt * 0.35;
  for (const f of figures) { f.root.rotation.y = turn; f.pose(dt, { moving: walking, talking, typing: talking, gesture: talking ? "talk" : "fidget" }); }
  $('ageV').textContent = $('age').value; $('zoomV').textContent = $('pzoom').value;
  updateLights(lights, now / 1000, camera);
  env.uTime.value = now / 1000;
  const d = heads ? Math.min(dist, 2.6) : dist, cy = heads ? 1.62 : 1.1, cz = heads ? 2.55 : 0;
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, cy + Math.sin(pitch) * d * (heads ? 0.4 : 1), cz + Math.cos(yaw) * Math.cos(pitch) * d);
  camera.lookAt(0, heads ? 1.62 : 0.95, heads ? 2.55 : 0);
  post.render(scene, camera, now / 1000);
  requestAnimationFrame(frame);
}
rebuild(); resize(); requestAnimationFrame(frame);
window.lab = { scene, figures: () => figures, rebuild, setTalking: (v) => { talking = v; }, setTurn: (v) => { auto = false; turn = v; }, setCamera: (y, p, d, h) => { auto = false; yaw = y; pitch = p; dist = d; heads = !!h; } };

// The voice lab: pick any character from the dreams, hear their voice say
// one of their lines, tune the numbers, copy the result into the generator.
// The head in the stage is the character's own, mouth moving while the
// voice goes. Laid out for a phone first.
import * as THREE from '../vendor/three.module.js?v=d8a02e0';
import { createEnvironment, createPS1Material, assignLightsToObject, applyEnvironmentConfig } from './engine/ps1material.js?v=d8a02e0';
import { createTextures } from './engine/textures.js?v=d8a02e0';
import { PostPass } from './engine/post.js?v=d8a02e0';
import { buildHumanoid } from './scene/characters.js?v=d8a02e0';
import { createLight, updateLights } from './engine/lights.js?v=d8a02e0';
import { DreamAudio } from './engine/audio.js?v=d8a02e0';
import { Voice, voiceFor, VOICE_FIELDS } from './engine/voice.js?v=d8a02e0';

const $ = (id) => document.getElementById(id);
const VERSION = window.DREAM_VERSION || '';
const fetchJSON = (url) => fetch(VERSION ? `${url}?v=${VERSION}` : url).then((r) => r.json());

// The stage: one figure, lit warmly, camera on the head.
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
const env = createEnvironment();
applyEnvironmentConfig(env, { fogColor: '#0b0d10', ambient: '#4a4a52', skyColor: '#2a2c34', sunDir: [0.3, 0.8, 0.5], sunColor: '#9a9aa4', fogNear: 20, fogFar: 60 });
renderer.setClearColor(env.uFogColor.value);
const T = createTextures();
const ctx = { env, T };
const post = new PostPass(renderer, { height: 216 });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20, 4, 4), createPS1Material(env, { map: T.parquet, texScale: 2 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const lights = [];
for (const [x, z, c] of [[0.6, 1.6, '#ffd9a0'], [-1.4, 0.6, '#c8d8ff'], [0, -1.5, '#d0c0ff']]) {
  const l = createLight({ pos: [x, 2.1, z], color: c, intensity: 2.6, range: 8, profile: 'soft' });
  env.pointLights.push(l); lights.push(l);
}

const audio = new DreamAudio();
const voice = new Voice(audio);

// Characters from every dream: id, name, look, their written voice, lines.
let people = [];
let figure = null, current = null, params = null, style = 'mumble';

function linesOf(o, scene) {
  const out = [];
  const take = (l) => { if (typeof l === 'string') out.push(l); else if (l && l.who === o.id && l.text) out.push(l.text); };
  for (const d of o.dialog || []) { for (const l of d.lines || []) take(l); for (const v of d.variants || []) for (const l of v) take(l); }
  const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (Array.isArray(x.say)) x.say.forEach((l) => { if (l && l.who === o.id && l.text) out.push(l.text); }); Object.values(x).forEach(walk); } };
  walk(scene.events || []);
  return [...new Set(out)].slice(0, 8);
}

async function loadPeople() {
  const order = await fetchJSON('./scenes/index.json');
  const all = [];
  for (const name of order) {
    let s; try { s = await fetchJSON(`./scenes/${name}.json`); } catch (e) { continue; }
    const objs = s.objects || [];
    for (const o of objs) {
      if (o.type !== 'character') continue;
      const lines = linesOf(o, s);
      if (!lines.length) continue;
      all.push({ dream: s.title || name, id: o.id, name: o.name || o.id, look: { ...(o.look || {}), scale: o.scale }, voice: o.voice || null, lines });
    }
  }
  return all;
}

function fillPeople() {
  const sel = $('whoSel'); sel.innerHTML = '';
  const custom = document.createElement('option'); custom.value = '-1'; custom.textContent = 'someone new'; sel.appendChild(custom);
  let group = null, last = null;
  people.forEach((p, i) => {
    if (p.dream !== last) { group = document.createElement('optgroup'); group.label = p.dream; sel.appendChild(group); last = p.dream; }
    const op = document.createElement('option'); op.value = String(i); op.textContent = p.name; group.appendChild(op);
  });
  sel.value = '0';
}

function pick(i) {
  current = i >= 0 ? people[i] : { id: 'someone' + Math.floor(Math.random() * 9999), name: 'someone new', look: { top: 'coat', hairStyle: 'short' }, voice: null, lines: ['I know this place. I have been here before.', 'Are you coming? It is late.'] };
  params = voiceFor(current.id, current.look, current.voice);
  style = params.style || 'mumble';
  if (figure) scene.remove(figure.root);
  figure = buildHumanoid(ctx, current.look);
  figure.root.rotation.y = -0.35;
  scene.add(figure.root); figure.root.updateMatrixWorld(true); assignLightsToObject(env, figure.root);
  $('who').textContent = `${current.name} · ${current.dream || ''}`.replace(/ · $/, '');
  $('line').value = current.lines[0] || '';
  const chips = $('lines'); chips.innerHTML = '';
  for (const l of current.lines) { const b = document.createElement('button'); b.textContent = l; b.addEventListener('click', () => { $('line').value = l; play(); }); chips.appendChild(b); }
  syncControls();
}

// Sliders, one per voice number.
function buildSliders() {
  const box = $('sliders'); box.innerHTML = '';
  for (const [key, min, max, step, unit] of VOICE_FIELDS) {
    const row = document.createElement('div'); row.className = 'slider'; row.dataset.key = key;
    row.innerHTML = `<span class="n">${key}</span><span class="v"></span><input type="range" min="${min}" max="${max}" step="${step}">`;
    const input = row.querySelector('input');
    input.addEventListener('input', () => { params[key] = +(+input.value).toFixed(step < 1 ? 2 : 0); row.querySelector('.v').textContent = params[key] + (unit ? ' ' + unit : ''); showJSON(); });
    input.addEventListener('change', () => play());
    box.appendChild(row);
  }
}

function syncControls() {
  for (const row of $('sliders').children) {
    const key = row.dataset.key, f = VOICE_FIELDS.find((x) => x[0] === key);
    row.querySelector('input').value = params[key] ?? f[1];
    row.querySelector('.v').textContent = (params[key] ?? '') + (f[4] ? ' ' + f[4] : '');
  }
  for (const b of $('style').children) b.classList.toggle('on', b.dataset.s === style);
  $('speechOpts').classList.toggle('hidden', style !== 'speech');
  showJSON();
}

function showJSON() {
  const out = { style, ...params };
  delete out.volume;
  if (style !== 'speech') { delete out.voiceName; delete out.lang; }
  if (style === 'mumble') delete out.style;
  $('json').textContent = JSON.stringify(out);
}

let playing = false, playUntil = 0;
function play() {
  audio.init(); audio.resume();
  const took = voice.speak($('line').value, { ...params, style });
  playUntil = performance.now() + took * 1000;
  playing = took > 0;
  $('play').classList.toggle('on', playing);
}
function stop() { voice.stop(); playing = false; $('play').classList.remove('on'); }

function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = '1'; clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.style.opacity = '0'; }, 1600); }

// System voices for the speech style.
function fillSystemVoices() {
  if (typeof speechSynthesis === 'undefined') return;
  const sel = $('sysVoice'); const voices = speechSynthesis.getVoices();
  sel.innerHTML = '<option value="">device default (en-GB if it has one)</option>';
  for (const v of voices) { const op = document.createElement('option'); op.value = v.name; op.textContent = `${v.name} (${v.lang})`; sel.appendChild(op); }
}

$('whoSel').addEventListener('change', (e) => { stop(); pick(+e.target.value); });
$('style').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; style = b.dataset.s; syncControls(); play(); });
$('sysVoice').addEventListener('change', (e) => { params.voiceName = e.target.value || undefined; if (!params.voiceName) delete params.voiceName; showJSON(); play(); });
$('line').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.target.blur(); play(); } });
$('play').addEventListener('click', () => (playing && voice.active() ? stop() : play()));
$('random').addEventListener('click', () => {
  for (const [key, min, max, step] of VOICE_FIELDS) { if (key === 'volume') continue; const v = min + Math.random() * (max - min); params[key] = +v.toFixed(step < 1 ? 2 : 0); }
  syncControls(); play();
});
$('reset').addEventListener('click', () => { params = voiceFor(current.id, current.look, current.voice); style = params.style || 'mumble'; syncControls(); play(); });
$('copy').addEventListener('click', async () => {
  const text = $('json').textContent;
  try { await navigator.clipboard.writeText(text); toast('copied'); }
  catch (e) { const r = document.createRange(); r.selectNodeContents($('json')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('select and copy'); }
});
// A tap on the stage plays too, and the figure turns with a drag.
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!drag || !figure) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 3) drag.moved = true; figure.root.rotation.y += dx * 0.01; drag.x = e.clientX; });
canvas.addEventListener('pointerup', () => { if (drag && !drag.moved) play(); drag = null; });

function resize() {
  const r = $('stage').getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  post.resize(w, h);
  env.uResolution.value.set(post.width, post.heightPx);
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const talking = playing && (voice.active() || now < playUntil);
  if (playing && !talking) { playing = false; $('play').classList.remove('on'); }
  if (figure) {
    figure.pose(dt, { talking, typing: talking, gesture: talking ? 'talk' : 'fidget' });
    // The head fills the stage, neck and shoulders below it.
    const hh = figure.hitHeight || 1.8, y = hh * 0.9 + 0.02;
    const d = camera.aspect > 1.2 ? 1.0 : 0.9;
    camera.position.set(0.2, y, d);
    camera.lookAt(0, y - 0.05, 0);
  }
  updateLights(lights, now / 1000, camera);
  env.uTime.value = now / 1000;
  post.render(scene, camera, now / 1000);
  requestAnimationFrame(frame);
}

buildSliders();
resize();
requestAnimationFrame(frame);
if (typeof speechSynthesis !== 'undefined') { fillSystemVoices(); speechSynthesis.onvoiceschanged = fillSystemVoices; }
loadPeople().then((p) => { people = p; fillPeople(); pick(0); resize(); }).catch(() => { people = []; fillPeople(); pick(-1); });

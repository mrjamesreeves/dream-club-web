// The Symbol Gallery: a dreamer's codex hung as prints in a round white
// room. The room is built on the page from whatever symbols it is handed
// (the app posts a codex in through window.gallery.load; the browser reads
// data/symbols.json), so nothing is generated ahead of time and a gallery
// of six symbols and one of sixty are the same code.
//
//   gallery.html                       James's codex from data/symbols.json
//   gallery.html?data=<url>            another export
//   gallery.html?app                   wait for the app to post the codex
//   ?tier=desk|phone                   force a quality tier
//   ?labels=name|none                  wall labels under the prints
//   ?nobed                             no bed at the centre
//
// Tap a print and the camera glides to it; tap again to step back. Arrows
// or ← → move along the wall. The reading (the codex summary) is behind a
// tap on the name, never on the wall.
import * as THREE from '../vendor/three.module.js?v=975bb43';

const STORAGE = 'https://opkalkbjecbnnavxnmdb.supabase.co/storage/v1/object/public/dream-images/';
const REST = 'https://opkalkbjecbnnavxnmdb.supabase.co/rest/v1/';
const KEY = 'sb_publishable_2cxTEoh2ZkVcMSb0e9JIDg_CK05bW4f';
const ROOMS = ['places', 'people', 'things', 'ideas'];

const params = new URLSearchParams(location.search);
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const TIER = params.get('tier') || (isTouch || Math.min(innerWidth, innerHeight) < 700 ? 'phone' : 'desk');
const phone = TIER === 'phone';

const state = {
  symbols: [], prints: [], def: null, game: null,
  labels: params.get('labels') || 'name',
  bed: !params.has('nobed'),
  visit: null, // { print, phase: in|on, t, seconds, from, to }
};
let resolveData = null;
const dataReady = new Promise((r) => { resolveData = r; });

// ---------- Symbols in ----------

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Accepts the export ({symbols, uncarded}) or a bare list. Only symbols
// with a card and at least one dream hang; the rest are names, not works.
function normalize(input) {
  const list = Array.isArray(input) ? input : (input && input.symbols) || [];
  const out = [];
  for (const s of list) {
    const count = s.count ?? (s.dreams ? s.dreams.length : 0);
    if (!s.symbol || !s.category || !(count > 0)) continue;
    out.push({
      id: 'sym:' + slug(s.symbol), symbol: s.symbol.trim().toLowerCase(), category: String(s.category).toLowerCase(),
      summary: (s.summary || '').trim(), detail: (s.detail || '').trim(), count,
      kind: s.iconKind || s.kind || null,
      image: s.image || (s.iconPath ? STORAGE + s.iconPath : null),
    });
  }
  const room = (c) => { const i = ROOMS.indexOf(c); return i < 0 ? ROOMS.length : i; };
  out.sort((a, b) => room(a.category) - room(b.category) || b.count - a.count || a.symbol.localeCompare(b.symbol));
  return out;
}

// Symbols that came without a picture ask the archive once. The archive is
// public and read-only; the ask carries symbol names and nothing else.
async function resolveImages(list) {
  const missing = list.filter((s) => !s.image && s.kind !== 'abstract');
  if (!missing.length) return;
  try {
    const names = missing.map((s) => '"' + s.symbol.replace(/"/g, '') + '"').join(',');
    const res = await fetch(`${REST}symbol_icons?select=symbol,kind,path&symbol=in.(${encodeURIComponent(names)})`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    if (!res.ok) return;
    const rows = await res.json();
    const by = new Map(rows.map((r) => [r.symbol, r]));
    for (const s of missing) { const r = by.get(s.symbol); if (r) { s.kind = r.kind; if (r.path) s.image = STORAGE + r.path; } }
  } catch (e) { console.warn('symbol icons', e); }
}

// ---------- The room ----------

const deg = (r) => (THREE.MathUtils.radToDeg(r) + 360) % 360;
const r3 = (v) => Math.round(v * 1000) / 1000;

function buildScene(list) {
  const n = list.length;
  const perBay = n <= 18 ? 1 : n <= 48 ? 2 : 3;
  const BAYS = Math.max(12, Math.ceil(n / perBay));
  const BAYW = 6.0;
  const WALL = Math.max(11.5, BAYS * BAYW / (2 * Math.PI));
  const CEIL = Math.min(10, Math.max(6.5, WALL * 0.45));
  const FIELD = 2 * WALL + 8;
  const EYE = 1.55;                    // the centre line the prints hang on
  const objs = []; const B = (o) => objs.push(o);
  const names = {};
  const prints = [];

  // The floor: white, lit, with the room faintly in it.
  B({ type: 'plane', pos: [0, 0, 0], size: [FIELD, FIELD], tex: 'white', color: '#c9c6bf', texScale: 1, shade: 1, seg: 4, surface: 'concrete', unique: true,
      reflect: phone ? 0.1 : 0.2, reflectScale: phone ? 0.3 : 0.45, lit: true, extra: { roughness: 0.2, metalness: 0, envMapIntensity: 0.25 } });
  // Bays of board-formed concrete under a concrete lid.
  const bayLen = 2 * WALL * Math.sin(Math.PI / BAYS) + 0.5;
  for (let k = 0; k < BAYS; k++) {
    const a = (k + 0.5) * 2 * Math.PI / BAYS;
    const x = WALL * Math.sin(a), z = -WALL * Math.cos(a);
    B({ type: 'box', pos: [r3(x), CEIL / 2, r3(z)], size: [bayLen, CEIL, 0.6], tex: 'ando', texScale: 1.8, shade: 1, seg: 1.6, rot: [0, r3(deg(Math.atan2(x, z))), 0], collide: true, walkable: false });
  }
  B({ type: 'cylinder', pos: [0, CEIL, 0], radius: WALL + 0.6, height: 0.4, sides: 32, tex: 'andoSmooth', color: '#8a8a86', texScale: 1.8, collide: false, unique: true, extra: { roughness: 0.95 } });
  // Light grazing up the concrete from just under the floor, every other bay.
  for (let k = 0; k < BAYS; k += 2) {
    const a = (k + 0.5) * 2 * Math.PI / BAYS;
    B({ type: 'light', pos: [r3((WALL - 0.5) * Math.sin(a)), -0.15, r3(-(WALL - 0.5) * Math.cos(a))], color: '#d8d8d4', intensity: 0.35, range: 9, flicker: 'soft' });
  }

  // The bed at the centre: where the dreams came from.
  if (state.bed) {
    const y0 = 0.28;
    B({ type: 'cylinder', pos: [0, 0, 0], radius: 3.2, height: y0, sides: 40, tex: 'stone', color: '#8c877d', texScale: 0.22, collide: false, unique: true, extra: { roughness: 0.85 } });
    B({ type: 'box', pos: [0, y0 + 0.25, 0], size: [1.7, 0.5, 2.3], tex: 'mahogany', texScale: 1, walkable: false });
    B({ type: 'box', id: 'bed', pos: [0, y0 + 0.62, 0.05], size: [1.56, 0.26, 2.1], tex: 'cream', texScale: 1, walkable: false,
        name: 'the bed', verb: 'look at', examineAt: [0, y0 + 0.7, 0.1], examineRadius: 1.1, examineRange: 3.8,
        examine: [{ who: 'bed', text: `${n} symbol${n === 1 ? '' : 's'} hang here.` }], then: [] });
    B({ type: 'box', pos: [0, y0 + 0.78, 0.4], size: [1.6, 0.1, 1.4], tex: 'velvet', color: '#6a6a74', texScale: 1, collide: false, walkable: false });
    B({ type: 'box', pos: [0, y0 + 0.8, -0.78], size: [0.7, 0.14, 0.42], tex: 'white', color: '#e8e4dc', collide: false, walkable: false });
    B({ type: 'box', pos: [0, y0 + 0.95, -1.2], size: [1.8, 1.4, 0.12], tex: 'mahogany', texScale: 1, walkable: false });
    B({ type: 'table', pos: [1.45, y0, -0.75], size: [0.6, 0.5], height: 0.62, tex: 'mahogany' });
    B({ type: 'tableLamp', id: 'bedLamp', pos: [1.52, y0 + 0.62, -0.85], color: '#ffd090', intensity: 1.0, range: 8, flicker: 'candle', glowSize: 0.4 });
    names.bed = 'THE BED';
  }

  // The prints, room by room around the wall, a name high on the wall where
  // each room begins.
  const slotOffsets = perBay === 1 ? [0] : perBay === 2 ? [-1.5, 1.5] : [-2, 0, 2];
  let lastRoom = null;
  list.forEach((s, i) => {
    const bay = Math.floor(i / perBay), slot = i % perBay;
    const a = (bay + 0.5) * 2 * Math.PI / BAYS;
    const nx = Math.sin(a), nz = -Math.cos(a);          // out from the centre to this bay
    const tx = Math.cos(a), tz = Math.sin(a);           // along the wall
    const off = slotOffsets[slot];
    const R = WALL - 0.31;
    const x = nx * R + tx * off, z = nz * R + tz * off;
    const facing = deg(Math.atan2(-nx, -nz));           // the print faces the centre
    const H = Math.min(2.0, Math.max(0.8, 0.8 + 0.32 * Math.log(s.count)));
    const id = s.id;
    if (s.image) {
      B({ type: 'print', id, image: s.image, pos: [r3(x), EYE, r3(z)], yaw: facing, size: [H * 0.8, H], aspect: 0.8 });
    } else {
      // A symbol without a picture hangs as wall text: the word on a mat.
      const W = Math.max(0.9, H * 0.9);
      B({ type: 'print', id, pos: [r3(x), EYE, r3(z)], yaw: facing, size: [W, H * 0.6], aspect: W / (H * 0.6), matColor: '#efede8' });
      B({ type: 'sign', pos: [r3(x + nx * -0.05), EYE, r3(z + nz * -0.05)], yaw: facing, size: [W * 0.9, W * 0.9 * 0.25], hires: true, smooth: true, textScale: 0.6, faded: true, intact: true, backing: false, fadeColor: '#2a2a28',
          parts: [{ text: s.symbol.toUpperCase(), font: 'caps', color: '#ffffff', tracking: 7 }] });
    }
    if (state.labels !== 'none') {
      const ly = EYE - H / 2 - 0.26;
      B({ type: 'sign', pos: [r3(x + nx * -0.02), r3(ly), r3(z + nz * -0.02)], yaw: facing, size: [1.6, 0.4], hires: true, smooth: true, textScale: 0.26, faded: true, intact: true, backing: false, fadeColor: '#3a3a38',
          parts: [{ text: s.symbol.toUpperCase(), font: 'caps', color: '#ffffff', tracking: 6 }] });
    }
    // The spot a tap lands on.
    B({ type: 'spot', id: id + ':look', pos: [r3(x), EYE, r3(z)], name: s.symbol.toUpperCase(), verb: 'look at', examineAt: [r3(x), EYE, r3(z)], examineRadius: Math.max(0.55, H / 2), examineRange: Math.max(5, WALL),
        examine: [], then: [{ visit: id }] });
    names[id + ':look'] = s.symbol.toUpperCase();
    // Its light: a fixture pulled off the wall so the light rakes the print.
    if (slot === Math.floor(perBay / 2) || perBay === 1) {
      const lx = nx * (WALL - 1.7), lz = nz * (WALL - 1.7);
      B({ type: 'spotlight', id: 'xl:' + id, pos: [r3(lx), CEIL, r3(lz)], drop: Math.max(1.2, CEIL - 4.4), intensity: phone ? 1.3 : 1.6, range: 7.5, color: '#f2ece0', glowSize: 0.18, glowStrength: 0.2, pool: false, flicker: 'soft',
          shadows: !phone, shadowOffset: [r3(-nx * 0.6), r3(-nz * 0.6)], cone: false, poolSize: 3.4, floor: 0 });
    }
    if (s.category !== lastRoom) {
      lastRoom = s.category;
      if (ROOMS.includes(s.category)) {
        const hx = nx * (WALL - 0.33) + tx * (-bayLen / 2 + 1.6), hz = nz * (WALL - 0.33) + tz * (-bayLen / 2 + 1.6);
        B({ type: 'sign', pos: [r3(hx), CEIL - 1.1, r3(hz)], yaw: facing, size: [2.4, 0.6], hires: true, smooth: true, textScale: 0.55, faded: true, intact: true, backing: false, fadeColor: '#77776f',
            parts: [{ text: s.category.toUpperCase(), font: 'caps', color: '#ffffff', tracking: 10 }] });
      }
    }
    prints.push({ ...s, i, pos: [x, EYE, z], normal: [nx, nz], H });
  });

  // You come in a few steps from the centre, facing the first print.
  const first = prints[0];
  const sx = first ? first.normal[0] * 4.2 : 0, sz = first ? first.normal[1] * 4.2 : 5;
  const syaw = first ? deg(Math.atan2(-first.normal[0], -first.normal[1])) : 0;

  const def = {
    name: 'gallery', title: 'SYMBOL GALLERY', card: { once: true, seconds: 2.6 }, noInventory: true,
    dialog: state.dialog,
    render: {
      height: phone ? 720 : 1080, quantize: false, grain: phone ? 0.008 : 0.012, vignette: 0.55,
      pbr: { exposure: 1.0, sun: 0.0, hemi: 0.32, skyColor: '#e4e6ea', groundColor: '#3a3a38', ambient: 0.07, point: 4, envIntensity: 0.22,
             bloom: { strength: phone ? 0 : 0.08, radius: 0.6, threshold: 1.0 }, shadows: false },
    },
    environment: { fogColor: '#d9d9d6', ambient: '#9a9a98', skyColor: '#e6e6e4', sunDir: [0.2, 0.9, 0.3], sunColor: '#000000',
                   fogNear: WALL * 1.2, fogFar: WALL * 5, fogHeight: 0.3, fogHeightRange: 3, fogHeightStrength: 0.15, jitter: 0, affine: false },
    sky: { top: '#e8e8e6', horizon: '#e8e8e6', moon: false, stars: 0 },
    particles: { dust: { count: phone ? 40 : 140, alpha: 0.12, color: '#ffffff', box: [WALL * 1.8, CEIL - 1, WALL * 1.8] }, floaters: { count: 0 } },
    indoor: [[-FIELD / 2 - 1, -FIELD / 2 - 1, FIELD / 2 + 1, FIELD / 2 + 1]],
    player: { pos: [r3(sx), 0, r3(sz)], yaw: r3(syaw), speed: 2.2 },
    ambience: [{ sound: 'hum', pos: [0, 0], range: 200, base: 0.25, gain: 0.08 }],
    names, objects: objs, events: [],
  };
  return { def, prints, WALL, CEIL };
}

// ---------- Visiting a print ----------

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

function poseFor(p) {
  const [nx, nz] = p.normal;
  const dist = Math.min(3.6, Math.max(1.9, p.H * 1.9));
  const pos = new THREE.Vector3(p.pos[0] - nx * dist, 0, p.pos[2] - nz * dist);
  const yaw = Math.atan2(-nx, -nz);
  const aspect = innerWidth / innerHeight;
  return { pos, eye: p.pos[1], yaw, pitch: 0, fov: aspect < 1 ? 62 : 50 };
}

function visit(id) {
  const g = state.game; if (!g || !g.world) return;
  const p = state.prints.find((x) => x.id === id);
  if (!p || (state.visit && state.visit.phase === 'in')) return;
  const pl = g.player;
  const from = { pos: pl.position.clone(), eye: pl.eyeHeight, yaw: pl.yaw, pitch: pl.pitch, fov: g.fovTarget ?? 72 };
  const to = poseFor(p);
  state.visit = { print: p, phase: 'in', t: 0, seconds: state.visit ? 1.3 : 1.6, from, to };
  g.visiting = true;
  pl.lookLock = true; pl.keys.clear();
  pl.seated = { yaw: pl.yaw, range: 0 };
  ui.show(p);
}

function leave() {
  const g = state.game, v = state.visit;
  if (!g || !v) return;
  state.visit = null; g.visiting = false;
  const pl = g.player;
  pl.stand(); pl.lookLock = false; g.fovTarget = null;
  pl.placeCamera();
  ui.hide();
}

function step(dir) {
  const v = state.visit; if (!v || !state.prints.length) return;
  const i = (v.print.i + dir + state.prints.length) % state.prints.length;
  visit(state.prints[i].id);
}

function updateVisit(dt) {
  const v = state.visit, g = state.game;
  if (!v || !g) return;
  const pl = g.player;
  if (v.phase === 'in') {
    v.t += dt;
    const k = ease(Math.min(1, v.t / v.seconds));
    pl.position.lerpVectors(v.from.pos, v.to.pos, k);
    pl.eyeHeight = v.from.eye + (v.to.eye - v.from.eye) * k;
    let dy = v.to.yaw - v.from.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    pl.yaw = v.from.yaw + dy * k; pl.pitch = v.from.pitch + (v.to.pitch - v.from.pitch) * k;
    g.fovTarget = v.from.fov + (v.to.fov - v.from.fov) * k;
    pl.seated.yaw = pl.yaw;
    pl.placeCamera();
    if (v.t >= v.seconds) { v.phase = 'on'; pl.seated = { yaw: pl.yaw, range: THREE.MathUtils.degToRad(14) }; }
  }
}

// ---------- The panel: a name, a count, and the reading behind a tap ----------

const ui = {
  el: null, name: null, count: null, read: null, prev: null, next: null, open: false,
  bind() {
    this.el = document.getElementById('g-panel'); this.name = document.getElementById('g-name'); this.count = document.getElementById('g-count');
    this.read = document.getElementById('g-read'); this.prev = document.getElementById('g-prev'); this.next = document.getElementById('g-next');
    const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
    this.prev.addEventListener('pointerdown', stop); this.next.addEventListener('pointerdown', stop); this.el.addEventListener('pointerdown', stop);
    this.prev.addEventListener('click', (e) => { stop(e); step(-1); });
    this.next.addEventListener('click', (e) => { stop(e); step(1); });
    this.el.addEventListener('click', (e) => { stop(e); this.toggleRead(); });
    window.addEventListener('keydown', (e) => {
      if (!state.visit) return;
      if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'Escape') leave();
    });
  },
  show(p) {
    this.name.textContent = p.symbol.toUpperCase();
    this.count.textContent = `${p.count} dream${p.count === 1 ? '' : 's'}`;
    this.read.textContent = p.summary || '';
    this.read.classList.add('hidden'); this.open = false;
    document.body.classList.add('visiting');
  },
  hide() { document.body.classList.remove('visiting'); this.read.classList.add('hidden'); this.open = false; },
  toggleRead() { if (!this.read.textContent) return; this.open = !this.open; this.read.classList.toggle('hidden', !this.open); },
};

// ---------- Wiring ----------

async function rebuild() {
  const list = state.symbols;
  await resolveImages(list);
  if (!state.dialog) {
    try { state.dialog = (await (await fetch('./scenes/hall.json')).json()).dialog; } catch (e) { state.dialog = undefined; }
  }
  const built = buildScene(list);
  state.def = built.def; state.prints = built.prints;
  return state.def;
}

window.DREAM_GENERATORS = Object.assign(window.DREAM_GENERATORS || {}, {
  gallery: async () => { await dataReady; return rebuild(); },
});
window.DREAM_SCENE = 'gallery';

window.gallery = {
  // The app, or anyone, hands over a codex: the export shape or a bare list
  // of { symbol, category, summary, count, iconKind, iconPath }.
  load(data) {
    state.symbols = normalize(typeof data === 'string' ? JSON.parse(data) : data);
    if (resolveData) { resolveData(); resolveData = null; }
    else if (state.game) { leave(); rebuild().then((def) => state.game.loadScene(def)); }
    return state.symbols.length;
  },
  visit, leave, next: () => step(1), prev: () => step(-1),
  get tier() { return TIER; },
  get symbols() { return state.symbols; },
  get prints() { return state.prints; },
};

// Fonts for the wall lettering must be in before the signs are drawn.
async function fonts() {
  try { await document.fonts.load('600 30px "Source Sans 3"'); } catch (e) { /* the fallback face will do */ }
}

(async () => {
  ui.bind();
  await fonts();
  await import('./main.js');
  const g = window.dream; state.game = g;
  g.onVisit = visit;
  g.onVisitTap = () => { if (state.visit && state.visit.phase === 'on') leave(); };
  g.frameHook = updateVisit;
  if (!params.has('app')) {
    const url = params.get('data') || './data/symbols.json';
    try { window.gallery.load(await (await fetch(url)).json()); }
    catch (e) { console.error(e); window.gallery.load([]); }
  }
})();

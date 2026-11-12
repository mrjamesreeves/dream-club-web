// The Symbol Gallery: a dreamer's most-dreamed symbols as objects on
// plinths in a round white room. The room is built on the page from
// whatever symbols it is handed (the app posts a codex in through
// window.gallery.load; the browser reads data/symbols.json), so nothing is
// generated ahead of time. The six symbols with the most dreams that have a
// picture to stand up get a plinth each; the picture is the symbol's icon
// with its subject lifted out (symbol-icons/cutouts/<slug>.png in the
// archive, made by tools/cut_symbols.sh), turning slowly in a spotlight.
//
//   gallery.html                       James's codex from data/symbols.json
//   gallery.html?data=<url>            another export
//   gallery.html?app                   wait for the app to post the codex
//   ?tier=desk|phone                   force a quality tier
//   ?labels=name|none                  the name on the plinth
//   ?nobed                             no bed at the centre
//   ?count=N                           how many plinths (six)
//
// Tap an object and the camera glides to its plinth; tap again to step
// back. Arrows or ← → move around the ring. The reading (the codex summary)
// is behind a tap on the name, never on the wall.
import * as THREE from '../vendor/three.module.js?v=50be1f4';

const STORAGE = 'https://opkalkbjecbnnavxnmdb.supabase.co/storage/v1/object/public/dream-images/';
const CUTOUTS = STORAGE + 'symbol-icons/cutouts/';

const params = new URLSearchParams(location.search);
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const TIER = params.get('tier') || (isTouch || Math.min(innerWidth, innerHeight) < 700 ? 'phone' : 'desk');
const phone = TIER === 'phone';
const SEATS = Math.max(1, Math.min(12, parseInt(params.get('count'), 10) || 6));

const state = {
  symbols: [], stations: [], def: null, game: null,
  labels: params.get('labels') || 'name',
  bed: !params.has('nobed'),
  visit: null, // { station, phase: in|on, t, seconds, from, to }
};
let resolveData = null;
const dataReady = new Promise((r) => { resolveData = r; });

// ---------- Symbols in ----------

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Accepts the export ({symbols, uncarded}) or a bare list, and keeps every
// symbol with a name, a room and at least one dream, most dreamed first.
function normalize(input) {
  const list = Array.isArray(input) ? input : (input && input.symbols) || [];
  const out = [];
  for (const s of list) {
    const count = s.count ?? (s.dreams ? s.dreams.length : 0);
    if (!s.symbol || !s.category || !(count > 0)) continue;
    const name = s.symbol.trim().toLowerCase(), kind = s.iconKind || s.kind || null;
    out.push({
      id: 'sym:' + slug(name), symbol: name, category: String(s.category).toLowerCase(),
      summary: (s.summary || '').trim(), detail: (s.detail || '').trim(), count, kind,
      image: s.image || (s.iconPath ? STORAGE + s.iconPath : null),
      cutout: s.cutout || (kind === 'abstract' ? null : CUTOUTS + slug(name) + '.png'),
    });
  }
  out.sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol));
  return out;
}

// A cutout is only known to exist once it has loaded, so the plinths go to
// the first symbols, in order of dreams, whose cutout answers.
const measure = (url) => new Promise((r) => {
  if (!url) return r(null);
  const im = new Image();
  im.onload = () => r(im.naturalWidth / im.naturalHeight);
  im.onerror = () => r(null);
  im.src = url;
});

async function pickObjects(list, want) {
  const found = [];
  for (let i = 0; i < list.length && found.length < want; i += 12) {
    const batch = list.slice(i, i + 12);
    const aspects = await Promise.all(batch.map((s) => measure(s.cutout)));
    batch.forEach((s, j) => { if (aspects[j]) found.push({ ...s, aspect: aspects[j] }); });
  }
  return found.slice(0, want);
}

// ---------- The room ----------

const deg = (r) => (THREE.MathUtils.radToDeg(r) + 360) % 360;
const r3 = (v) => Math.round(v * 1000) / 1000;

function buildScene(objects) {
  const n = objects.length;
  const WALL = 12.0, CEIL = 7.0, BAYS = 12;
  const FIELD = 2 * WALL + 8;
  const RING = 6.4;                    // the plinths stand on this circle
  const PW = 1.0, PH = 1.0;            // a plinth: footprint and height
  const LIFT = 0.22;                   // the object hangs this far above its plinth
  const objs = []; const B = (o) => objs.push(o);
  const names = {};
  const stations = [];

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
        examine: [{ who: 'bed', text: `${n} symbol${n === 1 ? '' : 's'} stand here.` }], then: [] });
    B({ type: 'box', pos: [0, y0 + 0.78, 0.4], size: [1.6, 0.1, 1.4], tex: 'velvet', color: '#6a6a74', texScale: 1, collide: false, walkable: false });
    B({ type: 'box', pos: [0, y0 + 0.8, -0.78], size: [0.7, 0.14, 0.42], tex: 'white', color: '#e8e4dc', collide: false, walkable: false });
    B({ type: 'box', pos: [0, y0 + 0.95, -1.2], size: [1.8, 1.4, 0.12], tex: 'mahogany', texScale: 1, walkable: false });
    B({ type: 'table', pos: [1.45, y0, -0.75], size: [0.6, 0.5], height: 0.62, tex: 'mahogany' });
    B({ type: 'tableLamp', id: 'bedLamp', pos: [1.52, y0 + 0.62, -0.85], color: '#ffd090', intensity: 1.0, range: 8, flicker: 'candle', glowSize: 0.4 });
    names.bed = 'THE BED';
  }

  // The plinths, on a ring, the most dreamed symbol straight ahead.
  objects.forEach((s, k) => {
    const a = k * 2 * Math.PI / Math.max(1, n);
    const nx = Math.sin(a), nz = -Math.cos(a);          // out from the centre to this plinth
    const x = nx * RING, z = nz * RING;
    const facing = deg(Math.atan2(-nx, -nz));           // toward the centre
    // The object's height grows with its dreams; wide things are held to the plinth's width.
    let H = Math.min(1.7, Math.max(0.9, 0.9 + 0.3 * Math.log(s.count)));
    let W = H * s.aspect;
    if (W > 1.9) { W = 1.9; H = W / s.aspect; }
    const oy = PH + LIFT + H / 2;
    const id = s.id;
    B({ type: 'box', pos: [r3(x), PH / 2, r3(z)], size: [PW, PH, PW], tex: 'andoSmooth', texScale: 1.8, shade: 1, walkable: false, rot: [0, facing, 0] });
    B({ type: 'cutout', id, image: s.cutout, pos: [r3(x), r3(oy), r3(z)], size: [r3(W), r3(H)], yaw: facing, spin: 5, bob: 0.04, breathe: 0, name: s.symbol.toUpperCase() });
    if (state.labels !== 'none') {
      const lx = x - nx * (PW / 2 + 0.006), lz = z - nz * (PW / 2 + 0.006);
      B({ type: 'sign', pos: [r3(lx), PH - 0.17, r3(lz)], yaw: facing, size: [1.0, 0.25], hires: true, smooth: true, textScale: 0.9, faded: true, intact: true, backing: false, fadeColor: '#eeeae2',
          parts: [{ text: s.symbol.toUpperCase(), font: 'caps', color: '#ffffff', tracking: 6 }] });
    }
    // The spot a tap lands on.
    B({ type: 'spot', id: id + ':look', pos: [r3(x), r3(oy), r3(z)], name: s.symbol.toUpperCase(), verb: 'look at', examineAt: [r3(x), r3(oy), r3(z)], examineRadius: Math.max(0.7, H / 2), examineRange: WALL * 1.5,
        examine: [], then: [{ visit: id }] });
    names[id + ':look'] = s.symbol.toUpperCase();
    // Its light, from the lid, with the object's shadow thrown toward the wall.
    B({ type: 'spotlight', id: 'xl:' + id, pos: [r3(x), CEIL, r3(z)], drop: r3(Math.max(0.8, CEIL - (oy + H / 2) - 1.3)), intensity: phone ? 1.4 : 1.8, range: 7.5, color: '#efeae0', glowSize: 0.18, glowStrength: 0.2, pool: false, flicker: 'soft',
        shadows: !phone, shadowOffset: [r3(-nx * 0.5), r3(-nz * 0.5)], cone: !phone, coneStrength: 0.05, poolSize: 3.0, floor: PH });
    stations.push({ ...s, i: k, pos: [x, oy, z], normal: [nx, nz], H, W });
  });

  // You come in a few steps from the centre, facing the first plinth.
  const first = stations[0];
  const sx = first ? first.normal[0] * 2.6 : 0, sz = first ? first.normal[1] * 2.6 : 5;
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
  return { def, stations, WALL, CEIL };
}

// ---------- Visiting a plinth ----------

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const EYE = 1.55;

function poseFor(p) {
  const [nx, nz] = p.normal;
  const dist = Math.min(4.2, Math.max(2.8, 2.4 + p.H * 1.1));
  const pos = new THREE.Vector3(p.pos[0] - nx * dist, 0, p.pos[2] - nz * dist);
  const yaw = Math.atan2(-nx, -nz);
  const pitch = Math.atan2(p.pos[1] - EYE, dist);
  const aspect = innerWidth / innerHeight;
  return { pos, eye: EYE, yaw, pitch, fov: aspect < 1 ? 60 : 48 };
}

function visit(id) {
  const g = state.game; if (!g || !g.world) return;
  const p = state.stations.find((x) => x.id === id);
  if (!p || (state.visit && state.visit.phase === 'in')) return;
  const pl = g.player;
  const from = { pos: pl.position.clone(), eye: pl.eyeHeight, yaw: pl.yaw, pitch: pl.pitch, fov: g.fovTarget ?? 72 };
  const to = poseFor(p);
  state.visit = { station: p, phase: 'in', t: 0, seconds: state.visit ? 1.3 : 1.6, from, to };
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
  const v = state.visit; if (!v || !state.stations.length) return;
  const i = (v.station.i + dir + state.stations.length) % state.stations.length;
  visit(state.stations[i].id);
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
  const objects = await pickObjects(state.symbols, SEATS);
  if (!state.dialog) {
    try { state.dialog = (await (await fetch('./scenes/hall.json')).json()).dialog; } catch (e) { state.dialog = undefined; }
  }
  const built = buildScene(objects);
  state.def = built.def; state.stations = built.stations;
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
  get stations() { return state.stations; },
};

// Fonts for the lettering must be in before the signs are drawn.
async function fonts() {
  try {
    // The faces come from a stylesheet; until it has arrived there is
    // nothing for fonts.load to wait on, so wait for the sheet first.
    const link = document.querySelector('link[href*="fonts.googleapis"]');
    if (link && !link.sheet) await new Promise((r) => { link.addEventListener('load', r, { once: true }); link.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
    await Promise.race([Promise.all([document.fonts.load('600 30px "Source Sans 3"'), document.fonts.load('400 15px "IBM Plex Serif"')]), new Promise((r) => setTimeout(r, 4000))]);
  } catch (e) { /* the fallback face will do */ }
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

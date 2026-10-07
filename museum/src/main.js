import * as THREE from '../vendor/three.module.js?v=6b6dcd0';
import { createTextures } from './engine/textures.js?v=6b6dcd0';
import { createEnvironment, applyEnvironmentConfig, assignLightsToObject } from './engine/ps1material.js?v=6b6dcd0';
import { PostPass } from './engine/post.js?v=6b6dcd0';
import { DreamAudio } from './engine/audio.js?v=6b6dcd0';
import { Player } from './engine/player.js?v=6b6dcd0';
import { Dialog } from './engine/dialog.js?v=6b6dcd0';
import { Inventory } from './engine/inventory.js?v=6b6dcd0';
import { SceneBuilder } from './scene/build.js?v=6b6dcd0';
import { updateBehavior, bodyBlocked } from './scene/behaviors.js?v=6b6dcd0';
import { Events } from './scene/events.js?v=6b6dcd0';
import { disposeTree } from './engine/merge.js?v=6b6dcd0';
import { assembleMuseum } from './museum.js?v=6b6dcd0';
import { checkPaths } from './engine/pathcheck.js?v=6b6dcd0';
import { Portrait } from './engine/portrait.js?v=6b6dcd0';
import { Voice, voiceFor } from './engine/voice.js?v=6b6dcd0';


// Scene files are fetched with the build's version stamp (so a browser that
// cached one build's files cannot mix them with another's) and retried, since
// a phone on a poor connection drops a request now and then.
const VERSION = (typeof window !== 'undefined' && window.DREAM_VERSION) || '';
async function fetchJSON(url, what) {
  const full = VERSION ? `${url}?v=${VERSION}` : url;
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(full, { cache: attempt ? 'reload' : 'default' });
      if (res.status === 404) throw new Error(`${what} is missing from this build`);
      if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (String(e.message).includes('missing from this build')) break;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new Error(`Could not load ${what}: ${lastErr && lastErr.message}`);
}

THREE.ColorManagement.enabled = false;

// A Set that remembers when each flag was first set, for "since" conditions.
class TimedSet extends Set {
  constructor(clock) { super(); this.clock = clock; this.times = new Map(); }
  add(v) { if (!this.has(v)) { this.times?.set(v, this.clock()); this.onAdd?.(v); } return super.add(v); }
  delete(v) { this.times?.delete(v); return super.delete(v); }
  clear() { this.times?.clear(); return super.clear(); }
  age(v) { const t = this.times.get(v); return t === undefined ? -1 : this.clock() - t; }
}

const ease = (k) => k * k * (3 - 2 * k);

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 160);
    this.env = createEnvironment();
    this.T = createTextures();
    this.audio = new DreamAudio();
    this.watchAudio();
    this.dialog = new Dialog(this.audio);
    this.dialog.voice = new Voice(this.audio);
    // A voice style for everyone, to hear the dreams one way or another:
    // ?voice=letters on the URL, or window.DREAM_VOICE_STYLE from a build.
    // (The museum's voice switch, when placed, keeps the choice in localStorage
    // under dream.voice; it is not read here while the switch is away.)
    this.voiceStyle = window.DREAM_VOICE_STYLE || new URLSearchParams(location.search).get('voice') || null;
    this.dialog.voiceOf = (who) => { const e = this.entities.get(who); if (!e) return null; return this.voiceStyle ? { ...e.voice, style: this.voiceStyle } : e.voice; };
    this.player = new Player(this.camera, this.canvas);
    this.post = new PostPass(this.renderer, { height: 216 });
    this.inventory = new Inventory(this.T, this.env.uResolution);
    this.portraitView = new Portrait();
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
    this.time = 0;
    this.flags = new TimedSet(() => this.time);
    this.entities = new Map();
    this.names = {};
    this.lastFrame = performance.now();
    this.started = false;
    this.hub = false;        // in the museum, between dreams
    this.night = [];         // exhibits collected since the museum was last seen
    this.loadProgress();
    this.flags.onAdd = (f) => this.collect(f);
    this.listening = false;
    this.listenTimer = 0;
    this.listenHeld = 0;
    this.playerTrail = [];
    this.fadeIn = null;   // { t, seconds } white veil fading away
    this.ending = null;   // { t, seconds, then, closed, hold, loading }
    this.veilValue = -1;
    this.timers = [];
    this.sequence = [];
    this.titlesMode = false;  // a collection that opens on a page of titles
    this.played = new Set();
    try { this.played = new Set(JSON.parse(sessionStorage.getItem('dream.played') || '[]')); } catch (e) { /* no storage */ }
    this.sceneIndex = 0;
    this.ui = {
      listen: document.getElementById('listen'),
      crosshair: document.getElementById('crosshair'),
      veil: document.getElementById('veil'),
      card: document.getElementById('card'),
      stall: document.getElementById('stall'),
      reticle: document.getElementById('reticle'),
      reticleText: document.getElementById('reticle-text'),
      cardText: document.getElementById('card-text'),
    };

    this.pickRay = new THREE.Raycaster();
    this.groundRay = new THREE.Raycaster();
    this.groundRay.far = 4;
    this.down = new THREE.Vector3(0, -1, 0);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    // If the phone drops the graphics context, get it back and rebuild the current dream.
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; this.setVeil(1); });
    this.canvas.addEventListener('webglcontextrestored', async () => {
      this.contextLost = false;
      try { await this.loadScene(this.sequence[this.sceneIndex]); this.startDream(); }
      catch (err) { this.showStall(`The dream didn't recover. ${err.message || err}`, () => location.reload()); }
    });

    // The list of dreams, opened from the journal by the bed.
    document.getElementById('chooser-back').addEventListener('click', (e) => { e.stopPropagation(); this.closeChooser(); });
    this.player.onLockChange = (locked) => {
      if (!this.started || this.chooserOpen) return;
      this.ui.crosshair.classList.toggle('hidden', !locked);
      if (!locked) this.dialog.showHint('click to continue', 4);
    };
    this.player.onStep = (surface) => this.audio.footstep(surface);
    // The first touch starts the game; after that a tap talks or looks.
    this.player.onTap = (x, y) => { if (!this.started) this.begin(); else this.interact(x, y); };

    window.addEventListener('keydown', (e) => {
      if (!this.started) return;
      const k = e.key.toLowerCase();
      if (k === 'e' || k === 'enter' || k === ' ') { e.preventDefault(); this.interact(); }
      if (e.repeat) return;
      const item = k === 'l' ? this.inventory.items.find((it) => it.def.use === 'listen') : this.inventory.slots['12345'.indexOf(k)];
      if (item && '12345l'.includes(k)) this.useItem(item);
    });
    // Mouse: with pointer lock a click talks or advances text. In drag-to-look
    // mode a click that did not drag acts like a tap at that point.
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = { moved: 0 };
      if (!this.started) { this.begin(); return; }
      if (this.player.locked) this.interact();
    });
    window.addEventListener('mousemove', (e) => { if (this.mouseDown) this.mouseDown.moved += Math.abs(e.movementX) + Math.abs(e.movementY); });
    window.addEventListener('mouseup', (e) => {
      const m = this.mouseDown; this.mouseDown = null;
      if (m && this.started && !this.player.locked && this.player.dragLook && m.moved < 6) this.interact(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('click', () => { if (this.started && !this.player.locked && !this.player.dragLook) this.player.lock(); });
    window.addEventListener('keydown', (e) => { if (!this.started && (e.key === 'Enter' || e.key === ' ')) this.begin(); });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.post.resize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.env.uResolution.value.set(this.post.width, this.post.heightPx);
    this.inventory.resize(this.post.width / this.post.heightPx);
    this.portraitView.resize(this.post.width / this.post.heightPx);
  }

  // The list of dreams: from the title screen, or from the journal by the bed.
  async openChooser() {
    const list = document.getElementById('chooser-list');
    this.chooserOpen = true;
    document.getElementById('chooser').classList.remove('hidden');
    if (this.started && document.pointerLockElement) document.exitPointerLock?.();
    if (list.children.length !== this.sequence.length) {
      list.innerHTML = '';
      this.sequence.forEach((name, i) => {
        const li = document.createElement('li');
        li.textContent = (this.titles && this.titles[name]) || name;
        li.addEventListener('click', (e) => { e.stopPropagation(); this.startAt(i, li); });
        list.appendChild(li);
      });
    }
    // Titles come from the scene files; fill them in as they arrive.
    if (!this.titles) {
      this.titles = {};
      for (const d of (this.exhibits && this.exhibits.dreams) || []) this.titles[d.name] = d.title;
      await Promise.all(this.sequence.map(async (name, i) => {
        try {
          if (!this.titles[name]) {
            const res = await fetch(`./scenes/${name}.json`);
            const def = await res.json();
            this.titles[name] = def.title || name;
          }
          if (list.children[i]) list.children[i].textContent = this.titles[name];
        } catch (err) { /* keep the file name */ }
      }));
    }
  }

  closeChooser() {
    if (!this.chooserOpen) return;
    this.chooserOpen = false;
    document.getElementById('chooser').classList.add('hidden');
    if (this.started && !this.player.locked) this.player.lock();
  }

  async startAt(i, li) {
    if (this.choosing) return;
    this.choosing = true;
    li?.classList.add('loading');
    try {
      if (this.started && this.hub) {
        // From the journal: that dream is the next one, and the bed takes you there.
        this.setNext(i);
        this.closeChooser();
        this.sleep();
      } else {
        if (i !== this.sceneIndex || this.hub) { this.sceneIndex = i; await this.loadScene(this.sequence[i]); }
        this.closeChooser();
        this.begin();
      }
    } finally {
      this.choosing = false;
      li?.classList.remove('loading');
    }
  }

  async loadSequence() {
    // The index is a list of dreams (the museum opens the game), or an
    // object { mode: "titles", title, scenes, titles } for a collection
    // that opens on a white page of titles instead.
    let index = null;
    try { index = await fetchJSON('./scenes/index.json', 'the list of dreams'); } catch (e) { /* single scene mode */ }
    if (Array.isArray(index)) this.sequence = index;
    else if (index && index.scenes) { this.sequence = index.scenes; this.collection = index; this.titlesMode = index.mode === 'titles'; this.titles = { ...(index.titles || {}) }; }
    if (!this.sequence.length) this.sequence = ['upstream'];
    // What each dream leaves in the museum, keyed by the flag that collects it.
    this.exhibits = { dreams: [], exhibits: [] };
    try { this.exhibits = await fetchJSON('./scenes/exhibits.json', 'the museum list'); } catch (e) { /* no museum pieces */ }
    this.exhibitIndex = new Map();
    for (const e of this.exhibits.exhibits || []) {
      const flags = e.flag ? [].concat(e.flag) : [`examined:${e.id.split('.').slice(1).join('.')}`];
      for (const f of flags) this.exhibitIndex.set(`${e.dream}:${f}`, e);
    }
  }

  // What the dreamer has met so far, and which dream the bed goes to next.
  loadProgress() {
    this.collected = new Set();
    this.nextIndex = null;
    try {
      const p = JSON.parse(localStorage.getItem('dreamgame') || '{}');
      this.collected = new Set(p.collected || []);
    } catch (e) { /* storage unavailable: a fresh museum each visit */ }
  }

  saveProgress() {
    try { localStorage.setItem('dreamgame', JSON.stringify({ collected: [...this.collected] })); } catch (e) { /* ignore */ }
  }

  // The journal's choice for the next time the dreamer lies down.
  setNext(i) { this.nextIndex = i; }

  // A flag set in a dream may be the one that puts something in the museum.
  collect(flag) {
    if (this.hub || !this.exhibitIndex) return;
    const e = this.exhibitIndex.get(`${this.sceneName}:${flag}`);
    if (!e || this.collected.has(e.id)) return;
    this.collected.add(e.id);
    this.night.push(e.id);
    this.saveProgress();
  }

  // Bring an exhibit into the museum: show it and bring its light up.
  switchOn(id, instant = false) {
    const e = this.entities.get(id);
    if (e) e.group.visible = true; else this.world.setObjectVisible(id, true);
    for (const k of this.world.objectsById.keys()) if (k.startsWith(id + '#')) this.world.setObjectVisible(k, true);
    for (const l of this.world.lights) {
      if (l.owner !== id && l.owner !== 'xl:' + id) continue;
      l.target = l.base;
      if (instant) l.intensity = l.current = l.base;
    }
  }

  // Things collected on earlier nights are simply there. Tonight's come on
  // one by one once the dreamer is back in the hall.
  async reveal() {
    const ids = this.night.slice();
    this.night = [];
    if (!ids.length) return;
    const world = this.world;
    await this.wait(3.5);
    for (const id of ids) {
      if (this.world !== world) return;
      this.switchOn(id);
      this.audio.confirm();
      await this.wait(1.4);
    }
  }

  async loadScene(nameOrJson) {
    let def = nameOrJson;
    if (typeof def === 'string') def = await fetchJSON(`./scenes/${def}.json`, `the dream "${def}"`);
    this.sceneName = typeof nameOrJson === 'string' ? nameOrJson : (def.name || '');
    this.hub = !!def.hub;
    if (this.hub) def = assembleMuseum(def, this.exhibits || {}, this.sequence);
    this.def = def;
    applyEnvironmentConfig(this.env, def.environment || {});
    this.renderer.setClearColor(this.env.uFogColor.value);
    if (def.render?.height) { this.post.height = def.render.height; this.resize(); }

    if (this.world) {
      this.scene.remove(this.world.group);
      // Free the last dream on the GPU before building the next one.
      if (!this.sharedTextures) this.sharedTextures = new Set(Object.values(this.T));
      disposeTree(this.world.group, this.sharedTextures, this.world.walkables.map((m) => m.geometry));
      this.world = null;
    }
    this.env.pointLights.length = 0;
    const builder = new SceneBuilder({ env: this.env, T: this.T, audio: this.audio });
    builder.build(def);
    this.world = builder;
    this.syncVoiceSwitch();
    this.occluders = null;
    this.reticleKey = null;
    // A vehicle the player rides: the interior stays put and tagged scenery
    // streams past. { axis, length, far, speed }.
    // A dream without a vehicle is silent of the last one's engine or rails.
    if (this.audio.ready) this.audio.setVehicle('engine', 0);
    this.ride = def.ride ? { axis: def.ride.axis || 'z', length: def.ride.length || 100, far: def.ride.far ?? 20, speed: def.ride.speed || 0, target: def.ride.speed || 0, rate: def.ride.rate ?? 0.6, offset: 0, rail: !!def.ride.rail } : null;
    this.swerveState = { roll: 0, x: 0, v: 0, vx: 0 };
    this.tweens = [];
    this.fovTarget = null;
    this.ambienceGain = {};
    this.focusState = null;
    this.player.lookLock = false;
    if (def.player && def.player.seat) this.player.seat(def.player.pos, def.player.yaw ?? 0, def.player.seat.range ?? 180, def.player.seat.eye ?? 1.15);
    else this.player.stand();
    this.scene.add(builder.group);
    this.entities = builder.entities;
    this.names = { you: '', ...builder.names, ...(def.names || {}) };
    this.player.colliders = builder.colliders;
    this.player.walkables = builder.walkables;
    const p = def.player || { pos: [0, 0, 0], yaw: 0 };
    this.player.setPose(p.pos, p.yaw || 0, p.pitch || 0);
    this.player.speed = p.speed ?? 2.1;
    this.flags.clear();
    this.stopListen();
    this.listenHeld = 0;
    this.inventory.clear();
    this.dialog.close();
    this.events = new Events(this, def.events || []);
    this.ambience = def.ambience || [];
    if (this.audio.ready) this.audio.setAmbientMusic(def.ambientMusic ?? (this.collection && this.collection.ambientMusic) ?? 1, this.sceneName);
    this.behaviorCtx = { player: this.player, camera: this.camera, playerTrail: this.playerTrail, walkables: builder.walkables, groundRay: this.groundRay, down: this.down, flags: this.flags, audio: this.audio, game: this, solid: !!def.solidWalls };
    this.playerTrail.length = 0;
    this.camera.fov = 72;
    this.player.move(0);
    if (this.started) this.events.start();
    if (this.hub) {
      const fresh = new Set(this.night);
      for (const id of this.collected) if (!fresh.has(id)) this.switchOn(id, true);
    }
  }

  setVeil(v) {
    const q = Math.round(v * 100) / 100;
    if (q === this.veilValue) return;
    this.veilValue = q;
    this.ui.veil.style.opacity = String(q);
  }

  // A title across the whole screen, slowly growing, then gone.
  showCard(text, hold = 4.2) {
    if (!text) return;
    const card = this.ui.card;
    this.ui.cardText.textContent = text;
    card.classList.toggle('long', text.length > 16);
    clearTimeout(this.cardTimer);
    card.classList.remove('on'); void card.offsetWidth; card.classList.add('on');
    card.style.opacity = '1';
    this.cardTimer = setTimeout(() => { card.style.opacity = '0'; }, hold * 1000);
  }

  // Keep sound alive: every touch or click nudges a stalled audio context.
  watchAudio() {
    const nudge = () => { if (this.audio.ready) this.audio.resume(); };
    for (const ev of ['touchend', 'pointerdown', 'keydown']) window.addEventListener(ev, nudge, { passive: true, capture: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) nudge(); });
  }

  begin() {
    this.audio.init();
    this.audio.resume();
    this.audio.setAmbientMusic(this.def.ambientMusic ?? (this.collection && this.collection.ambientMusic) ?? 1, this.sceneName);
    this.started = true;
    this.player.lock();
    this.events.start();
    if (this.hub) this.startHub(0); else this.startDream();
  }

  // The page of titles a collection opens on: white, the tales listed, the
  // ones read this session dimmer. A tale fades down from the white; its
  // ending fades back up to it.
  showTitles() {
    const el = document.getElementById('titles'), list = document.getElementById('titles-list');
    document.getElementById('titles-book').textContent = (this.collection && this.collection.title) || '';
    if (list.children.length !== this.sequence.length) {
      list.innerHTML = '';
      this.sequence.forEach((name, i) => {
        const li = document.createElement('li');
        li.textContent = (this.titles && this.titles[name]) || name;
        li.addEventListener('click', (e) => { e.stopPropagation(); this.startTale(i, li); });
        list.appendChild(li);
      });
    }
    [...list.children].forEach((li, i) => li.classList.toggle('played', this.played.has(this.sequence[i])));
    el.classList.remove('hidden');
    this.ui.card.classList.remove('on');
    this.setVeil(1);
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  async startTale(i, li) {
    if (this.choosing) return;
    this.choosing = true;
    li?.classList.add('loading');
    try {
      this.sceneIndex = i;
      await this.loadScene(this.sequence[i]);
      document.getElementById('titles').classList.add('hidden');
      this.begin();
    } finally {
      this.choosing = false;
      li?.classList.remove('loading');
    }
  }

  async toTitles() {
    this.played.add(this.sequence[this.sceneIndex]);
    try { sessionStorage.setItem('dream.played', JSON.stringify([...this.played])); } catch (e) { /* no storage */ }
    this.started = false;
    this.ending = null;
    this.fadeIn = null;
    this.dialog.close();
    this.showTitles();
  }

  // Into the museum: no card, no hint. The bed is lit; the rest is dark.
  startHub(fade = 0) {
    this.ending = null;
    this.fadeIn = fade ? { t: 0, seconds: fade } : null;
    this.setVeil(fade ? 1 : 0);
    if (this.audio.master) this.audio.master.gain.setTargetAtTime(0.9, this.audio.ctx.currentTime, 0.4);
    this.currentMusic = null;
  }

  // Getting into the bed: lie back, the lamp dims, white, and the next dream.
  sleep() {
    if (this.ending || !this.hub || !this.started) return;
    this.closeChooser();
    this.player.seat([0, 0.5, 0.1], 180, 30, 0.3);
    this.focus({ pos: [0.3, 11.5, 0.8], speed: 0.9 });
    for (const l of this.world.lights) if (l.owner === 'bedLamp') l.target = l.base * 0.2;
    this.audio.stir?.(0.5);
    this.beginEnding({ seconds: 5, then: 'sleep' });
  }

  // The bed goes to the first dream, or the one picked in the journal.
  async sleepInto() {
    this.sceneIndex = Math.min(Math.max(0, this.nextIndex ?? 0), this.sequence.length - 1);
    this.nextIndex = null;
    await this.loadScene(this.sequence[this.sceneIndex]);
    this.startDream();
  }

  // Back in the hall after the last dream, beside the bed.
  async wake() {
    await this.loadScene('museum');
    this.player.setPose([1.9, 0, 1.3], 90, 0);
    this.player.move(0);
    this.startHub(3.2);
    this.reveal();
  }

  startDream() {
    this.ending = null;
    this.fadeIn = { t: 0, seconds: 2.8 };
    this.setVeil(1);
    if (this.audio.master) this.audio.master.gain.setTargetAtTime(0.9, this.audio.ctx.currentTime, 0.4);
    const def = this.def;
    setTimeout(() => { if (this.def === def) this.showCard(def.title); }, 1900);
    const hint = this.player.isTouch ? (def.hintTouch || '') : (def.hint || '');
    if (hint) setTimeout(() => { if (this.def === def) this.dialog.showHint(hint, 8); }, 6000);
    if (def.music && this.audio.ready && def.music !== this.currentMusic) { this.currentMusic = def.music; this.audio.music(def.music); }
  }

  // Starts the white fade that ends the dream. Talking can carry on under it;
  // once it is fully white the dialogue closes and the next dream loads.
  beginEnding(opts = {}) {
    if (this.ending) return;
    const last = this.sceneIndex >= this.sequence.length - 1;
    const after = this.titlesMode ? 'titles' : (last ? 'wake' : 'next');
    this.ending = { t: 0, seconds: opts.seconds ?? 9, then: opts.then && opts.then !== 'next' ? opts.then : after, closed: false, hold: 0, loading: false };
    this.dialog.prompt.classList.add('hidden');
  }

  async advance(then) {
    try {
      if (then === 'titles' || (this.titlesMode && then !== 'sleep')) await this.toTitles();
      else if (then === 'title' || then === 'restart') await this.toTitle();
      else if (then === 'sleep') await this.sleepInto();
      else if (then === 'wake') await this.wake();
      else await this.nextDream();
    } catch (err) {
      // Stay on white and offer to try again, rather than dropping back into the old dream.
      console.error(err);
      this.showStall(`The next dream didn't load. ${err.message || err}`, () => location.reload());
    }
  }

  showStall(text, retry) {
    const el = this.ui.stall;
    el.querySelector('.msg').textContent = text;
    el.classList.remove('hidden');
    el.onclick = () => { el.classList.add('hidden'); retry(); };
  }

  async nextDream() {
    if (!this.retryingIndex) this.sceneIndex = (this.sceneIndex + 1) % this.sequence.length;
    this.retryingIndex = true;
    await this.loadScene(this.sequence[this.sceneIndex]);
    this.retryingIndex = false;
    this.startDream();
  }

  async toTitle() {
    this.started = false;
    this.sceneIndex = 0;
    await this.loadScene('museum');
    this.ending = null;
    this.fadeIn = null;
    this.setVeil(0);
    if (this.audio.master) this.audio.master.gain.setTargetAtTime(0.9, this.audio.ctx.currentTime, 0.4);
    this.showCard('Dream Game', 6);
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  setRide(spec) {
    if (!this.ride) return;
    if (typeof spec === 'number') this.ride.target = spec;
    else { if (spec.speed !== undefined) this.ride.target = spec.speed; if (spec.rate !== undefined) this.ride.rate = spec.rate; }
  }

  // A lean of the whole view: the vehicle throwing itself sideways.
  swerve(amount, seconds, sound) {
    this.swerveState.kick = { amount, seconds, t: 0 };
    if (sound && Math.abs(amount) > 0.5) this.audio.screech?.(Math.min(1, Math.abs(amount)));
  }

  // Moves a named object along a path over time. { id, path, seconds, then: 'hide' | 'reset', spin: [rx, ry, rz] }
  tween(spec) {
    const ob = this.world.objectsById.get(spec.id);
    if (!ob) return;
    const bases = ob.meshes.map((m) => m.position.clone());
    const origin = new THREE.Vector3().fromArray(ob.pos || [0, 0, 0]);
    const path = spec.path.map((p) => new THREE.Vector3().fromArray(p));
    if (spec.from === 'here') path.unshift(ob.meshes[0] ? ob.meshes[0].position.clone().sub(bases[0]).add(origin) : origin.clone());
    for (const m of ob.meshes) m.visible = true;
    this.tweens = this.tweens.filter((t) => t.id !== spec.id);
    this.tweens.push({ id: spec.id, ob, bases, origin, path, seconds: spec.seconds || 3, t: 0, then: spec.then, spin: spec.spin, ease: spec.ease });
  }

  updateTweens(dt) {
    const cur = new THREE.Vector3();
    for (const tw of this.tweens) {
      tw.t += dt;
      let k = Math.min(1, tw.t / tw.seconds);
      if (tw.ease === 'in') k = k * k; else if (tw.ease === 'out') k = 1 - (1 - k) * (1 - k);
      const segs = tw.path.length - 1;
      const f = k * segs, i = Math.min(segs - 1, Math.floor(f));
      cur.copy(tw.path[i]).lerp(tw.path[i + 1], f - i).sub(tw.origin);
      tw.ob.meshes.forEach((m, j) => {
        m.position.copy(tw.bases[j]).add(cur);
        if (tw.spin) { m.rotation.x += tw.spin[0] * dt; m.rotation.y += tw.spin[1] * dt; m.rotation.z += tw.spin[2] * dt; }
      });
      if (k >= 1) {
        if (tw.then === 'hide') for (const m of tw.ob.meshes) m.visible = false;
        if (tw.then === 'reset') tw.ob.meshes.forEach((m, j) => m.position.copy(tw.bases[j]));
        this.flags.add(`tweened:${tw.id}`);
      }
    }
    this.tweens = this.tweens.filter((t) => t.t < t.seconds);
  }

  // The ride: speed eases toward its target, scenery streams past, and the
  // view leans with swerves and trembles with speed.
  updateRide(dt) {
    const sw = this.player.sway, ss = this.swerveState;
    let roll = 0, px = 0, py = 0, pitch = 0;
    if (this.ride) {
      const r = this.ride;
      r.speed += (r.target - r.speed) * Math.min(1, dt * r.rate);
      r.offset += r.speed * dt;
      const ax = r.axis;
      for (const it of this.world.rolling) {
        const v = it.base[ax] + r.offset * (it.rate ?? 1);
        it.obj.position[ax] = r.far - ((r.far - v) % r.length + r.length) % r.length;
      }
      for (const m of this.world.rideMats) {
        const u = m.material.uniforms.uUvOffset.value;
        const per = r.offset / (m.size[m.axis] / m.scale);
        if (m.axis === 0) u.x = -per; else u.y = per;
      }
      const t = this.time, k = r.speed / 15;
      if (r.rail) { pitch += Math.sin(t * 9.1) * 0.0022 * k; py += Math.sin(t * 7.3) * 0.006 * k; roll += Math.sin(t * 1.3) * 0.012 * k; }
      else { py += (Math.sin(t * 11.3) * 0.004 + Math.sin(t * 27.1) * 0.002) * k; pitch += Math.sin(t * 13.7) * 0.0015 * k; }
      this.audio.setVehicle?.(r.rail ? 'rail' : 'engine', Math.min(1, r.speed / 18));
    }
    if (ss.kick) {
      const kk = ss.kick; kk.t += dt;
      const f = Math.min(1, kk.t / kk.seconds);
      const shape = Math.sin(f * Math.PI) * (1 - f * 0.3);
      roll += kk.amount * 0.14 * shape; px += kk.amount * 0.22 * shape;
      if (f >= 1) ss.kick = null;
    }
    sw.roll = roll; sw.x = px; sw.y = py; sw.pitch = pitch;
  }

  // Flag-driven effects on the view: vertigo, wind, numb hands.
  updateEffects(dt) {
    const pl = this.player;
    pl.push.set(0, 0, 0); pl.speedScale = 1;
    let fov = this.fovTarget ?? 72;
    for (const e of this.def.effects || []) {
      if (e.flag && !this.flags.has(e.flag)) continue;
      if (e.until && this.flags.has(e.until)) continue;
      const t = this.time;
      if (e.type === 'vertigo') {
        // Worst when looking down: the view swims and widens.
        const down = THREE.MathUtils.clamp((-pl.pitch - 0.25) / 0.9, 0, 1);
        const k = (e.strength ?? 1) * (0.25 + 0.75 * down);
        pl.sway.roll += (Math.sin(t * 0.9) * 0.02 + Math.sin(t * 4.7) * 0.012) * k;
        pl.sway.pitch += Math.sin(t * 3.1) * 0.01 * k;
        pl.sway.y += Math.sin(t * 2.3) * 0.015 * k;
        fov += 14 * down * (e.strength ?? 1);
      }
      if (e.type === 'wind') {
        const g = 0.5 + 0.5 * Math.sin(t * 0.7) + 0.3 * Math.sin(t * 2.9);
        pl.push.x += e.dir[0] * (e.strength ?? 1) * g; pl.push.z += e.dir[1] * (e.strength ?? 1) * g;
        pl.sway.roll += Math.sin(t * 5.3) * 0.006 * g;
      }
      if (e.type === 'slow') pl.speedScale *= e.scale ?? 0.4;
    }
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.listening ? 58 : fov, dt * 3);
  }

  // For tools/check_paths.js: can the player reach everything from where they start?
  checkPaths(opts) { return checkPaths(this, opts); }

  setEnvironment(cfg) {
    applyEnvironmentConfig(this.env, cfg || {});
    this.renderer.setClearColor(this.env.uFogColor.value);
  }

  // The game takes the camera and turns it toward something the player has to
  // see: { id } a person, { object } a named object, or { pos } a point.
  // Holds until `release`, or for `seconds` if given.
  focus(spec) {
    this.focusState = { ...spec, until: spec.seconds ? this.time + spec.seconds : null };
    this.player.lookLock = true;
  }

  releaseFocus() {
    this.focusState = null;
    this.player.lookLock = false;
    if (this.player.seated) {
      // Re-centre the seat's turning range on where we were made to look, within reason.
      const s = this.player.seated; let d = this.player.yaw - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.player.yaw = s.yaw + Math.max(-s.range, Math.min(s.range, d));
    }
  }

  focusPoint(f, out) {
    if (f.pos) return out.fromArray(f.pos);
    if (f.id) {
      const e = this.entities.get(f.id);
      if (!e) return null;
      const head = e.rig && e.rig.rig && e.rig.rig.head;
      if (head) { head.updateWorldMatrix(true, false); return head.getWorldPosition(out); }
      out.copy(e.group.position); out.y += (e.hitHeight || 1.6) * 0.7; return out;
    }
    if (f.object) {
      const ob = this.world.objectsById.get(f.object);
      if (!ob || !ob.meshes.length) return null;
      const box = new THREE.Box3();
      for (const m of ob.meshes) box.expandByObject(m);
      return box.getCenter(out);
    }
    return null;
  }

  updateFocus(dt) {
    const f = this.focusState;
    if (!f) return;
    if (f.until && this.time >= f.until) { this.releaseFocus(); return; }
    const pt = this.focusPoint(f, this._focusV || (this._focusV = new THREE.Vector3()));
    if (!pt) return;
    const cam = this.camera.position, pl = this.player;
    const dx = pt.x - cam.x, dy = pt.y - cam.y, dz = pt.z - cam.z;
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    let d = yaw - pl.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const k = Math.min(1, dt * (f.speed ?? 3.5));
    pl.yaw += d * k;
    pl.pitch += (THREE.MathUtils.clamp(pitch, -1.4, 1.4) - pl.pitch) * k;
  }

  // People keep their own space: two standing figures that overlap are
  // eased apart, and one standing in the player is eased off them. Seated,
  // slumped and scripted-still figures hold their ground; where the dream's
  // walls are solid, nobody is pushed into one.
  separateBodies(dt) {
    const list = this._bodies || (this._bodies = []);
    list.length = 0;
    const cam = this.camera.position;
    for (const e of this.entities.values()) {
      if (!e.group.visible || e.model !== 'humanoid') continue;
      if (e.pose.sit || e.pose.slump || e.pose.crawl) continue;
      const b = e.behavior && e.behavior.name;
      if (b === 'none' || b === 'sit' || b === 'dine' || b === 'slump') continue;
      const gp = e.group.position;
      if ((gp.x - cam.x) ** 2 + (gp.z - cam.z) ** 2 > 40 * 40) continue;
      list.push(e);
    }
    const solid = this.behaviorCtx && this.behaviorCtx.solid;
    const nudge = (e, dx, dz) => {
      const g = e.group.position;
      if (solid && bodyBlocked(this.behaviorCtx, g.x + dx, g.z + dz, g.y)) return;
      g.x += dx; g.z += dz;
    };
    const k = Math.min(1, dt * 6);
    for (let i = 0; i < list.length; i++) {
      const a = list[i].group.position;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j].group.position;
        if (Math.abs(a.y - b.y) > 1) continue;
        let dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz), min = 0.62;
        if (d >= min) continue;
        if (d < 0.001) { dx = Math.cos(i * 2.4 + j); dz = Math.sin(i * 2.4 + j); } else { dx /= d; dz /= d; }
        const push = (min - d) * 0.5 * k;
        nudge(list[i], -dx * push, -dz * push); nudge(list[j], dx * push, dz * push);
      }
      // Off the player.
      const p = this.player.position;
      if (Math.abs(a.y - p.y) < 1.2) {
        let dx = a.x - p.x, dz = a.z - p.z; const d = Math.hypot(dx, dz), min = 0.7;
        if (d < min) { if (d < 0.001) { dx = Math.sin(this.player.yaw); dz = Math.cos(this.player.yaw); } else { dx /= d; dz /= d; } nudge(list[i], dx * (min - d) * k, dz * (min - d) * k); }
      }
    }
  }

  // The voice switch (gen_museum.py voice_switch, not placed at the moment):
  // how everyone in the dreams speaks. The choice is kept on this device.
  // Flipping it says so, in the new voice. Triggered by {"voice": ...}.
  setVoiceStyle(style) {
    const styles = ['mumble', 'letters', 'speech'];
    if (style === 'toggle') style = styles[(styles.indexOf(this.voiceStyle || 'mumble') + 1) % styles.length];
    this.voiceStyle = style;
    try { localStorage.setItem('dream.voice', style); } catch (e) { /* no storage */ }
    this.syncVoiceSwitch();
    if (this.audio.ready) this.audio.confirm();
    const word = { mumble: 'Mumble.', letters: 'Letters.', speech: 'Speech.' }[style];
    this.dialog.say([{ who: 'you', text: `The lever clicks over. ${word}` }], this.names);
    this.dialog.voice.speak('One two, one two. Is this better?', voiceFor('switch', { hairStyle: 'short' }, { style, pitch: 150, speed: 8 }));
    this.dialog.voicing = true;
  }

  // The lever leans toward its label: left, upright, right.
  syncVoiceSwitch() {
    const lever = this.world && this.world.objectsById.get('voiceLever');
    if (!lever) return;
    const k = { mumble: -1, letters: 0, speech: 1 }[this.voiceStyle || 'mumble'] ?? -1;
    for (const m of lever.meshes) { m.rotation.z = -0.6 * k; m.position.x = lever.pos[0] + 0.06 * k; }
    const knob = this.world.objectsById.get('voiceKnob');
    if (knob) for (const m of knob.meshes) { m.position.x = knob.pos[0] + 0.12 * k; m.position.y = knob.pos[1] - 0.03 * Math.abs(k); }
  }

  // Mirrors: each pane near enough and facing the player is drawn into from
  // a camera reflected through its plane, with the near plane laid on the
  // glass so the wall behind it does not get in the way.
  renderMirrors() {
    const list = this.world.mirrors;
    if (!list || !list.length) return;
    const cam = this.camera, r = this.renderer;
    const M = this._mirrorTmp || (this._mirrorTmp = { pos: new THREE.Vector3(), n: new THREE.Vector3(), v: new THREE.Vector3(), look: new THREE.Vector3(), target: new THREE.Vector3(), q: new THREE.Quaternion(), plane: new THREE.Plane(), clip: new THREE.Vector4(), qq: new THREE.Vector4() });
    for (const m of list) {
      if (!m.mesh.visible) continue;
      m.mesh.getWorldPosition(M.pos);
      M.n.copy(m.normal);
      M.v.subVectors(cam.position, M.pos);
      if (M.v.dot(M.n) < 0.05 || M.v.length() > m.range) continue;
      const vc = m.camera;
      // The camera, reflected through the plane.
      const d = M.v.dot(M.n);
      vc.position.copy(cam.position).addScaledVector(M.n, -2 * d);
      cam.getWorldDirection(M.look);
      M.target.copy(cam.position).add(M.look);
      M.v.subVectors(M.target, M.pos); M.target.copy(M.target).addScaledVector(M.n, -2 * M.v.dot(M.n));
      vc.up.set(0, 1, 0).applyQuaternion(cam.quaternion); vc.up.addScaledVector(M.n, -2 * vc.up.dot(M.n));
      vc.lookAt(M.target);
      vc.fov = cam.fov; vc.aspect = cam.aspect; vc.near = cam.near; vc.far = cam.far; vc.updateProjectionMatrix();
      vc.updateMatrixWorld();
      // Oblique near plane: clip everything behind the glass.
      M.plane.setFromNormalAndCoplanarPoint(M.n, M.pos).applyMatrix4(vc.matrixWorldInverse);
      M.clip.set(M.plane.normal.x, M.plane.normal.y, M.plane.normal.z, M.plane.constant);
      const pm = vc.projectionMatrix.elements;
      M.qq.x = (Math.sign(M.clip.x) + pm[8]) / pm[0]; M.qq.y = (Math.sign(M.clip.y) + pm[9]) / pm[5]; M.qq.z = -1; M.qq.w = (1 + pm[10]) / pm[14];
      M.clip.multiplyScalar(2 / M.clip.dot(M.qq));
      pm[2] = M.clip.x; pm[6] = M.clip.y; pm[10] = M.clip.z + 1; pm[14] = M.clip.w;
      m.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      m.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
      m.mesh.visible = false;
      r.setRenderTarget(m.target); r.clear(); r.render(this.scene, vc); r.setRenderTarget(null);
      m.mesh.visible = true;
    }
  }

  // The speaker's portrait: while a character talks, a clone of their head
  // and neck is drawn small above the dialogue box, so blinks and the moving
  // mouth read whichever way they face. Thoughts have no speaker and no head.
  updatePortrait(dt) {
    const sp = this.speaker && this.entities.get(this.speaker);
    const on = !!(sp && sp.group.visible);
    const box = on ? this.dialog.box.getBoundingClientRect() : null;
    this.portrait = this.portraitView.update(dt, on ? sp : null, box) ? { scene: this.portraitView.scene, camera: this.portraitView.camera, env: this.env } : null;
  }

  // Promise that resolves after a span of game time.
  wait(seconds) { return new Promise((resolve) => this.timers.push({ at: this.time + seconds, resolve })); }

  flash(seconds = 1.4) {
    this.fadeIn = { t: 0, seconds };
    this.setVeil(1);
  }

  give(id) {
    const sceneDef = (this.def.items || {})[id];
    const it = this.inventory.add(id, sceneDef);
    if (!it) return;
    this.audio.pickup();
    this.flags.add(`has:${id}`);
  }

  // Using an item: the first of its uses whose conditions hold, else a thought about it.
  async useItem(item) {
    if (this.ending) return;
    if (item.def.use === 'listen') {
      if (this.listening) this.stopListen(); else this.startListen(item);
      this.audio.blip();
      return;
    }
    if (this.talking) return;
    if (this.dialog.open) this.dialog.close();
    this.audio.blip();
    const uses = item.def.uses || [];
    const use = uses.find((u) => this.events.check(u.when || {}));
    this.talking = true;
    try {
      if (use) {
        this.flags.add(`used:${item.id}`);
        if (use.consume) this.inventory.remove(item.id);
        for (const a of use.do || []) await this.events.act({ ...a, manual: true });
      } else {
        const text = item.def.useText || item.def.examine || `I turn ${item.def.name || 'it'} over in my hands.`;
        await this.dialog.say([].concat(text).map((t) => (typeof t === 'string' ? { who: 'you', text: t } : t)), this.names);
      }
    } finally {
      this.talking = false;
    }
  }

  // Where a character or named object is, for 'near' conditions.
  positionOf(id) {
    const e = this.entities.get(id);
    if (e) return e.group.position;
    const ob = this.world.objectsById.get(id);
    if (ob?.examinable) return ob.examinable.center;
    if (ob?.meshes?.[0]) return ob.meshes[0].getWorldPosition(new THREE.Vector3());
    return null;
  }

  startListen(item) {
    this.listening = true;
    this.listenTimer = 0;
    this.audio.setListen(true);
    this.inventory.setActive(item.id, true);
  }

  stopListen() {
    if (!this.listening) return;
    this.listening = false;
    this.audio.setListen(false);
    for (const it of this.inventory.items) it.active = false;
  }

  interact(x, y) {
    if (!this.started) return;
    if (x !== undefined && !this.ending) {
      const item = this.inventory.hit(x, y, window.innerWidth, window.innerHeight);
      if (item) { this.useItem(item); return; }
    }
    if (this.dialog.open) { this.dialog.advance(); return; }
    if (this.ending || this.talking || !this.player.active) return;
    const target = this.findTarget(x, y);
    if (!target) return;
    if (target.kind === 'talk') this.talkTo(target.e);
    else this.examine(target.ex);
  }

  // What the player is pointing at: along the tap, or straight ahead.
  // Each candidate is a sphere; the one the aim passes closest to the middle
  // of (relative to its size) wins, so a coin on a table beats the diner
  // beside it and a bartender beats the mirror behind him. Anything behind a
  // wall or the floor along the aim is skipped.
  findTarget(x, y) {
    const ndc = x === undefined ? new THREE.Vector2(0, 0) : new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.pickRay.setFromCamera(ndc, this.camera);
    const ray = this.pickRay.ray;
    const to = new THREE.Vector3();
    const found = [];
    const consider = (center, radius, reach, make, bonus = 0) => {
      to.copy(center).sub(ray.origin);
      const along = to.dot(ray.direction);
      if (along <= 0.05 || along - radius > reach) return;
      const miss = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (miss > radius) return;
      // Size helps a small thing be hit, but a big thing gets no advantage from it.
      const score = miss / Math.min(radius, 0.5) + along * 0.08 - bonus;
      found.push({ score, along, radius, make, point: center.clone() });
    };
    const c = new THREE.Vector3();
    for (const e of this.entities.values()) {
      if ((!e.talkable && !e.examineLines) || !e.group.visible) continue;
      // Something only there to be looked at is done with once it has been.
      if (!e.talkable && !e.examineThen && !this.hub && this.flags.has(`examined:${e.id}`)) continue;
      const seated = e.pose.sit || e.pose.slump, crawling = e.pose.crawl;
      const h = e.hitHeight || 1.6;
      c.copy(e.group.position); c.y += crawling ? 0.55 : seated ? 1.0 : (h > 1.2 ? 1.25 : h * 0.55);
      const r = crawling ? 0.6 : seated ? 0.55 : (h > 1.2 ? 0.62 : Math.max(0.45, h * 0.6));
      consider(c, r, e.talkable ? e.talkRadius : 6, () => (e.talkable ? { kind: 'talk', e, name: e.name }
        : { kind: 'examine', name: e.name, ex: { id: e.id, name: e.name, lines: e.examineLines, meshes: [], pickup: null, then: e.examineThen } }), 0.3);
    }
    for (const ex of this.world.examinables) {
      if (ex.hidden || ex.done) continue;
      if (ex.if && !this.events.check(ex.if)) continue;
      let center = ex.center;
      // A long thing (a shoreline) is met straight ahead wherever you stand along it.
      if (ex.track) {
        center = c.copy(ex.center);
        const [lo, hi] = ex.trackRange || [-Infinity, Infinity];
        center[ex.track] = THREE.MathUtils.clamp(this.camera.position[ex.track], lo, hi);
      }
      consider(center, ex.radius + 0.06, ex.range, () => ({ kind: 'examine', ex, name: ex.name }));
    }
    found.sort((a, b) => a.score - b.score);
    let best = null, wall;
    for (const f of found) {
      if (wall === undefined) wall = this.wallDistance(ray, Math.max(...found.map((g) => g.along + g.radius)));
      // Visible if the near side of it comes before the first thing the aim hits.
      if (f.along - f.radius > wall + 0.25) continue;
      best = f.make(); best.point = f.point; break;
    }
    if (!best && x === undefined) {
      // Facing someone nearby counts, even if the aim is a little off.
      const e = this.findTalkTarget();
      if (e) {
        best = { kind: 'talk', e, name: e.name };
        best.point = e.group.position.clone(); best.point.y += (e.pose.sit || e.pose.slump) ? 1.0 : 1.25;
      }
    }
    return best;
  }

  // Distance along a ray to the first solid thing in the scene (not people).
  wallDistance(ray, far) {
    if (!this.occluders) {
      const skip = new Set();
      for (const e of this.entities.values()) e.group.traverse((o) => skip.add(o));
      this.occluders = [];
      this.world.group.traverse((o) => {
        if (o.isMesh && !skip.has(o) && !o.userData.noOcclude && !(o.material && o.material.transparent)) this.occluders.push(o);
      });
    }
    const root = this.world.group;
    const shown = (o) => { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; };
    this.occludeCaster = this.occludeCaster || new THREE.Raycaster();
    this.occludeCaster.ray.copy(ray);
    this.occludeCaster.far = far;
    for (const h of this.occludeCaster.intersectObjects(this.occluders, false)) if (shown(h.object)) return h.distance;
    return Infinity;
  }

  // The targeting ring over whatever the aim is on, with what to do.
  updateReticle(target) {
    const el = this.ui.reticle;
    if (!target) {
      if (this.reticleKey) { el.classList.remove('on'); this.reticleKey = null; }
      return;
    }
    const key = target.kind === 'talk' ? `t:${target.e.id}` : `x:${target.ex.id}`;
    if (key !== this.reticleKey) {
      this.reticleKey = key;
      const verb = target.kind === 'talk' ? 'talk to' : (target.ex.verb || (target.ex.pickup ? 'pick up' : 'look at'));
      this.ui.reticleText.textContent = `${verb} ${target.name}`;
      // Restart the lock-on animation for a new target.
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    }
    const v = target.point.clone().project(this.camera);
    const w = window.innerWidth, h = window.innerHeight;
    const sx = THREE.MathUtils.clamp((v.x + 1) / 2 * w, 90, w - 90);
    const sy = THREE.MathUtils.clamp((1 - v.y) / 2 * h, 40, h - 90);
    el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
  }

  async examine(ex) {
    if (this.talking || this.ending) return;
    this.talking = true;
    try {
      if (ex.lines.length) await this.dialog.say(ex.lines, this.names);
      if (this.ending) return;
      this.flags.add(`examined:${ex.id}`);
      // Once its lines have been read, a thing that only has lines stops
      // offering itself (the museum's plaques stay readable).
      if (!ex.pickup && !ex.then && !this.hub) ex.done = true;
      if (ex.pickup) {
        ex.hidden = true;
        for (const m of ex.meshes) m.visible = false;
        this.give(ex.pickup);
      }
      if (ex.then) for (const a of ex.then) await this.events.act({ ...a, manual: true });
    } finally {
      this.talking = false;
    }
  }

  // Nearest talkable entity in front of the player.
  findTalkTarget() {
    const cam = this.camera.position;
    let best = null, bestD = Infinity;
    const v = new THREE.Vector3();
    for (const e of this.entities.values()) {
      if (!e.talkable || !e.group.visible) continue;
      e.group.getWorldPosition(v); v.y += (e.hitHeight || 1.6) * 0.55;
      const d = v.distanceTo(cam);
      if (d > e.talkRadius) continue;
      v.sub(cam).normalize();
      if (v.dot(this.player.lookDir) < 0.7) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  async talkTo(e) {
    if (!this.player.active || this.talking || this.ending) return;
    const entry = e.dialog.find((d) => this.events.check(d.if || {}));
    if (!entry) return;
    this.talking = true;
    try {
      if (entry.ending) this.beginEnding(entry.ending);
      if (entry.set && entry.ending) for (const f of [].concat(entry.set)) this.flags.add(f);
      // Variants: something different each time you come back.
      let lines = entry.lines;
      if (entry.variants) {
        e._talks = (e._talks || 0) + 1;
        lines = entry.variants[(e._talks - 1) % entry.variants.length];
      }
      await this.dialog.say(lines.map((l) => (typeof l === 'string' ? { who: e.id, text: l } : l)), this.names);
      if (this.ending) return;
      if (entry.set) for (const f of [].concat(entry.set)) this.flags.add(f);
      this.flags.add(`talked:${e.id}`);
      if (entry.then) for (const a of entry.then) await this.events.act(a);
    } finally {
      this.talking = false;
    }
  }

  // Distance on the ground from the player to an ambience shape: a point, a
  // line, or a box [x0, z0, x1, z1] (zero inside).
  shapeDistance(a, p) {
    if (a.box) {
      const [x0, z0, x1, z1] = a.box;
      const dx = Math.max(x0 - p.x, 0, p.x - x1), dz = Math.max(z0 - p.z, 0, p.z - z1);
      return Math.hypot(dx, dz);
    }
    if (a.line) {
      const [ax, az] = a.line[0], [bx, bz] = a.line[1];
      const abx = bx - ax, abz = bz - az;
      const t = THREE.MathUtils.clamp(((p.x - ax) * abx + (p.z - az) * abz) / (abx * abx + abz * abz || 1), 0, 1);
      return Math.hypot(p.x - (ax + abx * t), p.z - (az + abz * t));
    }
    if (a.pos) return Math.hypot(p.x - a.pos[0], p.z - a.pos[1]);
    return 0;
  }

  updateAmbience() {
    const p = this.player.position;
    const levels = { ocean: 0, stream: 0, wind: 0, murmur: 0, clink: 0, hum: 0, traffic: 0, drip: 0, music: 0, musicStyle: null, cries: 0 };
    for (const a of this.ambience) {
      const d = this.shapeDistance(a, p);
      const range = a.range ?? 20;
      const v = ((a.base ?? 0) + (1 - (a.base ?? 0)) * Math.max(0, 1 - d / range)) * (a.gain ?? 1);
      const key = a.sound;
      if (key === 'music') {
        if (v > levels.music) { levels.music = v; levels.musicStyle = a.style || 'lounge'; }
      } else levels[key] = Math.max(levels[key] || 0, v);
    }
    // Running time machines whirr when you are near them.
    if (this.world.machines) for (const m of this.world.machines.values()) {
      const d = Math.hypot(p.x - m.pos.x, p.z - m.pos.z);
      levels.whirr = Math.max(levels.whirr || 0, (0.12 + 0.88 * m.active) * Math.max(0, 1 - d / 9) * (m.active > 0.02 || d < 4 ? 1 : 0));
    }
    for (const [k, v] of Object.entries(this.ambienceGain)) if (levels[k] !== undefined) levels[k] *= v;
    this.audio.setAmbience(levels);
  }

  // Is the camera inside one of the scene's indoor boxes [x0, z0, x1, z1, minY?]?
  isIndoor() {
    const c = this.camera.position;
    for (const b of this.def.indoor || []) {
      if (c.x >= b[0] && c.x <= b[2] && c.z >= b[1] && c.z <= b[3] && (b[4] === undefined || c.y >= b[4])) return true;
    }
    return false;
  }

  update(dt) {
    this.time += dt;
    this.env.uTime.value = this.time;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) { this.timers = this.timers.filter((t) => t.at > this.time); for (const t of due) t.resolve(); }
    }
    // Looking and walking stay available through dialogue and scripted moments.
    this.player.enabled = this.started && !this.ending && !(this.fadeIn && this.fadeIn.t < 0.4);
    this.updateRide(dt);
    this.updateEffects(dt);
    this.updateTweens(dt);
    this.updateFocus(dt);
    this.player.move(dt);

    const last = this.playerTrail[0];
    const pp = this.player.position;
    if (this.player.grounded && (!last || Math.hypot(last.x - pp.x, last.z - pp.z) > 0.5 || Math.abs(last.y - pp.y) > 0.3)) {
      this.trailSeq = (this.trailSeq || 0) + 1;
      this.playerTrail.unshift({ x: pp.x, y: pp.y, z: pp.z, seq: this.trailSeq });
      if (this.playerTrail.length > 120) this.playerTrail.pop();
    }

    const cam = this.camera.position;
    this.speaker = this.dialog.open ? this.dialog.speaker : null;
    for (const e of this.entities.values()) {
      if (!e.group.visible) continue;
      // People in other parts of the dream rest until the player is near.
      const gp = e.group.position;
      if ((gp.x - cam.x) ** 2 + (gp.z - cam.z) ** 2 > 70 * 70) continue;
      updateBehavior(e, dt, this.behaviorCtx);
      e.rig.pose(dt, e.pose);
      assignLightsToObject(this.env, e.group, e.group.position);
    }
    this.separateBodies(dt);

    if (this.listening) {
      this.listenTimer += dt;
      this.listenHeld += dt;
      if (this.listenHeld > 2.5) this.flags.add('listened');
      if (this.listenTimer > 9) this.stopListen();
      this.ui.listen.textContent = 'listening' + '.'.repeat(1 + Math.floor(this.time * 2) % 3);
      this.ui.listen.classList.remove('hidden');
    } else {
      this.ui.listen.classList.add('hidden');
    }
    this.camera.updateProjectionMatrix();

    this.world.update(dt, this.time, this.camera, this.isIndoor());
    if (this.started && !this.ending) this.events.update(dt);
    this.dialog.update(dt);
    this.updateAmbience();
    this.audio.tick(dt);
    this.inventory.update(dt);

    const target = (this.started && !this.ending && !this.dialog.open && !this.talking && this.player.active) ? this.findTarget() : null;
    this.updateReticle(target);

    let veil = 0;
    if (this.fadeIn) {
      this.fadeIn.t += dt;
      const k = Math.min(1, this.fadeIn.t / this.fadeIn.seconds);
      veil = 1 - ease(k);
      if (k >= 1) this.fadeIn = null;
    }
    const e = this.ending;
    if (e) {
      e.t += dt;
      const k = Math.min(1, e.t / e.seconds);
      veil = Math.max(veil, k * k);
      if (this.audio.master) this.audio.master.gain.setTargetAtTime(0.9 * (1 - k), this.audio.ctx.currentTime, 0.4);
      if (k >= 1 && !e.closed) { e.closed = true; this.dialog.close(); this.stopListen(); }
      if (e.closed) {
        e.hold += dt;
        if (e.hold > 1.2 && !e.loading) { e.loading = true; this.advance(e.then); }
      }
    }
    if (this.started || this.fadeIn || e) this.setVeil(veil);
  }

  loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.world && !this.contextLost) this.update(dt);
    const inv = this.started && !this.hub;
    if (!this.contextLost && this.world) { this.inventory.shown = inv; this.updatePortrait(dt); }
    if (this.world && !this.contextLost) this.renderMirrors();
    this.post.render(this.scene, this.camera, this.time, inv ? this.inventory : null, this.world && !this.contextLost ? this.portrait : null);
    requestAnimationFrame(() => this.loop());
  }
}

const game = new Game();
const params = new URLSearchParams(location.search);
(async () => {
  await game.loadSequence();
  if (params.has('reset')) { game.collected = new Set(); game.night = []; game.saveProgress(); }
  // ?all lights every exhibit (for looking at the museum while making dreams).
  if (params.has('all')) { for (const e of game.exhibits.exhibits || []) game.collected.add(e.id); game.night = []; }
  // ?scene=name starts straight into that dream; otherwise the museum first.
  const requested = params.get('scene');
  if (requested && requested !== 'museum') {
    const i = game.sequence.indexOf(requested);
    game.sceneIndex = i >= 0 ? i : 0;
    if (i < 0) game.sequence = [requested, ...game.sequence];
    await game.loadScene(game.sequence[game.sceneIndex]);
  } else if (game.titlesMode) {
    game.loop();
    game.showTitles();
    return;
  } else {
    await game.loadScene('museum');
  }
  game.loop();
  game.showCard(requested && requested !== 'museum' ? game.def.title : 'Dream Game', 6);
})().catch((err) => {
  console.error(err);
  game.showStall(String(err.message || err), () => location.reload());
});
window.dream = game;

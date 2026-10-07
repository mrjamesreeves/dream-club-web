// Synthesized PS1-era sound: everything is made from oscillators and noise and
// pushed through a low-pass + bit reducer so it sounds a little cheap and dusty.
// Generated music. Each style walks a melody over its scale and picks an
// instrument per note. Kept quiet and simple, like a restaurant heard from a table.
const semis = (base, n) => base * Math.pow(2, n / 12);
function walk(a, scale) {
  a.melody += Math.round((Math.random() - 0.5) * 3.2);
  a.melody = Math.max(0, Math.min(scale.length * 2 - 1, a.melody));
  const deg = scale[a.melody % scale.length] + 12 * Math.floor(a.melody / scale.length);
  return deg;
}
// Scales the dream music can drift round.
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], whole: [0, 2, 4, 6, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
  major: [0, 2, 4, 5, 7, 9, 11], pentatonic: [0, 2, 4, 7, 9],
};
const hashName = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };

const STYLES = {
  // A slow electric piano, for the dining room and the dead mall's muzak.
  lounge: { base: 220, step: 2.2, play(a) {
    const sc = [0, 3, 7, 10, 14], root = [0, 5, 7, 3][Math.floor(Math.random() * 4)];
    for (const d of [0, sc[1 + Math.floor(Math.random() * 2)], 7]) a.note('epiano', semis(this.base, root + d), 0.05, 2.4);
  } },
  // Pentatonic plucks over a slow accordion: Chinese and French at once.
  golden: { base: 293.66, step: 0.5, play(a) {
    const sc = [0, 2, 4, 7, 9];
    if (Math.random() < 0.25) return;
    if (Math.random() < 0.25) a.note('accordion', semis(this.base / 2, [0, 5, 7, 9][Math.floor(Math.random() * 4)]), 0.035, 1.4);
    else a.note('pluck', semis(this.base, walk(a, sc)), 0.07);
  } },
  // A drone with sitar phrases and mandolin tremolo: Indian and Italian.
  tajtoria: { base: 196, step: 0.42, drone: true, play(a) {
    const sc = [0, 1, 4, 5, 7, 8, 11];
    if (Math.random() < 0.3) return;
    a.note(Math.random() < 0.65 ? 'sitar' : 'mandolin', semis(this.base, walk(a, sc)), 0.05, 0.4);
  } },
  // A party heard from the next room: a plucked bass walking under electric piano stabs.
  party: { base: 110, step: 0.46, play(a) {
    const bass = [0, 0, 7, 10, 0, 5, 7, 3];
    this._i = ((this._i ?? 0) + 1) % bass.length;
    a.note('pluck', semis(this.base, bass[this._i]), 0.09, 0.5);
    if (this._i % 4 === 2 && Math.random() < 0.8) for (const d of [0, 3, 7]) a.note('epiano', semis(this.base * 4, bass[this._i] + d), 0.03, 0.6);
  } },
  // A deli radio: a slow swing tune, far off.
  radio: { base: 261.63, step: 0.7, play(a) {
    const sc = [0, 2, 4, 7, 9, 11];
    if (Math.random() < 0.3) return;
    a.note('epiano', semis(this.base, walk(a, sc)), 0.035, 0.9);
    if (Math.random() < 0.3) a.note('pluck', semis(this.base / 2, [0, 7][Math.floor(Math.random() * 2)]), 0.04, 0.5);
  } },
  // Bright marimba: the pizzeria and the cantina.
  pizzantina: { base: 261.63, step: 0.24, play(a) {
    const sc = [0, 2, 4, 5, 7, 9, 11];
    if (Math.random() < 0.22) return;
    a.note('marimba', semis(this.base, walk(a, sc)), 0.06);
    if (Math.random() < 0.15) a.note('marimba', semis(this.base / 2, [0, 5, 7][Math.floor(Math.random() * 3)]), 0.05);
  } },
};

export class DreamAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.listenMode = false;
    this.musicGain = null;
    this.stepToggle = false;
  }

  init(existing = null) {
    if (this.ready) return;
    // iOS: play through the silent switch, like a game rather than a ringtone.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
    const ctx = existing || new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;

    // Master bus: everything -> lowpass (fake 22kHz sample rate) -> bit reducer -> out.
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 6500; lp.Q.value = 0.7;
    const crusher = ctx.createWaveShaper();
    crusher.curve = this.makeCrushCurve(5);
    crusher.oversample = 'none';
    const out = ctx.createGain();
    out.gain.value = 0.8;
    this.master.connect(lp); lp.connect(crusher); crusher.connect(out); out.connect(ctx.destination);
    // Room beds (crowd, hum, clinks) skip the crusher: quiet noise through it
    // turns to crackle. They get a soft lowpass instead.
    this.bed = ctx.createGain(); this.bed.gain.value = 0.9;
    const bedLp = ctx.createBiquadFilter(); bedLp.type = 'lowpass'; bedLp.frequency.value = 2600; bedLp.Q.value = 0.5;
    this.bed.connect(bedLp); bedLp.connect(out);

    this.noise = this.makeNoiseBuffer(2.0);

    // Ocean: low rumble with slow swells, plus a hissy top layer.
    this.ocean = this.makeLayer({ type: 'lowpass', freq: 320, q: 0.8 });
    this.oceanHiss = this.makeLayer({ type: 'bandpass', freq: 1800, q: 0.6 });
    this.lfo(this.ocean.gain.gain, 0.07, 0.5, 0.5);
    this.lfo(this.oceanHiss.gain.gain, 0.09, 0.35, 0.35);
    this.oceanLevel = ctx.createGain(); this.oceanLevel.gain.value = 0;
    this.ocean.gain.connect(this.oceanLevel); this.oceanHiss.gain.connect(this.oceanLevel);
    this.oceanLevel.connect(this.master);

    // Stream: thin bright trickle with jitter.
    this.stream = this.makeLayer({ type: 'bandpass', freq: 2600, q: 1.2 });
    this.lfo(this.stream.gain.gain, 2.3, 0.15, 0.6);
    this.lfo(this.stream.filter.frequency, 0.37, 600, 2600);
    this.streamLevel = ctx.createGain(); this.streamLevel.gain.value = 0;
    this.stream.gain.connect(this.streamLevel); this.streamLevel.connect(this.master);

    // Wind: resonant band sweeping slowly.
    this.wind = this.makeLayer({ type: 'bandpass', freq: 420, q: 3 });
    this.lfo(this.wind.filter.frequency, 0.05, 220, 480);
    this.lfo(this.wind.gain.gain, 0.11, 0.4, 0.5);
    this.windLevel = ctx.createGain(); this.windLevel.gain.value = 0;
    this.wind.gain.connect(this.windLevel); this.windLevel.connect(this.master);

    // Listening device: a mains hum and a thin hiss.
    this.hum = ctx.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 55;
    const humLp = ctx.createBiquadFilter(); humLp.type = 'lowpass'; humLp.frequency.value = 180;
    this.humLevel = ctx.createGain(); this.humLevel.gain.value = 0;
    this.hum.connect(humLp); humLp.connect(this.humLevel); this.humLevel.connect(this.master);
    this.hum.start();

    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.master);

    // Crowd murmur: noise through three wandering formant bands, plus a low rumble.
    this.murmurLevel = ctx.createGain(); this.murmurLevel.gain.value = 0; this.murmurLevel.connect(this.bed);
    // Wide, slow bands: a room of voices, without a filter sweep you can hear.
    for (const [f, rate] of [[330, 0.21], [760, 0.29], [1500, 0.37]]) {
      const src = this.noiseSource();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.6;
      const g = ctx.createGain();
      this.lfo(bp.frequency, rate, f * 0.07, f);
      this.lfo(g.gain, rate * 0.61, 0.18, 0.55);
      src.connect(bp); bp.connect(g); g.connect(this.murmurLevel); src.start();
    }
    { const src = this.noiseSource(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
      const g = ctx.createGain(); g.gain.value = 0.5; src.connect(lp); lp.connect(g); g.connect(this.murmurLevel); src.start(); }

    // Far-off cries: thin voices through narrow high bands, wavering.
    this.criesLevel = ctx.createGain(); this.criesLevel.gain.value = 0; this.criesLevel.connect(this.bed);
    for (const [f, rate] of [[1900, 0.9], [2600, 1.3], [3300, 0.7]]) {
      const src = this.noiseSource();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 9;
      const g = ctx.createGain();
      this.lfo(bp.frequency, rate, f * 0.12, f);
      this.lfo(g.gain, rate * 1.7, 0.4, 0.45);
      src.connect(bp); bp.connect(g); g.connect(this.criesLevel); src.start();
    }

    // The time machine: a motor that climbs in pitch, a filtered rush that
    // wobbles, and a tick from the gears (see tick()).
    this.whirrLevel = ctx.createGain(); this.whirrLevel.gain.value = 0; this.whirrLevel.connect(this.master);
    this.whirrMotor = ctx.createOscillator(); this.whirrMotor.type = 'sawtooth'; this.whirrMotor.frequency.value = 40;
    { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 3;
      this.lfo(lp.frequency, 1.7, 160, 420);
      const g = ctx.createGain(); g.gain.value = 0.6; this.whirrMotor.connect(lp); lp.connect(g); g.connect(this.whirrLevel); this.whirrMotor.start(); }
    { const src = this.noiseSource(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
      this.lfo(bp.frequency, 3.1, 500, 1100);
      const g = ctx.createGain(); g.gain.value = 0.5; src.connect(bp); bp.connect(g); g.connect(this.whirrLevel); src.start(); }
    this.whirrTick = 0;

    // Vehicles: an engine note that climbs with speed, and a rail clatter.
    this.vehicleLevel = ctx.createGain(); this.vehicleLevel.gain.value = 0; this.vehicleLevel.connect(this.bed);
    this.engineOsc = ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 50;
    { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 2;
      const g = ctx.createGain(); g.gain.value = 0.7; this.engineOsc.connect(lp); lp.connect(g); g.connect(this.vehicleLevel); this.engineOsc.start(); }
    { const src = this.noiseSource(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      this.vehicleRush = ctx.createGain(); this.vehicleRush.gain.value = 0; src.connect(lp); lp.connect(this.vehicleRush); this.vehicleRush.connect(this.vehicleLevel); src.start(); }
    this.vehicle = { kind: 'engine', level: 0 };

    // Mains hum for fluorescent rooms.
    this.mains = ctx.createOscillator(); this.mains.type = 'sawtooth'; this.mains.frequency.value = 60;
    const mainsLp = ctx.createBiquadFilter(); mainsLp.type = 'lowpass'; mainsLp.frequency.value = 260;
    this.mainsLevel = ctx.createGain(); this.mainsLevel.gain.value = 0;
    this.mains.connect(mainsLp); mainsLp.connect(this.mainsLevel); this.mainsLevel.connect(this.bed); this.mains.start();

    // Distant traffic: a low swelling rumble.
    this.traffic = this.makeLayer({ type: 'lowpass', freq: 160, q: 0.9 });
    this.lfo(this.traffic.gain.gain, 0.06, 0.35, 0.55);
    this.trafficLevel = ctx.createGain(); this.trafficLevel.gain.value = 0;
    this.traffic.gain.connect(this.trafficLevel); this.trafficLevel.connect(this.master);

    // Generated music and its drone. It skips the bit crusher: the notes are
    // quiet (a band heard from a table) and a 5-bit curve rounds them to
    // nothing. A lowpass keeps them soft instead.
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0;
    const musicLp = ctx.createBiquadFilter(); musicLp.type = 'lowpass'; musicLp.frequency.value = 3600; musicLp.Q.value = 0.6;
    this.musicBus.connect(musicLp); musicLp.connect(out);
    this.drone = [ctx.createOscillator(), ctx.createOscillator()];
    const droneLp = ctx.createBiquadFilter(); droneLp.type = 'lowpass'; droneLp.frequency.value = 650;
    this.droneLevel = ctx.createGain(); this.droneLevel.gain.value = 0;
    for (const o of this.drone) { o.type = 'sawtooth'; o.connect(droneLp); o.start(); }
    this.lfo(droneLp.frequency, 0.13, 250, 650);
    droneLp.connect(this.droneLevel); this.droneLevel.connect(this.musicBus);

    this.buildAmbientMusic(out);

    this.levels = { clink: 0, traffic: 0, drip: 0, music: 0 };
    this.timersA = { clink: 1, car: 4, drip: 2, note: 0.5, bell: 6, swell: 20 };
    this.musicStyle = null;
    this.melody = 4;

    this.ready = true;
  }

  // Safari can leave the context 'interrupted' (a notification, the lock
  // screen, memory pressure), not just 'suspended'; any gesture brings it back.
  resume() { if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {}); }

  makeCrushCurve(bits) {
    const n = 4096, curve = new Float32Array(n), steps = 2 ** (bits - 1);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    return curve;
  }

  makeNoiseBuffer(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    src.playbackRate.value = 0.5 + Math.random() * 0.5;
    return src;
  }

  makeLayer({ type, freq, q }) {
    const src = this.noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const gain = this.ctx.createGain(); gain.gain.value = 0.5;
    src.connect(filter); filter.connect(gain);
    src.start();
    return { src, filter, gain };
  }

  lfo(param, rate, depth, offset) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = rate;
    const g = this.ctx.createGain(); g.gain.value = depth;
    osc.connect(g); g.connect(param);
    param.value = offset;
    osc.start();
  }

  // Continuous levels, called every frame with 0..1 values.
  setAmbience({ ocean = 0, stream = 0, wind = 0, murmur = 0, clink = 0, hum = 0, traffic = 0, drip = 0, music = 0, musicStyle = null, whirr = 0, cries = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const duck = this.listenMode ? 0.25 : 1;
    const boost = this.listenMode ? 2.4 : 1;
    this.oceanLevel.gain.setTargetAtTime(Math.min(1, ocean * 0.55 * boost), t, 0.3);
    this.streamLevel.gain.setTargetAtTime(stream * 0.22 * duck, t, 0.3);
    this.windLevel.gain.setTargetAtTime(wind * 0.18 * duck, t, 0.3);
    this.murmurLevel.gain.setTargetAtTime(murmur * 0.09 * duck, t, 0.6);
    this.criesLevel.gain.setTargetAtTime(cries * 0.05 * duck, t, 0.8);
    this.mainsLevel.gain.setTargetAtTime(hum * 0.02 * duck, t, 0.4);
    this.whirrLevel.gain.setTargetAtTime(whirr * 0.16 * duck, t, 0.25);
    this.whirrMotor.frequency.setTargetAtTime(38 + whirr * 50, t, 0.6);
    this.whirrTick = whirr;
    this.trafficLevel.gain.setTargetAtTime(traffic * 0.28 * duck, t, 0.5);
    this.musicBus.gain.setTargetAtTime(music * 0.6 * duck, t, 0.6);
    // The dream's own music gives way wherever something is really playing.
    this.ambientLevel.gain.setTargetAtTime(this.ambientOn * Math.max(0, 1 - music * 1.6) * 0.5 * duck, t, 1.2);
    const style = STYLES[musicStyle] || null;
    if (style !== this.musicStyle) {
      this.musicStyle = style;
      if (style) { this.drone[0].frequency.value = style.base / 2; this.drone[1].frequency.value = style.base * 0.75; }
    }
    this.droneLevel.gain.setTargetAtTime(style && style.drone ? 0.11 : 0, t, 0.6);
    this.levels = { clink: clink * duck, traffic: traffic * duck, drip: drip * duck, music };
  }

  // Engine or rails under the player, 0..1 with speed.
  setVehicle(kind, level) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.vehicle = { kind, level };
    const engine = kind === 'engine';
    this.vehicleLevel.gain.setTargetAtTime(level > 0.01 ? (engine ? 0.22 : 0.12) * Math.min(1, 0.3 + level) : 0, t, 0.3);
    this.engineOsc.frequency.setTargetAtTime(engine ? 42 + level * 90 : 30 + level * 10, t, 0.4);
    this.vehicleRush.gain.setTargetAtTime(level * (engine ? 0.35 : 0.6), t, 0.4);
  }

  // Event sounds and music notes, called every frame.
  tick(dt) {
    if (!this.ready) return;
    const L = this.levels, T = this.timersA;
    if (L.clink > 0.03 && (T.clink -= dt) <= 0) { this.clink(L.clink); T.clink = (0.35 + Math.random() * 2.2) / Math.max(0.4, L.clink); }
    if (L.traffic > 0.1 && (T.car -= dt) <= 0) { this.carPass(L.traffic); T.car = 6 + Math.random() * 12; }
    if (L.drip > 0.05 && (T.drip -= dt) <= 0) { this.drip(L.drip); T.drip = 1.5 + Math.random() * 5; }
    if (this.whirrTick > 0.05 && (T.gear = (T.gear ?? 0) - dt) <= 0) { this.gearTick(this.whirrTick); T.gear = 0.22 - this.whirrTick * 0.14; }
    if (this.vehicle.kind === 'rail' && this.vehicle.level > 0.05 && (T.rail = (T.rail ?? 0) - dt) <= 0) {
      this.railClack(this.vehicle.level); T.rail = Math.max(0.12, 0.9 / (0.2 + this.vehicle.level * 2));
    }
    const st = this.musicStyle;
    if (st && L.music > 0.03 && (T.note -= dt) <= 0) { st.play(this); T.note = st.step * (Math.random() < 0.2 ? 2 : 1); }
    if (this.ambientOn > 0 && L.music < 0.5) {
      if ((T.bell -= dt) <= 0) { this.bell(); T.bell = this.amb.bells * (0.5 + Math.random()); }
      if (this.amb.swells > 0 && (T.swell -= dt) <= 0) { this.swell(); T.swell = this.amb.swells * (0.6 + Math.random() * 0.9); }
      if ((T.chord = (T.chord ?? 18) - dt) <= 0) { this.nextChord(); T.chord = this.amb.chords * (0.7 + Math.random() * 0.6); }
    }
  }

  // The dream's own music: a slow detuned drone, a pad that drifts between
  // chords, bells far off through a long echo, and now and then a breath of
  // noise that rises and stops. Quiet and a little wrong, like a tape.
  buildAmbientMusic(out) {
    const ctx = this.ctx;
    this.ambientLevel = ctx.createGain(); this.ambientLevel.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.7;
    this.lfo(lp.frequency, 0.021, 500, 1400);
    this.ambientLp = lp;
    this.ambientLevel.connect(lp); lp.connect(out);
    this.ambientOn = 0;
    this.amb = { key: 0, scale: SCALES.minor, bells: 10, swells: 40, chords: 30, drone: 0.16 };
    // Echo for the bells.
    this.echo = ctx.createDelay(2); this.echo.delayTime.value = 0.41;
    const fb = ctx.createGain(); fb.gain.value = 0.52;
    const echoLp = ctx.createBiquadFilter(); echoLp.type = 'lowpass'; echoLp.frequency.value = 1800;
    this.echo.connect(echoLp); echoLp.connect(fb); fb.connect(this.echo); echoLp.connect(this.ambientLevel);
    // Drone: two low saws a few cents apart, breathing.
    const droneG = ctx.createGain(); droneG.gain.value = 0.16; droneG.connect(this.ambientLevel);
    this.lfo(droneG.gain, 0.017, 0.07, 0.16);
    this.droneGain = droneG;
    this.droneOsc = [];
    for (const [ratio, det] of [[1, -6], [1, 7], [1.5, 3]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55 * ratio; o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = 0.5; o.connect(g); g.connect(droneG); o.start();
      this.lfo(o.detune, 0.05 + Math.random() * 0.05, 5, det);
      this.droneOsc.push({ o, ratio });
    }
    // Pad: three triangles that glide to each new chord, with a slow wobble.
    this.pad = [];
    const padG = ctx.createGain(); padG.gain.value = 0.11; padG.connect(this.ambientLevel);
    this.lfo(padG.gain, 0.013, 0.05, 0.11);
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 220;
      const g = ctx.createGain(); g.gain.value = 0.3; o.connect(g); g.connect(padG); o.start();
      this.lfo(o.detune, 0.09 + i * 0.04, 7, 0);
      this.pad.push(o);
    }
    // Shimmer: the same chord an octave up, in sines, for the gentler beds.
    this.shimmerGain = ctx.createGain(); this.shimmerGain.gain.value = 0; this.shimmerGain.connect(this.ambientLevel);
    this.lfo(this.shimmerGain.gain, 0.05, 0.0, 0.0);
    this.shimmer = [];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 440;
      const g = ctx.createGain(); g.gain.value = 0.3; o.connect(g); g.connect(this.shimmerGain); o.start();
      this.lfo(o.detune, 0.07 + i * 0.03, 5, 0);
      this.shimmer.push(o);
    }
    this.chordRoot = 0;
    this.nextChord(true);
  }

  // Chords drift round the dream's scale, stacked in thirds from a random
  // degree; each voice slides to its new note.
  nextChord(now = false) {
    if (!this.pad) return;
    const sc = this.amb.scale, n = sc.length;
    const deg = Math.floor(Math.random() * n);
    this.chordRoot = sc[deg];
    const t = this.ctx.currentTime;
    this.pad.forEach((o, i) => {
      const d = deg + i * 2;
      const semis = sc[d % n] + 12 * Math.floor(d / n) + this.amb.key;
      const f = 110 * Math.pow(2, semis / 12);
      if (now) o.frequency.value = f; else o.frequency.setTargetAtTime(f, t, 4.0);
      const hi = this.shimmer && this.shimmer[i];
      if (hi) { if (now) hi.frequency.value = f * 2; else hi.frequency.setTargetAtTime(f * 2, t, 6.0); }
    });
  }

  // A bell note far off, in the dream's scale, into the echo.
  bell() {
    const ctx = this.ctx, t = ctx.currentTime;
    const sc = this.amb.scale;
    const d = Math.floor(Math.random() * (sc.length + 3));
    const semis = sc[d % sc.length] + 12 * Math.floor(d / sc.length) + this.amb.key;
    const f = 440 * Math.pow(2, semis / 12);
    const lvl = this.amb.bellLevel ?? 0.07, dk = this.amb.bellDecay ?? 1;
    for (const [m, v, d0] of [[1, 1, 3.2], [2.76, 0.3, 1.6], [5.4, 0.12, 0.7]]) {
      const d = d0 * dk;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
      const g = this.envGain(lvl * v, 0.01, d, t); o.connect(g); g.connect(this.echo); o.start(t); o.stop(t + d + 0.2);
    }
  }

  // A breath of noise that swells for a few seconds and cuts off.
  swell() {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1600, t + 5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 5); g.gain.setValueAtTime(0.0001, t + 5.02);
    src.connect(bp); bp.connect(g); g.connect(this.ambientLevel); src.start(t); src.stop(t + 5.1);
  }

  // The dream's own music: `spec` is 0/1 (off/on with the scene's own
  // character) or { key, mode, bells, swells, chords, pad, drone, tone,
  // bellLevel, bellDecay, shimmer }. swells 0 leaves out the breaths of
  // noise, drone 0 the saw drone; shimmer (0..1) adds the chord an octave up
  // in sines. A gentle bed: { mode: "major", pad: "sine", drone: 0, swells: 0, shimmer: 0.8 }.
  // Each dream gets a different key, mode and pace from its name unless the
  // scene says otherwise, so the music shifts from dream to dream.
  setAmbientMusic(spec, name = '') {
    if (!this.ready) return;
    const h = hashName(name);
    const modes = Object.keys(SCALES);
    const base = {
      key: (h % 12) - 5, mode: modes[(h >>> 4) % modes.length], bells: 6 + ((h >>> 8) % 9), swells: 24 + ((h >>> 12) % 40),
      chords: 18 + ((h >>> 16) % 20), pad: ["triangle", "sawtooth", "sine"][(h >>> 20) % 3], drone: 0.1 + ((h >>> 22) % 5) * 0.03, tone: 900 + ((h >>> 24) % 7) * 180,
      bellLevel: 0.07, bellDecay: 1, shimmer: 0,
    };
    const o = typeof spec === 'object' && spec ? { ...base, ...spec } : base;
    this.ambientOn = typeof spec === 'number' ? spec : (spec === false ? 0 : 1);
    this.amb = { key: o.key, scale: SCALES[o.mode] || SCALES.minor, bells: o.bells, swells: o.swells, chords: o.chords, drone: o.drone, bellLevel: o.bellLevel, bellDecay: o.bellDecay };
    const t = this.ctx.currentTime;
    if (this.shimmerGain) this.shimmerGain.gain.setTargetAtTime(0.07 * (o.shimmer || 0), t, 3);
    for (const o2 of this.pad) o2.type = o.pad;
    for (const { o: osc, ratio } of this.droneOsc) osc.frequency.setTargetAtTime(55 * ratio * Math.pow(2, o.key / 12), t, 2.5);
    this.droneGain.gain.setTargetAtTime(o.drone, t, 2);
    this.ambientLp.frequency.value = o.tone;
    this.nextChord();
  }

  clink(level) {
    const ctx = this.ctx, t = ctx.currentTime;
    const f = 2400 + Math.random() * 1800;
    for (const [mul, v] of [[1, 1], [1.51, 0.5], [2.37, 0.25]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const g = this.envGain(0.018 * level * v, 0.002, 0.12 + Math.random() * 0.1, t);
      o.connect(g); g.connect(this.bed); o.start(t); o.stop(t + 0.3);
    }
  }

  carPass(level) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(220, t); f.frequency.linearRampToValueAtTime(520, t + 1.6); f.frequency.linearRampToValueAtTime(160, t + 3.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * level, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 3.8);
  }

  drip(level) {
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [dt, v] of [[0, 1], [0.23, 0.35], [0.47, 0.12]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(1300, t + dt); o.frequency.exponentialRampToValueAtTime(520, t + dt + 0.06);
      const g = this.envGain(0.05 * level * v, 0.002, 0.08, t + dt);
      o.connect(g); g.connect(this.master); o.start(t + dt); o.stop(t + dt + 0.12);
    }
  }

  // Instruments for the generated music. All go through the music bus.
  note(type, freq, vol, dur, t = this.ctx.currentTime) {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 1; out.connect(this.musicBus);
    const env = (peak, a, d) => this.envGain(peak, a, d, t);
    if (type === 'pluck') {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
      const g = env(vol, 0.004, 0.6); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.7);
    } else if (type === 'accordion') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
      g.gain.setValueAtTime(vol, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
      const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vg = ctx.createGain(); vg.gain.value = freq * 0.006;
      vib.connect(vg);
      for (const det of [-4, 4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det; vg.connect(o.frequency); o.connect(lp); o.start(t); o.stop(t + dur + 0.3); }
      vib.start(t); vib.stop(t + dur + 0.3);
      lp.connect(g); g.connect(out);
    } else if (type === 'sitar') {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq * 0.985, t); o.frequency.linearRampToValueAtTime(freq, t + 0.08);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
      bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(700, t + 0.9);
      const g = env(vol * 1.6, 0.003, 1.1); o.connect(bp); bp.connect(g); g.connect(out); o.start(t); o.stop(t + 1.2);
    } else if (type === 'mandolin') {
      for (let i = 0; i < 6; i++) this.note('pluck', freq, vol * (1 - i * 0.12), 0, t + i * 0.065);
    } else if (type === 'marimba') {
      for (const [m, v, d] of [[1, 1, 0.45], [4, 0.25, 0.08]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
        const g = env(vol * v * 1.4, 0.002, d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.1);
      }
    } else if (type === 'epiano') {
      for (const [m, v] of [[1, 1], [2, 0.18], [3.01, 0.06]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
        const g = env(vol * v, 0.015, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.1);
      }
    }
  }

  setListen(on) {
    if (!this.ready) return;
    this.listenMode = on;
    const t = this.ctx.currentTime;
    this.humLevel.gain.setTargetAtTime(on ? 0.06 : 0, t, 0.15);
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.2 : 0.5, t, 0.4);
  }

  envGain(peak, attack, decay, t0 = this.ctx.currentTime) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    return g;
  }

  footstep(surface = 'concrete') {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.stepToggle = !this.stepToggle;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = surface === 'water' ? 'lowpass' : 'bandpass';
    f.frequency.value = (surface === 'sand' ? 900 : surface === 'water' ? 1400 : 260) + Math.random() * 140 + (this.stepToggle ? 40 : 0);
    f.Q.value = surface === 'sand' ? 0.8 : surface === 'water' ? 0.5 : 2.5;
    const g = this.envGain(surface === 'sand' ? 0.18 : surface === 'water' ? 0.3 : 0.26, surface === 'water' ? 0.02 : 0.005, surface === 'water' ? 0.22 : 0.11, t);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.2);
    // A tiny click on top to read as a hard floor.
    if (surface !== 'sand' && surface !== 'water') {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(140 + Math.random() * 40, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.05);
      const og = this.envGain(0.05, 0.002, 0.045, t);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.07);
    }
  }

  // Electrical buzz when a light stutters nearby.
  buzz(level = 1) {
    if (!this.ready || level <= 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 118 + Math.random() * 6;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
    const g = this.envGain(0.06 * level, 0.005, 0.18, t);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.22);
  }

  // Text blips. Spoken lines are square and pitched per speaker; thoughts
  // are a soft falling sine with a faint echo.
  blip(kind = 'say', pitch = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (kind === 'thought') {
      const f = 500 * (0.96 + Math.random() * 0.08);
      for (const [dt, v] of [[0, 1], [0.07, 0.3]]) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f, t + dt); o.frequency.exponentialRampToValueAtTime(f * 0.82, t + dt + 0.06);
        const g = this.envGain(0.05 * v, 0.006, 0.07, t + dt);
        o.connect(g); g.connect(this.master); o.start(t + dt); o.stop(t + dt + 0.1);
      }
      return;
    }
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime((800 + Math.random() * 90) * pitch, t);
    const g = this.envGain(0.045, 0.003, 0.03, t);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.05);
  }

  // A mouse: a short high chirp, two of them.
  squeak(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const d of [0, 0.09]) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(3200 + Math.random() * 800, t + d); o.frequency.exponentialRampToValueAtTime(2200, t + d + 0.06);
      const g = this.envGain(0.05 * level, 0.004, 0.06, t + d); o.connect(g); g.connect(this.bed); o.start(t + d); o.stop(t + d + 0.1);
    }
  }

  // A fat sizzle: noise that spits.
  sizzle(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.noiseSource();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * level, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    this.lfo(g.gain, 23, 0.03, 0.05);
    src.connect(hp); hp.connect(g); g.connect(this.bed); src.start(t); src.stop(t + 1.9);
  }

  // Wings: a soft double thump of air.
  flap(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const d of [0, 0.16]) {
      const src = this.noiseSource();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = this.envGain(0.1 * level, 0.03, 0.12, t + d); src.connect(lp); lp.connect(g); g.connect(this.bed); src.start(t + d); src.stop(t + d + 0.3);
    }
  }

  // A counter bell: now serving.
  ding(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, v, d] of [[1760, 1, 1.4], [2640, 0.45, 0.9], [4420, 0.2, 0.5]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = this.envGain(0.12 * v * level, 0.002, d, t); o.connect(g); g.connect(this.bed); o.start(t); o.stop(t + d + 0.1);
    }
    const click = this.noiseSource(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const cg = this.envGain(0.05 * level, 0.001, 0.03, t); click.connect(hp); hp.connect(cg); cg.connect(this.bed); click.start(t); click.stop(t + 0.1);
  }

  confirm() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(440, t); o.frequency.setValueAtTime(660, t + 0.06);
    const g = this.envGain(0.06, 0.005, 0.14, t);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
  }

  pickup() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [523, 659, 784].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = this.envGain(0.07, 0.005, 0.25, t + i * 0.07);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.3);
    });
  }

  // Wet dragging scrape, used by the thing in the dark.
  scrape(intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(700 + Math.random() * 500, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.3 * intensity);
    const g = this.envGain(0.16 * intensity, 0.04, 0.3 * intensity, t);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.5);
    // Slap.
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t + 0.05); o.frequency.exponentialRampToValueAtTime(35, t + 0.2);
    const og = this.envGain(0.12 * intensity, 0.01, 0.18, t + 0.05);
    o.connect(og); og.connect(this.master); o.start(t + 0.05); o.stop(t + 0.3);
  }

  stir() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const g = this.envGain(0.05, 0.01, 0.08, t);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.12);
  }

  gearTick(level) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400 + Math.random() * 600; f.Q.value = 6;
    const g = this.envGain(0.05 * level, 0.001, 0.03, t);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.05);
  }

  // Through the machine: a rising sweep into a white rush.
  warp(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(5000, t + 0.9);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.1 * level, t + 0.7); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(lp); lp.connect(og); og.connect(this.master); o.start(t); o.stop(t + 1.4);
    const n = this.noiseSource();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t + 0.5); ng.gain.exponentialRampToValueAtTime(0.14 * level, t + 0.95); ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    n.connect(hp); hp.connect(ng); ng.connect(this.master); n.start(t); n.stop(t + 2.5);
  }

  railClack(level) {
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [d, f] of [[0, 180], [0.09, 150]]) {
      const src = this.noiseSource();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 6; bp.Q.value = 1.5;
      const g = this.envGain(0.12 * level, 0.002, 0.05, t + d);
      src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t + d); src.stop(t + d + 0.08);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = this.envGain(0.2 * level, 0.002, 0.07, t + d); o.connect(og); og.connect(this.master); o.start(t + d); o.stop(t + d + 0.1);
    }
  }

  horn(level = 1, train = false) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const freqs = train ? [311, 370, 466] : [440, 554];
    const len = train ? 1.6 : 0.5;
    for (const f of freqs) {
      const o = ctx.createOscillator(); o.type = train ? 'sawtooth' : 'square'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = train ? 1200 : 1800;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * level, t + 0.05);
      g.gain.setValueAtTime(0.06 * level, t + len - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t); o.stop(t + len + 0.05);
    }
  }

  trainHorn(level = 1) { this.horn(level, true); }

  // Tyres: a filtered noise squeal sliding down.
  screech(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 0.7);
    const g = this.envGain(0.16 * level, 0.03, 0.75, t);
    src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.9);
  }

  thud(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const g = this.envGain(0.5 * level, 0.004, 0.35, t);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4);
    const n = this.noiseSource(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const ng = this.envGain(0.25 * level, 0.002, 0.2, t); n.connect(lp); lp.connect(ng); ng.connect(this.master); n.start(t); n.stop(t + 0.25);
  }

  // A dog: two short barks, square and rough.
  bark(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const d of [0, 0.22]) {
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(420, t + d); o.frequency.exponentialRampToValueAtTime(190, t + d + 0.12);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = this.envGain(0.14 * level, 0.01, 0.12, t + d);
      o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t + d); o.stop(t + d + 0.2);
    }
  }

  growl(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 4;
    this.lfo(lp.frequency, 11, 90, 240);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * level, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.5);
  }

  // A kiss on the forehead: a soft pop.
  kiss() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
    const g = this.envGain(0.1, 0.004, 0.09, t);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.12);
  }

  // A crowd gasp or a scream: breathy noise with a vowel band, rising.
  scream(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5;
    bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
    const g = this.envGain(0.1 * level, 0.08, 0.6, t);
    src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.8);
  }

  // Party chatter rises and the glasses: handled by murmur/clink. A record
  // crackle for the deli radio.
  crackle(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.noiseSource();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = this.envGain(0.03 * level, 0.002, 0.04, t);
    src.connect(hp); hp.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.06);
  }

  // The needle going in: a sharp falling sting, a hiss and a low thump.
  stab(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(2200, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    const og = this.envGain(0.09 * level, 0.003, 0.5, t);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.6);
    const n = this.noiseSource();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.8;
    const ng = this.envGain(0.12 * level, 0.002, 0.25, t);
    n.connect(f); f.connect(ng); ng.connect(this.master); n.start(t); n.stop(t + 0.3);
    const th = ctx.createOscillator(); th.type = 'sine';
    th.frequency.setValueAtTime(90, t); th.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const tg = this.envGain(0.3 * level, 0.005, 0.45, t);
    th.connect(tg); tg.connect(this.master); th.start(t); th.stop(t + 0.5);
  }

  async music(url) {
    if (!this.ready) return false;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) return false;
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.connect(this.musicGain); src.start();
      this.musicSource = src;
      return true;
    } catch (e) {
      return false;
    }
  }
}

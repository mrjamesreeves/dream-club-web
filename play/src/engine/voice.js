// Character voices. Each character has a small set of numbers (pitch, the
// size of the voice box, speed, how much the pitch wanders, breath, rasp,
// wobble, nasal) and a style:
//   mumble   syllables of the line, synthesized: a buzzing source shaped by
//            formant filters for the vowel, a burst of noise for the
//            consonant in front (the Banjo-Kazooie, Animal Crossing manner)
//   letters  one short tone per letter, pitched by the letter
//   speech   the browser's own text to speech, pitched and paced to match
// The lines are not meant to be understood from the sound; the words are
// on the screen. The voice says who is talking and how they feel.

const VOWELS = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010],
  o: [570, 840, 2410], u: [300, 870, 2240], y: [270, 2290, 3010],
};
const FRICATIVE = /^(s|z|sh|ch|f|v|th|h|x|j)/;
const PLOSIVE = /^(p|t|k|b|d|g|q|c)/;
const NASAL = /^(m|n)/;

export const VOICE_FIELDS = [
  ['pitch', 80, 340, 1, 'Hz'], ['size', 0.7, 1.4, 0.01, ''], ['speed', 4, 14, 0.1, 'syl/s'],
  ['melody', 0, 1, 0.01, ''], ['breath', 0, 1, 0.01, ''], ['rasp', 0, 1, 0.01, ''],
  ['wobble', 0, 1, 0.01, ''], ['nasal', 0, 1, 0.01, ''], ['volume', 0, 1.5, 0.01, ''],
];

// A voice for a character nobody has written one for: picked from their id
// (the same every time) and shaped by how they look. `explicit` is the
// scene's own `voice` field, merged over the top.
export function voiceFor(id, look = {}, explicit = null) {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const r = (n) => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return (h / 4294967296) * n; };
  const fem = !!(look.skirt || look.top === 'dress' || ['long', 'up', 'bob', 'veil'].includes(look.hairStyle));
  const age = (look.face && typeof look.face === 'object' && look.face.age != null) ? look.face.age : (look.age ?? 0.35);
  const kid = /kid|child|girl|boy|daughter|son\b/.test(String(id)) || (look.scale && look.scale < 0.85);
  let pitch = fem ? 175 + r(70) : 95 + r(50);
  if (kid) pitch *= 1.45;
  pitch *= 1 - age * 0.15;
  const round = (x, d = 2) => +x.toFixed(d);
  const v = {
    style: 'mumble',
    pitch: Math.round(pitch),
    size: round(kid ? 0.8 : fem ? 0.9 + r(0.1) : 1.02 + r(0.16)),
    speed: round(6.5 + r(3), 1),
    melody: round(0.3 + r(0.5)),
    breath: round(0.08 + r(0.25) + age * 0.2),
    rasp: round(age * age * 0.7 + r(0.1)),
    wobble: round(age * 0.5 + r(0.1)),
    nasal: round(r(0.4)),
    volume: 1,
  };
  return explicit ? { ...v, ...explicit } : v;
}

// Breaks a line into syllables with pauses and pitch marks. Each entry:
// { text, onset ('f' fricative, 'p' plosive, 'n' nasal, '' none), vowel,
//   dur (s), gap (s, after), accent (-1..1 pitch nudge in semitones scale) }
export function syllabify(text, speed = 8) {
  const out = [];
  const base = 1 / speed;
  const words = String(text).toLowerCase().split(/\s+/).filter(Boolean);
  words.forEach((word, wi) => {
    const punct = (word.match(/[.!?,;:]+$/) || [''])[0];
    const letters = word.replace(/[^a-z']/g, '');
    const parts = letters.match(/[^aeiouy]*[aeiouy]+/g) || (letters ? [letters] : []);
    if (parts.length) {
      // Trailing consonants belong to the last syllable.
      const tail = letters.slice(parts.join('').length);
      parts[parts.length - 1] += tail;
    }
    parts.forEach((p, i) => {
      const onsetStr = (p.match(/^[^aeiouy]*/) || [''])[0];
      const vowel = (p.match(/[aeiouy]/) || ['a'])[0];
      const onset = FRICATIVE.test(onsetStr) ? 'f' : PLOSIVE.test(onsetStr) ? 'p' : NASAL.test(onsetStr) ? 'n' : '';
      const last = i === parts.length - 1;
      let dur = base * (0.8 + (p.length > 3 ? 0.35 : 0) + (last && /[.!?]/.test(punct) ? 0.35 : 0));
      let gap = base * 0.12;
      if (last) gap += /[.!?]/.test(punct) ? base * 2.2 : /[,;:]/.test(punct) ? base * 1.2 : base * 0.35;
      out.push({ text: p, onset, vowel, dur, gap, word: wi, last, question: last && /\?/.test(punct), stop: last && /[.!?]/.test(punct) });
    });
  });
  return out;
}

export class Voice {
  constructor(audio) {
    this.audio = audio;
    this.current = null;
    this.until = 0;
    this.utterance = null;
  }

  get ready() { return !!(this.audio && this.audio.ready && this.audio.ctx); }

  // True while a line is being voiced.
  active() {
    if (this.utterance) return typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking;
    return !!(this.ready && this.current && this.audio.ctx.currentTime < this.until);
  }

  stop() {
    if (this.utterance) { try { speechSynthesis.cancel(); } catch (e) { /* no speech */ } this.utterance = null; }
    const c = this.current; this.current = null; this.until = 0;
    if (!c) return;
    const ctx = this.audio.ctx, t = ctx.currentTime;
    for (const g of c.gains) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.03); }
    for (const n of c.nodes) { try { n.stop(t + 0.05); } catch (e) { /* already stopped */ } }
    clearTimeout(c.timer);
  }

  // Voices a line in the given voice. Returns the seconds it will take.
  speak(text, v) {
    this.stop();
    if (!v) return 0;
    if (v.style === 'speech') return this.speakReal(text, v);
    if (!this.ready) return 0;
    const ctx = this.audio.ctx, t0 = ctx.currentTime + 0.02;
    const vol = (v.volume ?? 1) * 0.75;
    const syls = v.style === 'letters' ? this.letterSyllables(text, v) : syllabify(text, v.speed);
    if (!syls.length) return 0;

    // Source: a buzz, rasped a little, with a slow wobble.
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.2 + Math.random() * 0.8;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 4 + (v.wobble ?? 0) * 40; // cents
    lfo.connect(lfoGain); lfoGain.connect(osc.detune);
    const rasp = ctx.createWaveShaper(); rasp.curve = raspCurve(v.rasp ?? 0); rasp.oversample = 'none';
    const voiced = ctx.createGain(); voiced.gain.value = 0;
    osc.connect(rasp); rasp.connect(voiced);
    // Breath: noise through the same throat, quietly, while a vowel sounds.
    const noise = ctx.createBufferSource(); noise.buffer = this.audio.noise; noise.loop = true;
    const breath = ctx.createGain(); breath.gain.value = 0;
    noise.connect(breath);
    // The throat: three formant bands in parallel, plus a nasal hum.
    const throat = ctx.createGain(); throat.gain.value = 1;
    voiced.connect(throat); breath.connect(throat);
    const out = ctx.createGain(); out.gain.value = vol;
    const formants = [1.0, 0.55, 0.25].map((g, i) => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = i === 0 ? 7 : 9;
      const fg = ctx.createGain(); fg.gain.value = g;
      throat.connect(f); f.connect(fg); fg.connect(out);
      return f;
    });
    if ((v.nasal ?? 0) > 0.01) {
      const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 320; nf.Q.value = 1.5;
      const ng = ctx.createGain(); ng.gain.value = 0.7 * v.nasal;
      throat.connect(nf); nf.connect(ng); ng.connect(out);
    }
    // Consonants: a burst of noise in a band of its own.
    const cons = ctx.createBiquadFilter(); cons.type = 'bandpass'; cons.Q.value = 1.2;
    const consGain = ctx.createGain(); consGain.gain.value = 0;
    noise.connect(cons); cons.connect(consGain); consGain.connect(out);
    out.connect(this.audio.master);

    // Schedule the syllables.
    const size = v.size ?? 1, melody = v.melody ?? 0.5, base = v.pitch ?? 140;
    let t = t0, walk = 0, sentenceStart = 0, count = syls.length;
    const semis = (n) => Math.pow(2, n / 12);
    let seed = 1; for (const c of String(text)) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    syls.forEach((s, i) => {
      // Pitch: a wander, a fall across each sentence, a lift for a question.
      walk = Math.max(-5, Math.min(5, walk + (rnd() - 0.5) * 6 * melody));
      const decl = -3 * melody * ((i - sentenceStart) / Math.max(4, count - sentenceStart));
      const lift = s.question && (s.last) ? 5 : 0;
      const f0 = base * semis(walk * 0.6 + decl + lift + (s.accent || 0));
      const F = (VOWELS[s.vowel] || VOWELS.a).map((x) => x / size);
      const a = 0.012, rel = Math.min(0.06, s.dur * 0.4);
      // Consonant in front.
      if (s.onset) {
        const cDur = s.onset === 'f' ? 0.055 : s.onset === 'p' ? 0.016 : 0.04;
        cons.frequency.setValueAtTime((s.onset === 'f' ? 3600 : s.onset === 'p' ? 1600 : 500) / size, t);
        consGain.gain.setValueAtTime(0.0001, t);
        consGain.gain.exponentialRampToValueAtTime(s.onset === 'n' ? 0.05 : s.onset === 'p' ? 0.35 : 0.2, t + 0.004);
        consGain.gain.exponentialRampToValueAtTime(0.0001, t + cDur);
        t += cDur * 0.8;
      }
      osc.frequency.setTargetAtTime(f0, t, 0.02);
      formants.forEach((f, k) => f.frequency.setTargetAtTime(F[k], t, 0.015));
      voiced.gain.setValueAtTime(0.0001, t);
      voiced.gain.exponentialRampToValueAtTime(1, t + a);
      voiced.gain.setValueAtTime(1, t + s.dur - rel);
      voiced.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
      const br = 0.03 + (v.breath ?? 0) * 0.3;
      breath.gain.setValueAtTime(0.0001, t);
      breath.gain.exponentialRampToValueAtTime(br, t + a);
      breath.gain.setValueAtTime(br, t + s.dur - rel);
      breath.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
      t += s.dur + s.gap;
      if (s.stop) sentenceStart = i + 1;
    });
    osc.start(t0); lfo.start(t0); noise.start(t0);
    const end = t + 0.1;
    osc.stop(end); lfo.stop(end); noise.stop(end);
    this.current = { gains: [voiced, breath, consGain, out], nodes: [osc, lfo, noise], timer: 0 };
    this.until = end;
    return end - ctx.currentTime;
  }

  // One tone per letter: the vowel sound of the nearest vowel, pitched by
  // the letter itself, so a word always sounds the same.
  letterSyllables(text, v) {
    const out = [];
    const base = 1 / ((v.speed ?? 8) * 2.4);
    const letters = String(text).toLowerCase();
    let lastVowel = 'a';
    for (let i = 0; i < letters.length; i++) {
      const c = letters[i];
      if (/[aeiouy]/.test(c)) lastVowel = c;
      if (!/[a-z]/.test(c)) {
        if (out.length && /[.!?]/.test(c)) { out[out.length - 1].gap += base * 5; out[out.length - 1].stop = true; out[out.length - 1].question = c === '?'; out[out.length - 1].last = true; }
        else if (out.length && c === ',') out[out.length - 1].gap += base * 3;
        else if (out.length && c === ' ') out[out.length - 1].gap += base * 1.2;
        continue;
      }
      const code = c.charCodeAt(0) - 97;
      out.push({ text: c, onset: /[sfhzv]/.test(c) ? 'f' : /[ptkbdg]/.test(c) ? 'p' : '', vowel: lastVowel, dur: base * 0.85, gap: base * 0.15, accent: ((code * 7) % 12 - 6) * 0.25, word: 0, last: false });
    }
    return out;
  }

  // The browser's own speech, pitched and paced from the same numbers.
  speakReal(text, v) {
    if (typeof speechSynthesis === 'undefined') return 0;
    try { speechSynthesis.cancel(); } catch (e) { return 0; }
    const u = new SpeechSynthesisUtterance(String(text));
    u.pitch = Math.max(0.1, Math.min(2, (v.pitch ?? 140) / 150));
    u.rate = Math.max(0.6, Math.min(1.6, (v.speed ?? 8) / 8));
    u.volume = Math.max(0, Math.min(1, v.volume ?? 1));
    const voices = speechSynthesis.getVoices();
    const want = v.voiceName ? voices.find((x) => x.name === v.voiceName) : null;
    const lang = v.lang || 'en-GB';
    u.voice = want || voices.find((x) => x.lang === lang) || voices.find((x) => x.lang.startsWith(lang.slice(0, 2))) || null;
    this.utterance = u;
    u.onend = () => { if (this.utterance === u) this.utterance = null; };
    speechSynthesis.speak(u);
    return String(text).length * 0.06 / u.rate;
  }
}

// Soft clipping for a rasped voice: more rasp, harder the knee.
function raspCurve(k) {
  const n = 256, c = new Float32Array(n);
  const drive = 1 + k * 14;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  return c;
}

// Dialogue box with typewriter text, a speaker label, and inner thoughts.
export class Dialog {
  constructor(audio) {
    this.audio = audio;
    this.box = document.getElementById('dialog');
    this.who = this.box.querySelector('.who');
    this.text = this.box.querySelector('.text');
    this.more = this.box.querySelector('.more');
    this.prompt = document.getElementById('prompt');
    this.hint = document.getElementById('hint');
    this.open = false;
    this.lines = [];
    this.index = 0;
    this.typed = 0;
    this.typing = false;
    this.resolve = null;
    this.charTimer = 0;
    this.hintTimer = null;
    this.voice = null;      // a Voice, set by the game
    this.voiceOf = null;    // (who) => voice params, set by the game
    this.voicing = false;   // this line is voiced, so no blips
  }

  // True while the speaker's voice is still going.
  speaking() { return !!(this.voicing && this.voice && this.voice.active()); }

  // lines: [{ who: 'man' | 'you' | string, text }]
  say(lines, names = {}, opts = {}) {
    if (this.open) this.close();
    return new Promise((resolve) => {
      this.names = names;
      this.auto = !!opts.auto;
      this.lines = lines;
      this.index = 0;
      this.resolve = resolve;
      this.open = true;
      this.box.classList.remove('hidden');
      this.prompt.classList.add('hidden');
      if (!opts.auto) this.audio.confirm();
      this.showLine();
    });
  }

  showLine() {
    const line = this.lines[this.index];
    const isThought = !line.who || line.who === 'you';
    this.isThought = isThought;
    let h = 0; for (const c of String(line.who || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    this.pitch = 0.82 + (h % 9) * 0.05;
    this.box.classList.toggle('thought', isThought);
    this.who.textContent = isThought ? '' : (this.names[line.who] || line.who);
    this.who.style.display = isThought ? 'none' : 'block';
    this.speaker = isThought ? null : line.who;
    // Speech the dreamer can't make out: letter shapes, no words.
    this.full = line.garbled ? garble(line.text, this.index + 1) : line.text;
    this.garbled = !!line.garbled;
    if (this.voice) this.voice.stop();
    this.voicing = false;
    if (!isThought && this.voice && this.voiceOf) {
      const v = this.voiceOf(line.who);
      // A garbled line is mumbled lower, whatever the voice's style.
      if (v) this.voicing = this.voice.speak(this.full, this.garbled ? { ...v, pitch: (v.pitch ?? 140) * 0.72, style: v.style === 'speech' ? 'mumble' : v.style } : v) > 0;
    }
    this.typed = 0;
    this.typing = true;
    this.text.textContent = '';
    this.more.style.visibility = 'hidden';
    this.charTimer = 0;
    this.autoTimer = 0;
  }

  update(dt) {
    if (!this.open) return;
    if (!this.typing) {
      if (this.auto) {
        this.autoTimer += dt;
        if (this.autoTimer > 2.2 + this.full.length * 0.045) this.advance();
      }
      return;
    }
    this.charTimer += dt;
    const perChar = 0.028;
    while (this.charTimer >= perChar && this.typed < this.full.length) {
      this.charTimer -= perChar;
      this.typed++;
      const ch = this.full[this.typed - 1];
      if (ch !== ' ' && this.typed % 2 === 0 && !this.voicing) this.audio.blip(this.isThought ? 'thought' : 'say', this.garbled ? this.pitch * 0.72 : this.pitch);
    }
    this.text.textContent = this.full.slice(0, this.typed);
    if (this.typed >= this.full.length) {
      this.typing = false;
      this.more.style.visibility = 'visible';
    }
  }

  advance() {
    if (!this.open) return;
    if (this.voice) this.voice.stop();
    if (this.typing) {
      this.typed = this.full.length;
      this.text.textContent = this.full;
      this.typing = false;
      this.more.style.visibility = 'visible';
      return;
    }
    this.index++;
    if (this.index >= this.lines.length) {
      this.close();
    } else {
      this.showLine();
    }
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.speaker = null;
    if (this.voice) this.voice.stop();
    this.box.classList.add('hidden');
    const r = this.resolve; this.resolve = null;
    r?.();
  }

  setPrompt(text) {
    if (this.open || !text) { this.prompt.classList.add('hidden'); return; }
    this.prompt.textContent = text;
    this.prompt.classList.remove('hidden');
  }

  showHint(text, seconds = 6) {
    clearTimeout(this.hintTimer);
    this.hint.textContent = text;
    this.hint.classList.remove('hidden');
    this.hint.style.opacity = '1';
    this.hintTimer = setTimeout(() => { this.hint.style.opacity = '0'; }, seconds * 1000);
  }
}

// Keeps word lengths and punctuation; swaps the letters for ones that look
// like letters but spell nothing.
const GLYPHS = 'бвгджзклпфцчшщъыэюяαβγδεζηθλμξπσφψω';
function garble(text, seed) {
  let r = seed * 7919 + text.length;
  const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  // Words between « and » stay readable: the one phrase the dreamer caught.
  return text.split(/(«[^»]*»)/).map((part) => (part.startsWith('«') ? part.slice(1, -1) : part.replace(/[A-Za-z]/g, () => GLYPHS[Math.floor(rand() * GLYPHS.length)]))).join('');
}

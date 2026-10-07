// Dust drifting in the dark behind the title: a tiny 2D canvas scaled up so
// the motes stay chunky. Runs only while the title is showing.
export class TitleDust {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.motes = [];
    this.running = false;
    this.seed = 7;
    this.last = 0;
    for (let i = 0; i < 90; i++) this.motes.push(this.make(true));
  }

  rand() { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }

  make(anywhere) {
    const big = this.rand() < 0.18;
    return {
      x: this.rand(), y: anywhere ? this.rand() : 1.05,
      vx: (this.rand() - 0.5) * 0.012, vy: -(0.006 + this.rand() * 0.014) * (big ? 0.6 : 1),
      size: big ? 2 : 1, phase: this.rand() * 6.3, rate: 0.3 + this.rand() * 0.8,
      alpha: big ? 0.25 + this.rand() * 0.25 : 0.35 + this.rand() * 0.5,
    };
  }

  start() { if (this.running) return; this.running = true; this.last = performance.now(); this.frame(); }
  stop() { this.running = false; }

  frame() {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const c = this.canvas;
    const w = Math.max(96, Math.round(window.innerWidth / 5)), h = Math.max(54, Math.round(window.innerHeight / 5));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = this.ctx;
    g.clearRect(0, 0, w, h);
    const t = now / 1000;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.x += (m.vx + Math.sin(t * m.rate + m.phase) * 0.004) * dt * 10;
      m.y += m.vy * dt * 10;
      if (m.y < -0.05 || m.x < -0.05 || m.x > 1.05) this.motes[i] = this.make(false);
      const flicker = 0.7 + Math.sin(t * 2.3 * m.rate + m.phase) * 0.3;
      g.fillStyle = `rgba(190,205,200,${(m.alpha * flicker).toFixed(3)})`;
      g.fillRect(Math.round(m.x * w), Math.round(m.y * h), m.size, m.size);
    }
    requestAnimationFrame(() => this.frame());
  }
}

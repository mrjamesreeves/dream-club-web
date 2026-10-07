// Small painted pictures for walls: posters, menus, mirrors, scrolls.
// Drawn on a tiny canvas and sampled with nearest filtering.
import * as THREE from '../../vendor/three.module.js?v=6782550';

const cache = new Map();

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

let seed = 9;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const PAINTERS = {
  chalkboard(g, w, h) {
    g.fillStyle = '#1e3328'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8dccf'; g.font = 'bold 9px monospace'; g.fillText('MENU', w / 2 - 11, 11);
    for (let y = 18; y < h - 4; y += 6) {
      let x = 5; const len = 14 + rnd() * 20;
      g.fillRect(x, y, len, 1);
      g.fillRect(w - 12, y, 6, 1);
    }
  },
  mirror(g, w, h) {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#7f8f96'); grd.addColorStop(0.5, '#c8d2d4'); grd.addColorStop(1, '#5e6c72');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 3; i++) { g.save(); g.translate(w * 0.2 + i * 6, 0); g.rotate(0.5); g.fillRect(0, 0, 2, h * 2); g.restore(); }
  },
  paris(g, w, h) {
    g.fillStyle = '#e8dcbc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d23a2a'; g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#1a1a1a';
    g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2 + 9, h - 16); g.lineTo(w / 2 - 9, h - 16); g.fill();
    g.fillStyle = '#e8dcbc'; g.fillRect(w / 2 - 3, h - 24, 6, 8);
    g.fillStyle = '#f4ead0'; g.font = 'bold 8px serif'; g.fillText('PARIS', w / 2 - 12, h - 4);
  },
  scroll(g, w, h) {
    g.fillStyle = '#e4d8b8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5a3a20'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
    g.fillStyle = '#141414';
    for (let i = 0; i < 6; i++) {
      const y = 8 + i * ((h - 22) / 6);
      g.fillRect(w / 2 - 4 + rnd() * 3, y, 5 + rnd() * 3, 2);
      g.fillRect(w / 2 - 1, y - 1, 2, 4 + rnd() * 3);
      if (rnd() < 0.6) g.fillRect(w / 2 + 2, y + 2, 3, 2);
    }
    g.fillStyle = '#c02020'; g.fillRect(w / 2 + 2, h - 12, 5, 5);
  },
  mandala(g, w, h) {
    g.fillStyle = '#6a1020'; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const cols = ['#f0b030', '#e05a20', '#f6e0a0', '#2a7a6a', '#f0b030'];
    for (let r = Math.min(w, h) / 2 - 2, i = 0; r > 2; r -= 4, i++) {
      g.fillStyle = cols[i % cols.length];
      for (let a = 0; a < 16; a++) {
        const t = a / 16 * Math.PI * 2 + i * 0.2;
        g.fillRect(cx + Math.cos(t) * r - 1, cy + Math.sin(t) * r - 1, 3, 3);
      }
    }
    g.fillStyle = '#f6e0a0'; g.fillRect(cx - 2, cy - 2, 4, 4);
  },
  venice(g, w, h) {
    g.fillStyle = '#9ec2d8'; g.fillRect(0, 0, w, h);
    const cols = ['#d88a40', '#c45a3a', '#e6c070', '#b86a50'];
    for (let x = 0; x < w; x += 9) { g.fillStyle = cols[(x / 9) % 4 | 0]; const bh = 14 + rnd() * 12; g.fillRect(x, h * 0.55 - bh, 9, bh); g.fillStyle = '#3a2a20'; g.fillRect(x + 3, h * 0.55 - bh + 4, 2, 3); }
    g.fillStyle = '#2a5a7a'; g.fillRect(0, h * 0.55, w, h * 0.45);
    g.fillStyle = '#4a7a9a'; for (let y = h * 0.6; y < h; y += 4) g.fillRect(rnd() * w, y, 8, 1);
    g.fillStyle = '#111'; g.fillRect(w * 0.3, h * 0.72, 18, 2); g.fillRect(w * 0.3 + 2, h * 0.62, 1, 10);
    g.fillStyle = '#5a3a20'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h);
  },
  cantina(g, w, h) {
    g.fillStyle = '#f0c040'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e04020'; g.beginPath(); g.arc(w * 0.7, h * 0.3, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a8a3a';
    for (const x of [w * 0.2, w * 0.45]) { g.fillRect(x, h * 0.4, 5, h * 0.5); g.fillRect(x - 5, h * 0.55, 5, 3); g.fillRect(x - 5, h * 0.45, 3, 10); g.fillRect(x + 5, h * 0.6, 4, 3); g.fillRect(x + 7, h * 0.5, 3, 12); }
    g.fillStyle = '#b05a20'; g.fillRect(0, h - 6, w, 6);
  },
  pizza(g, w, h) {
    g.fillStyle = '#b81e24'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8b050'; g.beginPath(); g.arc(w / 2, h / 2 - 4, w * 0.36, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d23a22'; g.beginPath(); g.arc(w / 2, h / 2 - 4, w * 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a1010'; for (let i = 0; i < 7; i++) g.fillRect(w / 2 - 10 + rnd() * 18, h / 2 - 14 + rnd() * 18, 3, 3);
    g.fillStyle = '#ffffff'; g.font = 'bold 8px sans-serif'; g.fillText('SLICE', w / 2 - 12, h - 4);
  },
  lattice(g, w, h) {
    g.fillStyle = '#2a0806'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9a1c14';
    for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, h);
    for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
    g.fillStyle = '#d8a030'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h);
  },
  photo(g, w, h) {
    g.fillStyle = '#c8b090'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6a5038'; g.beginPath(); g.arc(w / 2, h * 0.4, w * 0.18, 0, Math.PI * 2); g.fill();
    g.fillRect(w * 0.25, h * 0.6, w * 0.5, h * 0.4);
    g.fillStyle = '#3a2a1c'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h);
  },
  jukebox(g, w, h) {
    const cols = ['#ff3a6a', '#ffd040', '#40e0ff', '#a050ff'];
    for (let y = 0; y < h; y += 4) { g.fillStyle = cols[(y / 4) % 4 | 0]; g.fillRect(0, y, w, 4); }
    g.fillStyle = '#201818'; g.fillRect(w * 0.2, h * 0.3, w * 0.6, h * 0.4);
  },
};

Object.assign(PAINTERS, {
  map(g, w, h) {
    g.fillStyle = '#d8ccaa'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5a5a5a'; g.fillRect(4, h * 0.3, w - 8, 3);
    g.fillStyle = '#3a6a9a'; g.fillRect(4, h * 0.5, w - 8, 2);
    g.fillStyle = '#a02020';
    for (let x = 8; x < w - 8; x += 9) { g.fillRect(x, h * 0.5 - 3, 1, 1); g.fillRect(x - 1, h * 0.5 - 2, 1, 1); g.fillRect(x - 2, h * 0.5 - 1, 1, 1); g.fillRect(x - 3, h * 0.5 - 2, 4, 1); }
    g.fillStyle = '#4a7aa8'; g.fillRect(4, h * 0.7, w - 8, h * 0.25);
    g.fillStyle = '#2a2a2a'; g.fillRect(w * 0.25, h * 0.32 + 4, 3, 3);
    g.fillStyle = '#5a3a20'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2);
  },
  noswim(g, w, h) {
    g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b82020'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
    g.font = 'bold 8px sans-serif'; g.fillText('NO', 4, 13); g.fillStyle = '#2a2a2a'; g.fillRect(3, 9, 15, 1);
    g.fillStyle = '#b82020'; g.fillText('SWIMMING', 4, 24); g.fillText('UPSTREAM', 4, 34);
  },
  directory(g, w, h) {
    g.fillStyle = '#20282c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8c0a0'; g.font = 'bold 6px monospace'; g.fillText('DIRECTORY', 4, 8);
    for (let i = 0; i < 8; i++) { g.fillStyle = '#5a6a70'; g.fillRect(4 + (i % 4) * 10, 14 + Math.floor(i / 4) * 12, 8, 9); g.fillStyle = '#c8c0a0'; g.fillRect(6 + (i % 4) * 10, 17 + Math.floor(i / 4) * 12, 4, 1); }
    g.fillStyle = '#e04040'; g.fillRect(w / 2 - 2, h - 10, 4, 4);
  },
  reserved(g, w, h) {
    g.fillStyle = '#f2ece0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2420'; g.font = 'italic 7px serif'; g.fillText('Reserved', 4, h / 2 + 2);
  },
  // Paper signs taped inside shop windows.
  closed(g, w, h) {
    g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#a02020'; g.font = 'bold 8px sans-serif'; g.fillText('SORRY', 6, 13); g.fillText("WE'RE", 6, 22); g.fillText('CLOSED', 4, 31);
  },
  lease(g, w, h) {
    g.fillStyle = '#f0e8a8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#202020'; g.font = 'bold 9px sans-serif'; g.fillText('FOR', 13, 13); g.fillText('LEASE', 6, 24);
    g.fillRect(6, 29, 36, 2); g.fillStyle = '#5a5a5a'; g.fillRect(10, 33, 28, 3);
  },
  sale(g, w, h) {
    g.fillStyle = '#e8d020'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c01818'; g.font = 'bold 7px sans-serif'; g.fillText('CLOSING', 4, 11); g.fillText('DOWN', 9, 20); g.fillText('SALE', 11, 29);
    g.font = '5px sans-serif'; g.fillStyle = '#202020'; g.fillText('everything must go', 1, 37);
  },
  eyechart(g, w, h) {
    g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#181818';
    const rows = [['E', 14], ['F P', 9], ['T O Z', 7], ['L P E D', 5], ['NEXT WEEK', 4]];
    let y = 14; for (const [t, px] of rows) { g.font = `${px}px sans-serif`; g.fillText(t, (w - g.measureText(t).width) / 2, y); y += px + 3; }
  },
});

const SIZES = { closed: [40, 36], lease: [48, 40], sale: [40, 40], eyechart: [32, 48], map: [64, 40], noswim: [40, 40], directory: [48, 40], reserved: [32, 16], scroll: [24, 64], mirror: [32, 48], chalkboard: [48, 64], photo: [24, 32], lattice: [32, 64] };

export function makeArt(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const p = PAINTERS[kind] || PAINTERS.photo;
  const [w, h] = SIZES[kind] || [48, 48];
  seed = 9 + kind.length * 31;
  const t = canvasTex(w, h, p);
  cache.set(kind, t);
  return t;
}

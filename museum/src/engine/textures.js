// Procedural low-resolution textures. Everything is generated on a 2D canvas at
// 16-64px, quantized to a 15-bit style palette and sampled with nearest filtering.
import * as THREE from '../../vendor/three.module.js?v=d26125f';
import { paintFace, FACE_PRESETS } from './faces.js?v=d26125f';

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise. `cells` must divide `size` evenly for perfect tiling.
function valueNoise(size, cells, rand) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const v = (ix, iy) => g[(((iy % cells) + cells) % cells) * cells + (((ix % cells) + cells) % cells)];
  return (x, y) => {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

function fbm(size, rand, octaves = 3, base = 4) {
  const layers = [];
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    layers.push([valueNoise(size, base << o, rand), amp]);
    total += amp; amp *= 0.5;
  }
  return (x, y) => { let s = 0; for (const [n, a] of layers) s += n(x, y) * a; return s / total; };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp255 = (v) => Math.max(0, Math.min(255, v));
const q5 = (v) => Math.round(clamp255(v) / 8) * 8; // 32 levels per channel

// painter(x, y) -> [r, g, b, a?] in 0..255
function make(size, painter, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = opts.height || size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  const d = img.data;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const [r, g, b, a = 255] = painter(x, y);
      const i = (y * canvas.width + x) * 4;
      if (opts.smooth) { d[i] = clamp255(r); d[i + 1] = clamp255(g); d[i + 2] = clamp255(b); }
      else { d[i] = q5(r); d[i + 1] = q5(g); d[i + 2] = q5(b); }
      d[i + 3] = clamp255(a);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = opts.smooth ? THREE.LinearFilter : THREE.NearestFilter;
  tex.minFilter = opts.smooth ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  tex.generateMipmaps = !!opts.smooth;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function noisy(base, amount, rand, size, octaves = 3) {
  const n = fbm(size, rand, octaves);
  const [r, g, b] = hexToRgb(base);
  return (x, y) => {
    const k = (n(x, y) - 0.5) * amount;
    return [r + k, g + k, b + k];
  };
}

export function createTextures() {
  const T = {};
  const rand = mulberry(1337);

  // Concrete: grey with speckle and faint pour seams.
  {
    const n = fbm(64, rand, 4, 4);
    const speck = valueNoise(64, 64, rand);
    T.concrete = make(64, (x, y) => {
      let v = 96 + (n(x, y) - 0.5) * 70 + (speck(x, y) - 0.5) * 24;
      if (y % 32 === 0) v -= 22;
      if (y % 32 === 1) v += 8;
      return [v - 4, v, v + 2];
    });
  }
  // Darker concrete for the big walls, with vertical streaks.
  {
    const n = fbm(64, rand, 4, 4);
    const streak = valueNoise(64, 8, rand);
    T.wall = make(64, (x, y) => {
      let v = 74 + (n(x, y) - 0.5) * 60 + (streak(x, 0) - 0.5) * 30;
      if (x % 32 === 0) v -= 18;
      return [v - 5, v, v + 3];
    });
  }
  // Paved walkway: tiles with dark grout.
  {
    const n = fbm(64, rand, 3, 8);
    T.pavement = make(64, (x, y) => {
      let v = 88 + (n(x, y) - 0.5) * 50;
      const gx = x % 16, gy = y % 16;
      if (gx === 0 || gy === 0) v -= 34;
      if (gx === 15 || gy === 15) v += 6;
      return [v - 6, v - 1, v];
    });
  }
  // Rusted metal: dark green-grey with rivets at the border.
  {
    const n = fbm(32, rand, 3, 4);
    T.metal = make(32, (x, y) => {
      let v = 58 + (n(x, y) - 0.5) * 40;
      const rivet = ((x % 16 === 3) && (y % 16 === 3)) || ((x % 16 === 12) && (y % 16 === 12));
      if (rivet) v += 40;
      return [v - 8, v, v - 4];
    });
  }
  // Water: streaky, lighter crests.
  {
    const n = fbm(64, rand, 3, 4);
    T.water = make(64, (x, y) => {
      const s = n((x * 0.25) % 64, (y * 2) % 64);
      const crest = s > 0.62 ? 22 : 0;
      const v = 40 + (s - 0.5) * 30 + crest;
      return [v - 12, v + 4, v + 12];
    });
  }
  // Sand.
  {
    const n = fbm(32, rand, 3, 4);
    const speck = valueNoise(32, 32, rand);
    T.sand = make(32, (x, y) => {
      const v = 150 + (n(x, y) - 0.5) * 36 + (speck(x, y) - 0.5) * 20;
      return [v + 6, v, v - 24];
    });
  }
  // Near-black interior.
  T.dark = make(16, noisy('#0d1012', 12, rand, 16, 2));
  // Flat tones used by characters.
  T.skin = make(16, noisy('#c69a78', 24, rand, 16, 2));
  T.skinPale = make(16, noisy('#d8c2b0', 16, rand, 16, 2));
  T.hairGrey = make(16, noisy('#9a948a', 30, rand, 16, 2));
  T.hairDark = make(16, noisy('#2a221e', 20, rand, 16, 2));
  T.coat = make(16, noisy('#4a4e46', 26, rand, 16, 2));
  T.trousers = make(16, noisy('#2e3034', 22, rand, 16, 2));
  T.dress = make(16, noisy('#8c2d3a', 28, rand, 16, 2));
  T.suit = make(16, noisy('#2a2a38', 22, rand, 16, 2));
  T.shirt = make(16, noisy('#d9d4c4', 18, rand, 16, 2));
  T.nail = make(4, () => [214, 30, 50]);
  T.lamp = make(8, (x, y) => (x + y) % 2 ? [255, 190, 110] : [240, 160, 80]);

  // Interiors.
  {
    const n = fbm(32, rand, 3, 4);
    T.wood = make(32, (x, y) => {
      const grain = n((x * 0.5) % 32, (y * 3) % 32);
      let v = 78 + (grain - 0.5) * 50;
      if (y % 8 === 0) v -= 26;
      return [v + 18, v + 2, v - 16];
    });
    T.woodDark = make(32, (x, y) => {
      const grain = n((x * 0.5) % 32, (y * 3) % 32);
      let v = 52 + (grain - 0.5) * 40;
      if (x % 16 === 0) v -= 20;
      return [v + 14, v, v - 10];
    });
  }
  {
    const n = fbm(32, rand, 3, 8);
    T.carpet = make(32, (x, y) => {
      let v = 70 + (n(x, y) - 0.5) * 30;
      const motif = ((x % 16 < 8) === (y % 16 < 8)) ? 10 : 0;
      const dot = (x % 8 === 4 && y % 8 === 4) ? 24 : 0;
      return [v + 30 + dot, v - 12 + motif * 0.3, v - 14];
    });
    T.plaster = make(32, noisy('#b8ad98', 20, rand, 32, 3));
    T.plasterDirty = make(32, (x, y) => { const v = 130 + (n(x, y) - 0.5) * 60; return [v, v - 6, v - 18]; });
    T.checker = make(16, (x, y) => (((x >> 3) + (y >> 3)) & 1) ? [206, 200, 186] : [36, 34, 36]);
    T.tileMall = make(32, (x, y) => {
      let v = 150 + (n(x, y) - 0.5) * 30;
      if (x % 16 === 0 || y % 16 === 0) v -= 40;
      return [v, v - 4, v - 14];
    });
    T.ceiling = make(32, (x, y) => { let v = 120 + (n(x, y) - 0.5) * 20; if (x % 16 === 0 || y % 16 === 0) v -= 30; return [v, v, v - 4]; });
    T.wallpaper = make(32, (x, y) => {
      const base = [58, 32, 34];
      const fl = ((x % 16 === 8 && Math.abs(y % 16 - 8) <= 2) || (y % 16 === 8 && Math.abs(x % 16 - 8) <= 2)) ? 1 : 0;
      const k = (n(x, y) - 0.5) * 16;
      return fl ? [120 + k, 86 + k, 60 + k] : [base[0] + k, base[1] + k, base[2] + k];
    });
    T.lantern = make(8, (x, y) => (y === 0 || y === 7) ? [60, 20, 16] : [230, 60, 40]);
    T.neonGlass = make(8, () => [120, 130, 140]);
    T.cloth = make(16, noisy('#e4ddd0', 14, rand, 16, 2));
    T.brownSuit = make(16, noisy('#5a4330', 22, rand, 16, 2));
    T.shirtWhite = make(16, noisy('#e8e4da', 12, rand, 16, 2));
    T.black = make(16, noisy('#17161a', 10, rand, 16, 2));
    T.paramedic = make(16, noisy('#2c4a6e', 22, rand, 16, 2));
    T.overalls = make(16, noisy('#cfcac0', 26, rand, 16, 2));
    T.tweed = make(16, (x, y) => { const v = 92 + ((x + y) % 2) * 18 + (rand() - 0.5) * 10; return [v, v - 6, v - 16]; });
    // Corduroy: warm brown with vertical ribs.
    T.corduroy = make(16, (x, y) => { const v = 70 + (x % 3 === 0 ? -16 : 6) + (rand() - 0.5) * 8; return [v + 26, v + 8, v - 8]; });
    T.floral = make(16, (x, y) => {
      const base = [44, 70, 60];
      const cx = x % 8 - 4, cy = y % 8 - 4;
      const r = Math.abs(cx) + Math.abs(cy);
      if (r <= 1) return [230, 200, 90];
      if (r === 2 && ((x >> 3) + (y >> 3)) % 2 === 0) return [220, 110, 130];
      if (r === 2) return [210, 90, 110];
      return [base[0] + (rand() - 0.5) * 12, base[1] + (rand() - 0.5) * 12, base[2]];
    });
    T.hairBlack = make(16, noisy('#161214', 14, rand, 16, 2));
    T.hairWhite = make(16, noisy('#cfc9bf', 20, rand, 16, 2));
    T.hairBrown = make(16, noisy('#4a3222', 22, rand, 16, 2));
    T.chrome = make(16, (x, y) => { const v = 120 + Math.sin(y * 0.8) * 50 + (rand() - 0.5) * 16; return [v, v + 4, v + 8]; });
    T.panel = make(32, (x, y) => { let v = 90 + (n(x, y) - 0.5) * 20; if ((x % 8 === 2 && y % 8 === 2)) v += 60; if (x % 16 === 0) v -= 30; return [v - 4, v, v + 6]; });
  }

  // Restaurant materials.
  {
    const n = fbm(32, rand, 3, 4);
    T.skinTan = make(16, noisy('#b07850', 22, rand, 16, 2));
    T.skinDeep = make(16, noisy('#7a4e34', 20, rand, 16, 2));
    T.stripe = make(16, (x) => ((x >> 2) & 1) ? [200, 40, 44] : [228, 224, 214]);
    T.gingham = make(16, (x, y) => {
      const a = ((x >> 2) & 1), b = ((y >> 2) & 1);
      return a && b ? [178, 30, 36] : (a || b) ? [218, 120, 120] : [236, 230, 222];
    });
    T.terracotta = make(32, (x, y) => {
      let v = (n(x, y) - 0.5) * 26;
      if (x % 16 === 0 || y % 16 === 0) return [96, 64, 48];
      return [176 + v, 98 + v * 0.6, 62 + v * 0.4];
    });
    T.tileBlue = make(16, (x, y) => {
      const cx = x % 8 - 3.5, cy = y % 8 - 3.5, r = Math.abs(cx) + Math.abs(cy);
      if (x % 8 === 0 || y % 8 === 0) return [180, 176, 166];
      if (r < 2) return [214, 160, 40];
      if (r < 3.5) return [36, 72, 150];
      return [228, 224, 210];
    });
    T.brick = make(32, (x, y) => {
      const row = y >> 3, off = (row & 1) * 8;
      if (y % 8 === 0 || (x + off) % 16 === 0) return [70, 60, 54];
      const v = (n(x, y) - 0.5) * 40;
      return [150 + v, 70 + v * 0.5, 50 + v * 0.4];
    });
    T.plasterWarm = make(32, (x, y) => { const v = (n(x, y) - 0.5) * 30; return [214 + v, 132 + v * 0.7, 60 + v * 0.4]; });
    T.plasterYellow = make(32, (x, y) => { const v = (n(x, y) - 0.5) * 26; return [226 + v, 190 + v, 92 + v * 0.5]; });
    T.marble = make(32, (x, y) => { const v = n(x, (y + x * 0.5) % 32); const vein = Math.abs(v - 0.5) < 0.03 ? -60 : 0; const c = 214 + (v - 0.5) * 30 + vein; return [c, c - 2, c - 6]; });
    T.lacquer = make(16, noisy('#7a1410', 18, rand, 16, 2));
    T.vinyl = make(16, (x, y) => { const v = (n(x * 2 % 32, y * 2 % 32) - 0.5) * 30; return [150 + v, 24 + v * 0.3, 30 + v * 0.3]; });
    T.cream = make(16, noisy('#e6dcc4', 14, rand, 16, 2));
    T.gold = make(16, (x, y) => { const v = Math.sin((x + y) * 0.9) * 30 + (rand() - 0.5) * 20; return [210 + v, 160 + v, 50 + v * 0.5]; });
    T.sari = make(16, (x, y) => (y % 8 < 2) ? [230, 180, 40] : [190, 30, 90]);
    T.saffron = make(16, noisy('#e08a18', 22, rand, 16, 2));
    // Leaf cluster with transparent gaps.
    // A palm trunk: rings of old leaf bases. A frond: a rib with leaflets
    // either side, tapering to the tip (the tip is at the top of the image).
    T.palmBark = make(16, (x, y) => { const v = 92 + (n(x, y) - 0.5) * 30; const ring = y % 8 < 3; return ring ? [v - 30, v - 36, v - 40] : [v + 6, v - 4, v - 16]; });
    T.frond = make(16, (x, y) => {
      const t = y / 63, half = 1 + 6.5 * Math.pow(1 - t, 0.7), d = Math.abs(x - 7.5);
      if (d > half) return [0, 0, 0, 0];
      if (d < 0.9) return [70 + rand() * 20, 90 + rand() * 20, 40, 255];
      const leaflet = ((y + Math.floor(d * 0.9)) % 4) < 2.4;
      if (!leaflet) return [0, 0, 0, 0];
      const v = rand() * 40;
      return [34 + v * 0.5, 104 + v - d * 3, 44 + v * 0.3, 255];
    }, { height: 64 });
    T.leaf = make(32, (x, y) => {
      const dx = (x - 15.5) / 16, dy = (y - 15.5) / 16;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 0.95 || rand() < 0.18 + r * 0.25) return [0, 0, 0, 0];
      const v = rand() * 50;
      return [40 + v * 0.5, 96 + v, 44 + v * 0.3, 255];
    });
    // Papel picado: a paper flag with cut-out holes, tinted per flag.
    T.papel = make(16, (x, y) => {
      if (y < 1) return [255, 255, 255, 255];
      const hole = ((x % 4 === 1 || x % 4 === 2) && (y % 5 === 2)) || ((x === 7 || x === 8) && y > 5 && y < 11) || (y === 15 && x % 2 === 0);
      return hole ? [0, 0, 0, 0] : [255, 255, 255, 255];
    });
    T.brassLantern = make(8, (x, y) => ((x + y) % 3 === 0) ? [255, 210, 120] : [150, 100, 30]);
    T.fish = make(4, () => [255, 130, 40]);
    T.water2 = make(16, noisy('#4a8ab0', 30, rand, 16, 2));
  }

  // Faces: painted by faces.js presets.
  for (const [name, spec] of Object.entries(FACE_PRESETS)) T[name] = paintFace(spec);

  // Soft radial sprite for mist.
  T.mist = make(32, (x, y) => {
    const dx = (x + 0.5) / 32 - 0.5, dy = (y + 0.5) / 32 - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    const a = Math.max(0, 1 - r) ** 1.6;
    return [255, 255, 255, Math.round(a * 255 / 32) * 32];
  });
  // Dark blob shadow.
  T.blob = make(16, (x, y) => {
    const dx = (x + 0.5) / 16 - 0.5, dy = (y + 0.5) / 16 - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    return [0, 0, 0, r < 0.9 ? 255 : 0];
  });
  // Crescent moon.
  T.moon = make(32, (x, y) => {
    const dx = (x + 0.5) / 32 - 0.5, dy = (y + 0.5) / 32 - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    const dx2 = dx - 0.18, r2 = Math.sqrt(dx2 * dx2 + dy * dy) * 2;
    const on = r < 0.8 && r2 > 0.78;
    return [230, 236, 230, on ? 255 : 0];
  });
  T.star = make(4, () => [220, 230, 230, 255]);
  // Light halo: soft core and a wide falloff, stepped so it bands.
  T.halo = make(32, (x, y) => {
    const dx = (x + 0.5) / 32 - 0.5, dy = (y + 0.5) / 32 - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    let a = Math.max(0, 1 - r) ** 2 * 0.55 + Math.exp(-r * r * 16) * 0.45;
    a = Math.round(a * 10) / 10;
    return [255, 255, 255, a * 255];
  });
  // Inventory materials.
  T.plastic = make(16, noisy('#3a3d42', 14, rand, 16, 2));
  T.foam = make(16, () => { const v = 26 + (rand() < 0.35 ? 22 : 0); return [v, v, v + 3]; });
  T.grille = make(8, (x, y) => (x % 2 === 0 && y % 2 === 0) ? [18, 18, 20] : [76, 78, 82]);
  T.led = make(4, () => [255, 40, 40]);
  T.slot = make(16, (x, y) => {
    const corner = (x < 2 && y < 2) || (x > 13 && y < 2) || (x < 2 && y > 13) || (x > 13 && y > 13);
    if (corner) return [0, 0, 0, 0];
    const edge = x === 0 || y === 0 || x === 15 || y === 15 || ((x === 1 || x === 14) && (y === 1 || y === 14));
    return edge ? [150, 162, 160, 255] : [8, 12, 14, 150];
  });
  // Roads, rails, a tower, a party and a deli.
  {
    const n = fbm(32, rand, 3, 4);
    T.asphalt = make(32, (x, y) => { let v = 48 + (n(x, y) - 0.5) * 26; if (x >= 15 && x <= 16 && (y % 16) < 9) return [200, 190, 120]; return [v, v, v + 2]; });
    T.grass = make(32, (x, y) => { const v = 70 + (n(x, y) - 0.5) * 50 + (rand() - 0.5) * 20; return [v - 20, v + 10, v - 30]; });
    T.field = make(32, (x, y) => { const v = 96 + (n(x, y) - 0.5) * 50; return [v - 10, v + 2, v - 36]; });
    T.steel = make(16, (x, y) => { const v = 118 + (n(x, y) - 0.5) * 24 + (x % 8 === 0 ? -14 : 0); return [v - 2, v, v + 6]; });
    T.graffiti = make(64, (x, y) => {
      const v = 112 + (n(x, y) - 0.5) * 30;
      const bands = [[26, 8, '#d02828'], [30, 20, '#f0c020'], [8, 30, '#2060d0'], [44, 36, '#30c050'], [12, 48, '#e040c0'], [40, 52, '#f0f0f0']];
      for (const [bx, by, c] of bands) {
        const dx = (x - bx + 64) % 64, dy = (y - by + 64) % 64;
        if (dx < 18 && dy < 9 && ((dx * 3 + dy * 5) % 7) > 1) { const [r, g, b] = hexToRgb(c); return [r * 0.8, g * 0.8, b * 0.8]; }
      }
      return [v, v + 2, v + 8];
    });
    T.velvet = make(16, noisy('#5a1e26', 18, rand, 16, 2));
    T.mahogany = make(16, (x, y) => { const v = 62 + ((y % 4) === 0 ? -14 : 0) + (rand() - 0.5) * 10; return [v + 20, v + 2, v - 10]; });
    T.brass = make(8, (x, y) => { const v = 180 + ((x + y) % 2) * 14; return [v, v - 40, v - 110]; });
    T.curtain = make(16, (x, y) => { const v = 70 + (x % 4 === 0 ? -16 : 0); return [v + 10, v - 20, v - 10]; });
    T.subwayTile = make(16, (x, y) => (x % 8 === 0 || y % 4 === 0) ? [60, 62, 64] : [200, 196, 180 + (rand() - 0.5) * 20]);
    T.doberman = make(16, (x, y) => { const v = 26 + (rand() - 0.5) * 10; return y > 11 ? [120 + v, 74 + v, 40 + v] : [v + 4, v, v]; });
    T.sweater = make(16, (x, y) => { const r = y % 8; if (r === 0 || r === 1) return [200, 40, 40]; if (r === 4 && (x % 4) < 2) return [200, 40, 40]; if (r === 5 && (x % 4) >= 2) return [40, 60, 140]; return [230, 226, 214]; });
    T.parachute = make(16, (x, y) => (x % 8 < 4) ? [230, 220, 200] : [180, 60, 50]);
    T.capsule = make(16, (x, y) => { const v = 150 + (n(x, y) - 0.5) * 30; return y % 8 === 0 ? [v - 60, v - 60, v - 60] : [v, v - 4, v - 14]; });
    T.cityLights = make(32, (x, y) => { const lit = (x % 4 === 1 && y % 4 === 1 && rand() < 0.35); return lit ? [240, 220, 150] : [14, 16, 22]; });
    T.towerSteel = make(32, (x, y) => { const v = 70 + (n(x, y) - 0.5) * 20; if (x % 8 === 0) return [v - 30, v - 30, v - 30]; if (y % 32 < 3) return [v - 20, v - 20, v - 16]; return [v, v + 2, v + 6]; });
    T.wetDress = make(16, (x, y) => { const v = 150 + (n(x, y) - 0.5) * 50 + (y % 5 === 0 ? -30 : 0); return [v, v, v - 4]; });
    T.partyWall = make(32, (x, y) => { const v = 120 + (n(x, y) - 0.5) * 20; return [v - 10, v - 24, v - 34]; });
    T.parquet = make(32, (x, y) => { const v = 120 + (n(x, y) - 0.5) * 26 + ((((x >> 3) + (y >> 3)) & 1) ? 10 : -10); return [v + 20, v, v - 24]; });
    T.deliTile = make(16, (x, y) => (x % 8 === 0 || y % 8 === 0) ? [40, 40, 44] : [220, 216, 200]);
    T.meat = make(16, (x, y) => { const v = (rand() - 0.5) * 20; return (x + y) % 6 === 0 ? [230 + v, 210 + v, 190 + v] : [150 + v, 40 + v, 44 + v]; });
    T.salami = make(16, (x, y) => { const v = (rand() - 0.5) * 16; return ((x * 7 + y * 3) % 5 === 0) ? [230 + v, 220 + v, 200 + v] : [120 + v, 30 + v, 34 + v]; });
    T.pastramiSign = make(16, (x, y) => (y < 3 || y > 12) ? [180, 30, 30] : [245, 230, 200]);
    T.track = make(32, (x, y) => { let v = 54 + (n(x, y) - 0.5) * 24; if (y % 16 < 3) v = 70; if (x === 9 || x === 10 || x === 21 || x === 22) return [150, 148, 140]; return [v, v - 2, v - 6]; });
    T.menuBoard = make(32, (x, y) => (x % 32 > 3 && x % 32 < 29 && y % 6 === 3 && (x % 6) < 4) ? [230, 220, 190] : [22, 22, 24]);
  }
  T.white = make(4, () => [255, 255, 255, 255]);

  // Clothing painted the PS1 way: the shading, folds, collars, buttons and
  // cuffs are in the texture, one 32x32 sheet per garment face. `name` is a
  // base cloth texture (its average colour is the cloth); `kind` is front,
  // back, sleeve, sleeveTop, legUpper, legLower, dressFront, dressBack.
  const avg = {};
  const average = (name) => {
    if (avg[name]) return avg[name];
    const tex = T[name] || T.coat;
    const c = tex.image, cx = c.getContext('2d');
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return (avg[name] = [r / n, g / n, b / n]);
  };
  const cache = {};
  T.garment = (name, kind) => {
    const key = `${name}|${kind}`;
    if (cache[key]) return cache[key];
    const [r, g, b] = average(name);
    const lum = (r + g + b) / 3;
    const light = lum > 150;           // pale cloth: creases darker, no lighter ridges
    const grain = fbm(32, mulberry(name.length * 31 + kind.length), 3, 2);
    const seed = mulberry(key.length * 7919);
    // Folds: a few slanted darker streaks and softer ridges.
    const folds = []; for (let i = 0; i < 4; i++) folds.push([seed() * 32, seed() * 0.9 - 0.45, 0.86 + seed() * 0.06]);
    const ridges = []; for (let i = 0; i < 2; i++) ridges.push([seed() * 32, seed() * 0.6 - 0.3, light ? 0.97 : 1.08]);
    const dress = kind.startsWith('dress');
    cache[key] = make(32, (x, y) => {
      let k = 1;
      // Baked light: brighter high and centred, falling off below and at the edges.
      k *= 1.0 - 0.2 * (y / 31);
      k *= 1.0 - 0.14 * Math.pow(Math.abs(x - 15.5) / 15.5, 2);
      k *= 1 + (grain(x, y) - 0.5) * 0.14;
      for (const [x0, slope, dk] of folds) { const d = Math.abs((x - x0 - slope * (y - 16) + 48) % 32 - 16); if (d < 1.2) k *= dk; else if (d < 2.2) k *= 1 - (1 - dk) * 0.4; }
      for (const [x0, slope, dk] of ridges) { const d = Math.abs((x - x0 - slope * (y - 16) + 48) % 32 - 16); if (d < 1.0) k *= dk; }
      let [cr, cg, cb] = [r * k, g * k, b * k];
      const dark = (f) => { cr *= f; cg *= f; cb *= f; };
      if (kind === 'front' || kind === 'dressFront') {
        // Collar: a V of the shirt beneath (or of skin on a dress), lapel edges darker.
        const half = dress ? 3.5 + y * 0.15 : 6 - y * 0.55;
        if (y < (dress ? 5 : 9) && Math.abs(x - 15.5) < Math.max(0, half)) { if (dress) { cr = 214; cg = 170; cb = 140; } else { cr = 222; cg = 214; cb = 196; } }
        else if (!dress && y < 11 && Math.abs(Math.abs(x - 15.5) - Math.max(0, 6.5 - y * 0.55)) < 1.1) dark(0.72);
        // Buttons down the middle, a waist seam low down.
        if (!dress && x >= 15 && x <= 16 && y > 10 && y < 30 && (y - 12) % 6 < 2) dark(0.55);
        if (dress && y >= 17 && y <= 18) dark(0.78);
        if (x === 0 || x === 31) dark(0.8);
      } else if (kind === 'back' || kind === 'dressBack') {
        if (x === 15 && y > 2) dark(0.9);
        if (x === 0 || x === 31) dark(0.8);
      } else if (kind === 'sleeve' || kind === 'sleeveTop') {
        if (kind === 'sleeve' && y >= 28) dark(y === 28 ? 0.6 : 0.82);   // cuff
        if (kind === 'sleeveTop' && y <= 1) dark(0.8);                  // shoulder seam
        if (y >= 14 && y <= 15) dark(0.9);                              // crease at the joint
      } else if (kind === 'legUpper' || kind === 'legLower') {
        if (x === 7 || x === 23) dark(light ? 0.9 : 1.0), cr *= 1.0;    // side seams
        if (x >= 15 && x <= 16) { const f = light ? 0.92 : 1.1; cr *= f; cg *= f; cb *= f; } // front crease
        if (kind === 'legLower' && y >= 29) dark(0.72);                 // hem
        if (kind === 'legUpper' && y <= 1) dark(0.7);                   // under the belt
      }
      return [cr, cg, cb];
    });
    return cache[key];
  };
  // A film of the sky: blue going pale at the bottom, with clouds.
  { const n = fbm(64, mulberry(77), 4, 3);
    T.skyMovie = make(64, (x, y) => { const c = Math.max(0, n(x, y) - 0.52) * 3; const b = [70 + y * 1.6, 120 + y * 1.4, 200 + y * 0.6]; return [b[0] + (230 - b[0]) * c, b[1] + (232 - b[1]) * c, b[2] + (236 - b[2]) * c]; }); }
  // Shoes: dark leather with a paler sole and a toe cap.
  T.shoe = make(16, (x, y) => (y >= 14 ? [60, 52, 44] : y <= 4 ? [34, 30, 28] : [24, 22, 22]));
  T.belt = make(16, (x, y) => ((x >= 6 && x <= 9 && y >= 5 && y <= 10) ? [180, 150, 70] : [40, 32, 28]));

  // Board-formed concrete, Tadao Ando's: a 256px tile is 1.8m square, two
  // panels high, each panel with its six cone tie holes, seams between.
  {
    const na = fbm(256, rand, 4, 3), nb = fbm(256, rand, 5, 12), ns = fbm(256, rand, 3, 2);
    const holes = [];
    for (const py of [0, 128]) for (const hx of [43, 128, 213]) for (const hy of [40, 88]) holes.push([hx, py + hy]);
    const concrete = (x, y, { seams = true, base = 150 } = {}) => {
      let v = base + (na(x, y) - 0.5) * 30 + (nb(x, y) - 0.5) * 10 + (ns(x, 3) - 0.5) * 10;
      // Water streaks run down from the holes and seams.
      v += (ns(x, 0) - 0.5) * 6;
      if (seams && (y % 128 < 2 || x < 2)) v -= 26;
      if (seams) for (const [hx, hy] of holes) {
        const d = Math.hypot(x - hx, y - hy);
        if (d < 2.6) v = 70 + d * 14;
        else if (d < 3.6) v += 8;
      }
      return [v + 3, v + 1, v - 2];
    };
    T.ando = make(256, (x, y) => concrete(x, y), { smooth: true });
    T.andoSmooth = make(256, (x, y) => concrete(x, y, { seams: false, base: 156 }), { smooth: true });
    T.concretePale = make(256, (x, y) => { const v = 132 + (na(x, y) - 0.5) * 14 + (nb(x, y) - 0.5) * 6; return [v + 2, v + 1, v]; }, { smooth: true });
  }

  // A chevron floor, black and cream, the zigzag of a certain red room.
  T.chevron = make(64, (x, y) => { const k = ((x + (y < 32 ? y : 63 - y)) >> 4) & 1; return k ? [214, 206, 188] : [22, 20, 20]; }, { smooth: false });
  return T;
}

// Neon sign textures: words from two signs spliced together, each half in its
// own typeface and colour, drawn small so the letters stay chunky.
import * as THREE from '../../vendor/three.module.js?v=41d35b4';

const FONTS = {
  sans: 'bold 30px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif',
  serif: 'italic 32px Georgia, "Times New Roman", serif',
  script: 'italic 34px "Brush Script MT", "Snell Roundhand", "Apple Chancery", cursive',
  mono: 'bold 28px "Courier New", Courier, monospace',
  black: '900 30px Impact, "Arial Black", sans-serif',
  light: '300 30px "Helvetica Neue", Arial, sans-serif',
};

export function makeSignTexture(parts, { dead = false, faded = false, width = 256, height = 64 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.textBaseline = 'middle';
  // Measure at base size, then scale to fit.
  let total = 0;
  const widths = parts.map((p) => { ctx.font = FONTS[p.font] || FONTS.sans; const w = ctx.measureText(p.text).width + 6; total += w; return w; });
  // Bigger canvases (hires signs) draw the same letters bigger.
  const scale = Math.min(1, (256 - 16) / total) * (width / 256);
  let x = (width - total * scale) / 2;
  const seed = parts.map((p) => p.text).join('').length;
  let r = seed * 7 + 3;
  const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  parts.forEach((p, i) => {
    ctx.save();
    ctx.translate(x, height / 2);
    ctx.scale(scale, scale);
    ctx.font = FONTS[p.font] || FONTS.sans;
    // Faded: old painted letters, readable but long unlit, a few gone.
    const color = faded ? (p.color || '#c8c0b0') : dead ? '#2e2a2a' : (p.color || '#ff4060');
    // letter by letter, so a dead sign can lose a few tubes
    let lx = 0;
    for (const ch of p.text) {
      const w = ctx.measureText(ch).width;
      const missing = dead && rand() < (faded ? 0.12 : 0.3);
      if (faded) {
        if (!missing) { ctx.fillStyle = color; ctx.fillText(ch, lx, 0); }
      } else if (!dead) {
        ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.fillStyle = color;
        ctx.fillText(ch, lx, 0); ctx.fillText(ch, lx, 0);
        ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.55; ctx.fillText(ch, lx, 0); ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = missing ? '#1a1718' : color;
        ctx.fillText(ch, lx, 0);
      }
      lx += w;
    }
    ctx.restore();
    x += widths[i] * scale;
  });
  // Quantize alpha to keep the edges crisp after nearest sampling.
  const img = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 90 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false; tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

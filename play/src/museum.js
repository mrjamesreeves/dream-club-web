// The museum: the hall between dreams. A bed at the centre under its lamp;
// along the walls, the things seen in dreams, each under its own light. An
// exhibit is only there once the dreamer has met it (see scenes/exhibits.json);
// until then its plinth stands empty and its light is off.
//
// assembleMuseum() takes the hand-made museum scene and adds a section of
// wall for every dream in the sequence, in order, clockwise from the north
// wall: the dream's name high on the wall, a row of plinths in front of it,
// and a hanging spot over each one.

const WIDTH = { small: 2.1, mid: 3.6, big: 6.2 };     // floor space along the wall
const SCALE = { small: 2.2, mid: 1, big: 1 };         // items are small; show them bigger
const WALLS = [
  { u: [0, -1], t: [1, 0] },   // north: outward is -z, the wall runs along +x
  { u: [1, 0], t: [0, 1] },    // east
  { u: [0, 1], t: [-1, 0] },   // south
  { u: [-1, 0], t: [0, -1] },  // west
];
const deg = (r) => ((Math.round(r * 180 / Math.PI) % 360) + 360) % 360;

export function assembleMuseum(base, manifest, sequence) {
  const def = JSON.parse(JSON.stringify(base));
  def.names = { ...(def.names || {}) };
  def.objects = def.objects || [];
  const H = def.hall ?? 60, CEIL = def.ceiling ?? 12;
  // Everything from every dream, mixed together round the walls in a fixed
  // shuffle (by id), so a thing keeps its place from one night to the next.
  const known = new Set(sequence);
  const list = (manifest.exhibits || []).filter((e) => known.has(e.dream)).map((e) => ({ e, key: hash(e.id) })).sort((a, b) => a.key - b.key).map((x) => x.e);
  const widths = list.map((e) => WIDTH[e.size] || WIDTH.small);
  const total = widths.reduce((a, b) => a + b, 0);
  // One run along all four walls, clockwise from the north wall's west end,
  // with the leftover room shared out as gaps.
  const usable = 4 * (H - 2 * MARGIN);
  const gap = Math.max(0, (usable - total) / Math.max(1, list.length));
  let s = 0;
  list.forEach((e, k) => {
    const c = s + widths[k] / 2; s += widths[k] + gap;
    const wall = Math.min(3, Math.floor(c / (H - 2 * MARGIN)));
    const along = -H / 2 + MARGIN + (c - wall * (H - 2 * MARGIN));
    const w = WALLS[wall];
    const dist = e.size === 'big' ? 6 : 4.6;
    const x = w.u[0] * (H / 2 - dist) + w.t[0] * along, z = w.u[1] * (H / 2 - dist) + w.t[1] * along;
    const faceYaw = deg(Math.atan2(-w.u[0], -w.u[1]));
    place(def, e, x, z, faceYaw, CEIL);
  });
  return def;
}

const MARGIN = 4;
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }

function place(def, e, x, z, faceYaw, ceil) {
  const size = e.size || 'small';
  // Small things stand on a plinth; bigger ones on a low dais.
  const plinth = { small: [1.0, 1.0, 1.0], mid: [2.8, 0.3, 2.8], big: [5.6, 0.2, 5.6] }[size];
  def.objects.push({ type: 'box', pos: [x, plinth[1] / 2, z], size: plinth, tex: 'marble', texScale: 1, shade: 0.85 });
  const top = plinth[1], lift = e.lift ?? 0;
  const o = {
    ...e.object, id: e.id, pos: [x, top + lift, z], hidden: true, off: true, name: e.name,
    examine: e.text.map((t) => ({ who: e.id, text: t })), examineRange: size === 'small' ? 3.4 : 5.5,
  };
  const scale = e.scale ?? (o.type === 'item' ? SCALE[size] : null);
  if (scale) o.scale = scale;
  if (e.face === '-z') o.yaw = (faceYaw + 180) % 360;
  else if (e.face === '+z' || o.type === 'item') o.yaw = faceYaw;
  if (o.examineAt) o.examineAt = [x + o.examineAt[0], top + lift + o.examineAt[1], z + o.examineAt[2]];
  else if (o.type !== 'creature' && o.type !== 'character') {
    const r = { small: 0.5, mid: 1.0, big: 1.8 }[size];
    o.examineAt = [x, top + lift + (size === 'small' ? 0.2 : size === 'mid' ? 0.7 : 1.1), z];
    o.examineRadius = Math.max(o.examineRadius || 0, r);
  }
  def.objects.push(o);
  def.names[e.id] = e.name;
  // Pieces that go with it (bottles on a bar, the cord a thing hangs from).
  (e.extras || []).forEach((ex, k) => {
    const [dx, dy, dz] = ex.pos || [0, 0, 0];
    def.objects.push({ ...ex, id: `${e.id}#${k}`, pos: [x + dx, top + lift + dy, z + dz], hidden: true, off: true, collide: false, walkable: false });
  });
  // Its light: a spot hung from the ceiling, dark until the thing is here.
  const objTop = top + lift + { small: 0.5, mid: 1.7, big: 2.9 }[size];
  const shadeY = objTop + { small: 0.7, mid: 0.8, big: 1.0 }[size];
  def.objects.push({ type: 'spotlight', id: 'xl:' + e.id, pos: [x, ceil, z], drop: ceil - shadeY - 0.14, intensity: { small: 1.3, mid: 2.0, big: 2.6 }[size], range: { small: 5, mid: 8, big: 11 }[size], off: true, color: '#ffd9a0', glowSize: 0.9, glowStrength: 0.45 });
}

// Can the player get everywhere a dream needs them to? A flood fill over a
// grid, using the player's own collision and floor tests, from every place
// the dream puts the player (the start, every teleport, every seat) toward
// every target: people to talk to, things to look at, and the places events
// wait for the player to walk into. Run by tools/check_paths.js on every
// scene; a scene lists what is meant to be out of reach in `unreachable`.
export function checkPaths(g, opts = {}) {
  const def = g.def || {}, pl = g.player;
  const step = pl.stepHeight, cellMax = opts.cell ?? 0.3;
  const starts = [];
  const p0 = def.player?.pos || [0, 0, 0];
  starts.push({ x: p0[0], y: p0[1] ?? 0, z: p0[2], why: 'start' });
  const scan = (v) => {
    if (Array.isArray(v)) { v.forEach(scan); return; }
    if (!v || typeof v !== 'object') return;
    if (v.teleport?.pos) starts.push({ x: v.teleport.pos[0], y: v.teleport.pos[1] ?? 0, z: v.teleport.pos[2], why: 'teleport' });
    if (v.seat?.pos) starts.push({ x: v.seat.pos[0], y: v.seat.pos[1] ?? 0, z: v.seat.pos[2], why: 'seat' });
    for (const k in v) if (k !== 'teleport' && k !== 'seat') scan(v[k]);
  };
  scan(def.events); scan(def.items); scan(def.objects); scan(def.prefabs);

  const skip = new Set(def.unreachable || []);
  const targets = [];
  for (const e of g.entities.values()) {
    if (!e.group.visible || (!e.talkable && !e.examineLines)) continue;
    const p = e.group.position;
    targets.push({ id: e.id, name: e.name, x: p.x, y: p.y, z: p.z, r: Math.max(0.8, (e.talkable ? e.talkRadius - 0.1 : 3.7)) });
  }
  for (const ex of g.world.examinables) {
    if (ex.hidden || ex.ride) continue;   // scenery that streams past a vehicle is seen, not walked to
    const c = ex.center;
    targets.push({ id: ex.id, name: ex.name, x: c.x, y: c.y, z: c.z, r: Math.max(0.8, (ex.range ?? 3) - 0.3) + (ex.radius || 0), eye: true, track: ex.track, trackRange: ex.trackRange });
  }
  for (const ev of def.events || []) {
    const w = ev.when || {};
    if (w.enter?.pos) targets.push({ id: 'enter:' + ev.id, name: `event ${ev.id}`, x: w.enter.pos[0], y: null, z: w.enter.pos[1], r: Math.max(0.5, (w.enter.radius ?? 1.5) - 0.2), maxY: w.enter.maxY, minY: w.enter.minY });
  }
  for (const t of targets) { t.reached = false; t.nearest = Infinity; t.skipped = skip.has(t.id); }

  // Something in view from where the player is put counts as reached: a far
  // tower examined from a ledge needs no walking.
  for (const s of starts) for (const t of targets) {
    if (!t.eye || t.reached) continue;
    const y = pl.floorAt(s.x, s.z, s.y + 1.2) ?? s.y;
    if (Math.hypot(t.x - s.x, t.z - s.z, t.y - (y + 1.6)) <= t.r) { t.reached = true; t.from = s.why; }
  }
  // The floor under the player's footprint, not a single point: the highest
  // surface found at the centre and a little way out, so a ray down a seam
  // between two floor pieces does not drop the player through the floor.
  const SUB = 3;
  const floorUnder = (x, z, fromY) => {
    let best = null;
    for (const [ox, oz] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) {
      const f = pl.floorAt(x + ox, z + oz, fromY);
      if (f !== null && (best === null || f > best)) best = f;
    }
    return best;
  };
  const REACH = opts.reach ?? 60;
  let cellsVisited = 0;
  const visited = [];
  for (const s of starts) {
    // The region this start serves: its targets within reach, padded.
    const mine = targets.filter((t) => !t.reached && Math.hypot(t.x - s.x, t.z - s.z) < REACH);
    if (!mine.length) continue;
    let minX = s.x, maxX = s.x, minZ = s.z, maxZ = s.z;
    for (const t of mine) { minX = Math.min(minX, t.x - t.r); maxX = Math.max(maxX, t.x + t.r); minZ = Math.min(minZ, t.z - t.r); maxZ = Math.max(maxZ, t.z + t.r); }
    minX -= 4; maxX += 4; minZ -= 4; maxZ += 4;
    const area = (maxX - minX) * (maxZ - minZ);
    const cell = Math.max(cellMax, Math.sqrt(area / (opts.maxCells ?? 45000)));
    const y0 = pl.floorAt(s.x, s.z, s.y + 1.2) ?? s.y;
    const seen = new Set();
    const key = (i, j, y) => `${i},${j},${Math.round(y / 0.25)}`;
    const queue = [[0, 0, y0]];
    seen.add(key(0, 0, y0));
    while (queue.length) {
      const [i, j, y] = queue.shift();
      const x = s.x + i * cell, z = s.z + j * cell;
      cellsVisited++;
      if (opts.debug) visited.push([+x.toFixed(2), +z.toFixed(2), +y.toFixed(2)]);
      for (const t of mine) {
        if (t.reached) continue;
        let tx = t.x, tz = t.z;
        if (t.track) { const lo = t.trackRange?.[0] ?? -Infinity, hi = t.trackRange?.[1] ?? Infinity; if (t.track === 'x') tx = Math.min(hi, Math.max(lo, x)); else tz = Math.min(hi, Math.max(lo, z)); }
        let d = Math.hypot(tx - x, tz - z);
        if (t.eye) d = Math.hypot(d, t.y - (y + 1.6));   // looked at from eye height
        t.nearest = Math.min(t.nearest, d);
        if (d > t.r) continue;
        if (!t.eye && t.y !== null && t.y !== undefined && Math.abs(t.y - y) > 2.6) continue;
        if (t.maxY !== undefined && y > t.maxY) continue;
        if (t.minY !== undefined && y < t.minY) continue;
        t.reached = true; t.from = s.why;
      }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        const nx = s.x + ni * cell, nz = s.z + nj * cell;
        if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
        // Walk there in small moves, as the player would: the feet follow
        // the floor as they go, so a stair's next step is already underfoot
        // when its edge comes within the player's width.
        let fy = y, ok = true;
        for (let k = 1; k <= SUB; k++) {
          const px = x + (nx - x) * k / SUB, pz = z + (nz - z) * k / SUB;
          if (pl.blockedAt(px, pz, fy)) { ok = false; break; }
          const f = floorUnder(px, pz, fy + step + 0.05);
          if (f === null || f > fy + step + 0.001 || fy - f > 4) { ok = false; break; }
          fy = f;
        }
        if (!ok) continue;
        const k = key(ni, nj, fy);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push([ni, nj, fy]);
      }
    }
  }
  const unreachable = targets.filter((t) => !t.reached && !t.skipped).map((t) => ({ id: t.id, name: t.name, pos: [+t.x.toFixed(1), +t.z.toFixed(1)], nearest: isFinite(t.nearest) ? +t.nearest.toFixed(1) : null }));
  const expected = targets.filter((t) => t.skipped && t.reached).map((t) => t.id);
  return { visited: opts.debug ? visited : undefined, scene: g.sceneName, starts: starts.length, targets: targets.length, reached: targets.filter((t) => t.reached).length, cells: cellsVisited, unreachable, reachedButListedUnreachable: expected };
}

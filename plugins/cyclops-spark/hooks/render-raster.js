// Terminal path: a scene → pixels, in plain JS (the hooks module has no canvas). Anti-aliased strokes, gaussian
// glow, additive light on dark grounds, "over" on light ones. Two outputs:
//   toRGBA8      → an `Image` { rgba } for kitty / Ghostty (real pixels with alpha), swapped with $.ui.blit
//   toHalfBlocks → `Raster` cells for every other terminal: '▀' carries two colour pixels per cell

// `fill` (focus): instead of fitting Spark into the square in the middle, compose it for the whole region. The core keeps
// its size and stays round; the reach of everything beyond it stretches smoothly toward the longer side, so on a wide
// screen the tendrils and lanes spread into the width, and on a tall one into the height. A safe margin keeps every
// tip inside the region. Presentation only: the scene (the state) is the same, only where it lands on the grid moves.
export function createRaster(W, H, { fill = false } = {}) {
  const px = new Float32Array(W * H * 4)       // premultiplied r g b a
  const cov = new Float32Array(W * H)
  const stamp = new Int32Array(W * H).fill(-1)
  let touched = new Int32Array(4096)
  let nt = 0
  const margin = fill ? Math.max(2, Math.round(Math.min(W, H) * 0.04)) : 0
  const scale = (Math.min(W, H) - 2 * margin) / 2.4
  const ox = W / 2, oy = H / 2
  const clamp = (v) => Math.max(1, Math.min(2.6, v))
  const ax = fill ? clamp((W / 2 - margin) / (1.2 * scale)) : 1
  const ay = fill ? clamp((H / 2 - margin) / (1.2 * scale)) : 1
  const reach = (x, y) => { // 0 inside the core, easing to 1 at the tips
    if (ax === 1 && ay === 1) return 0
    const u = Math.max(0, Math.min(1, (Math.hypot(x, y) - 0.22) / 0.73))
    return u * u * (3 - 2 * u)
  }
  const P = (x, y) => { const s = reach(x, y); return [ox + x * (1 + (ax - 1) * s) * scale, oy + y * (1 + (ay - 1) * s) * scale] }

  function touch(p, pid, c) {
    if (stamp[p] !== pid) {
      stamp[p] = pid; cov[p] = 0
      if (nt === touched.length) { const n = new Int32Array(nt * 2); n.set(touched); touched = n }
      touched[nt++] = p
    }
    if (c > cov[p]) cov[p] = c
  }
  function flush(col, a, additive, colAt) {
    for (let i = 0; i < nt; i++) {
      const p = touched[i], k = p * 4
      const c = colAt ? colAt(p) : col
      const al = cov[p] * a
      if (additive) {
        px[k] += c[0] * al; px[k + 1] += c[1] * al; px[k + 2] += c[2] * al
        px[k + 3] = 1 - (1 - px[k + 3]) * (1 - al)
      } else {
        px[k] = c[0] * al + px[k] * (1 - al); px[k + 1] = c[1] * al + px[k + 1] * (1 - al); px[k + 2] = c[2] * al + px[k + 2] * (1 - al)
        px[k + 3] = al + px[k + 3] * (1 - al)
      }
    }
    nt = 0
  }

  // `over`: paint each mark over the last (as paper does) instead of adding its light, on any ground
  // `floor`: the thinnest a mark is drawn, in pixels (a speck is a whole cell in the terminal; a large picture keeps
  // its specks and lines visible with a floor of its own)
  // `res`: how many of this raster's pixels make one of the terminal's half-block pixels (2 for HD): the thinnest marks
  // keep the weight they have in the terminal, drawn at the finer grid
  // `keep`: draw over what the raster already holds instead of starting clean (the roll lays a painting down a few marks
  // at a time)
  function* drawing(scene, theme, { over = false, floor = 0.6, res = 1, keep = false } = {}) {
    const fl = Math.max(0.6 * res, floor), fw = Math.max(0.45 * res, floor * 0.75), fp = Math.max(0.5 * res, floor * 0.75) // dots, rings and arcs, paths
    if (!keep) px.fill(0)
    stamp.fill(-1)
    const additive = theme !== 'light' && !over
    let pid = 0
    for (const p of scene) {
      yield // between marks: drawAsync may let other work in here
      pid++
      if (p.k === 'glow') {
        const r = Math.max(1, p.r * scale * 1.6), [cx, cy] = P(p.x, p.y)
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r))
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r))
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const d2 = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) / (r * r)
          if (d2 < 1) touch(y * W + x, pid, Math.exp(-4.2 * d2) * (1 - d2))
        }
        flush(p.c, p.a * (additive ? 0.9 : 0.5), true)
      } else if (p.k === 'dot') {
        const r = Math.max(fl, p.r * scale), [cx, cy] = P(p.x, p.y)
        const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1))
        const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1))
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
          const c = Math.max(0, Math.min(1, r + 0.5 - d))
          if (c > 0) touch(y * W + x, pid, c)
        }
        flush(p.c, p.a, additive)
      } else if (p.k === 'ring') {
        const r = p.r * scale, hw = Math.max(fw, (p.w * scale) / 2), [cx, cy] = P(p.x, p.y)
        const x0 = Math.max(0, Math.floor(cx - r - 2)), x1 = Math.min(W - 1, Math.ceil(cx + r + 2))
        const y0 = Math.max(0, Math.floor(cy - r - 2)), y1 = Math.min(H - 1, Math.ceil(cy + r + 2))
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy
          const d = Math.abs(Math.hypot(dx, dy) - r)
          let c = Math.max(0, Math.min(1, hw + 0.5 - d))
          if (c > 0 && p.dash && Math.sin(Math.atan2(dy, dx) * 14) < 0) c *= 0.15
          if (c > 0) touch(y * W + x, pid, c)
        }
        flush(p.c, p.a, additive)
      } else if (p.k === 'slot') {
        // Keeper's slot: his own mark, never Spark's. The single eye from cyclops-keeper's keeper.svg (GPT's design):
        // a dark aperture in a lavender rim, a pale-gold inner ring and a slit pupil, in his own colours, not Spark's.
        // What it does is read from the lane only: it narrows while his call waits on your OK (as his own mod does on a
        // permission request) and is still when nothing is out.
        if (p.who !== 'keeper') continue
        const [cx, cy] = P(p.x, p.y), R = Math.max(1.6, p.r * scale * 0.82), a = Math.max(0, Math.min(1, p.reach))
        if (a < 0.02) continue
        const K = additive ? KEEPER_DARK : KEEPER_LIGHT
        const x0 = Math.max(0, Math.floor(cx - R - 2)), x1 = Math.min(W - 1, Math.ceil(cx + R + 2))
        const y0 = Math.max(0, Math.floor(cy - R - 2)), y1 = Math.min(H - 1, Math.ceil(cy + R + 2))
        const ringAt = (r, hw, col, al) => {
          pid++
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const c = Math.max(0, Math.min(1, hw + 0.5 - Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r)))
            if (c > 0) touch(y * W + x, pid, c)
          }
          flush(col, al, additive)
        }
        // the aperture itself: dark glass, so the rim and pupil read as an eye on any ground
        pid++
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const c = Math.max(0, Math.min(1, R + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)))
          if (c > 0) touch(y * W + x, pid, c)
        }
        flush(K.glass, 0.85 * a, false)
        ringAt(R, Math.max(0.45, R * 0.07), K.rim, a)            // rim (lavender)
        ringAt(R * 0.67, Math.max(0.4, R * 0.045), K.ring, 0.8 * a) // inner ring (pale gold)
        // the slit pupil: a vesica, tall and narrow; narrower still while he waits on you
        const hh = R * 0.4, hw = R * (p.asking ? 0.08 : 0.17)
        pid++
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dy = (y + 0.5 - cy) / hh
          if (Math.abs(dy) >= 1) continue
          const c = Math.max(0, Math.min(1, Math.max(0.5, hw * (1 - dy * dy)) + 0.5 - Math.abs(x + 0.5 - cx)))
          if (c > 0) touch(y * W + x, pid, c * (1 - dy * dy * 0.5))
        }
        flush(K.pupil, a, false)
      } else if (p.k === 'arc') {
        // part of a ring, from angle a0 to a1 (radians, clockwise on screen), the ends rounded by the stroke's width
        const r = p.r * scale, hw = Math.max(fw, (p.w * scale) / 2), [cx, cy] = P(p.x, p.y)
        const a0 = p.a0, span = ((p.a1 - p.a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2
        const x0 = Math.max(0, Math.floor(cx - r - hw - 2)), x1 = Math.min(W - 1, Math.ceil(cx + r + hw + 2))
        const y0 = Math.max(0, Math.floor(cy - r - hw - 2)), y1 = Math.min(H - 1, Math.ceil(cy + r + hw + 2))
        const ex = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], ey = [cx + r * Math.cos(a0 + span), cy + r * Math.sin(a0 + span)]
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy
          const at = ((Math.atan2(dy, dx) - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
          let d = at <= span ? Math.abs(Math.hypot(dx, dy) - r) : Math.min(Math.hypot(x + 0.5 - ex[0], y + 0.5 - ex[1]), Math.hypot(x + 0.5 - ey[0], y + 0.5 - ey[1]))
          const c = Math.max(0, Math.min(1, hw + 0.5 - d))
          if (c > 0) touch(y * W + x, pid, c)
        }
        flush(p.c, p.a, additive)
      } else if (p.k === 'poly') {
        // a filled shape: its points in order, closed; the colour runs from c0 to c1 along `grad` (an angle) when they differ
        const pts = p.pts.map(([x, y]) => P(x, y)), n = pts.length
        if (n < 3) continue
        let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity
        for (const [x, y] of pts) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y }
        const x0 = Math.max(0, Math.floor(minx)), x1 = Math.min(W - 1, Math.ceil(maxx))
        const y0 = Math.max(0, Math.floor(miny)), y1 = Math.min(H - 1, Math.ceil(maxy))
        // even-odd, 2×2 subsamples a pixel (a soft edge), by scanlines: on each subsample row the edges it crosses, sorted;
        // a subsample is inside between the 1st and 2nd crossing, the 3rd and 4th, ... (the same rule, point by point, as
        // counting crossings to its right, but each row costs its edges once instead of every pixel costing them all)
        const ex = new Float64Array(n), ey = new Float64Array(n)
        for (let i = 0; i < n; i++) { ex[i] = pts[i][0]; ey[i] = pts[i][1] }
        const span = x1 - x0 + 1, row = new Float32Array(span), xs = new Float64Array(n)
        for (let y = y0; y <= y1; y++) {
          row.fill(0)
          for (const sy of [0.25, 0.75]) {
            const qy = y + sy
            let m = 0
            for (let i = 0, j = n - 1; i < n; j = i++) {
              const yi = ey[i], yj = ey[j]
              if ((yi > qy) !== (yj > qy)) xs[m++] = ((ex[j] - ex[i]) * (qy - yi)) / (yj - yi) + ex[i]
            }
            if (m < 2) continue
            const cross = xs.subarray(0, m).sort()
            for (let k = 0; k + 1 < m; k += 2) {
              const a = cross[k], b = cross[k + 1]
              for (const sx of [0.25, 0.75]) { // pixel x holds this subsample when a <= x + sx < b
                const from = Math.max(x0, Math.ceil(a - sx)), to = Math.min(x1, Math.ceil(b - sx) - 1)
                for (let x = from; x <= to; x++) row[x - x0] += 0.25
              }
            }
          }
          for (let i = 0; i < span; i++) if (row[i] > 0) touch(y * W + x0 + i, pid, row[i])
        }
        const c0 = p.c0, c1 = p.c1 || p.c0
        const same = c0[0] === c1[0] && c0[1] === c1[1] && c0[2] === c1[2]
        const gx = Math.cos(p.grad || 0), gy = Math.sin(p.grad || 0)
        const lo = Math.min(...pts.map(([x, y]) => x * gx + y * gy)), hi = Math.max(...pts.map(([x, y]) => x * gx + y * gy))
        flush(c0, p.a, additive, same ? null : (q) => { const u = hi > lo ? (((q % W) + 0.5) * gx + (Math.floor(q / W) + 0.5) * gy - lo) / (hi - lo) : 0; return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u] })
      } else if (p.k === 'path') {
        const pts = p.pts.map(([x, y]) => P(x, y)), n = pts.length
        const hw = Math.max(fp, (p.w * scale) / 2)
        const segOf = new Map()
        for (let s = 0; s < n - 1; s++) {
          const [ax, ay] = pts[s], [bx, by] = pts[s + 1]
          const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + hw + 1))
          const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + hw + 1))
          const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-6
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const qx = x + 0.5 - ax, qy = y + 0.5 - ay
            const u = Math.max(0, Math.min(1, (qx * vx + qy * vy) / L2))
            const d = Math.hypot(qx - u * vx, qy - u * vy)
            const c = Math.max(0, Math.min(1, hw + 0.5 - d))
            if (c > 0) { const q = y * W + x; touch(q, pid, c); if (!segOf.has(q)) segOf.set(q, (s + u) / (n - 1)) }
          }
        }
        const c0 = p.c0, c1 = p.c1
        const same = c0[0] === c1[0] && c0[1] === c1[1] && c0[2] === c1[2]
        flush(c0, p.a, additive, same ? null : (q) => { const u = segOf.get(q) || 0; return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u] })
      }
    }
    return px
  }
  // the whole scene at once (what a frame does)
  function draw(scene, theme, opts) {
    const g = drawing(scene, theme, opts)
    let r = g.next()
    while (!r.done) r = g.next()
    return r.value
  }
  // the same, handing over to `pause` (awaited) whenever it has run for `every` ms, so a large picture (a conversion)
  // never holds everything else up for long
  async function drawAsync(scene, theme, opts, pause, every = 25) {
    const g = drawing(scene, theme, opts)
    let since = Date.now(), r = g.next()
    while (!r.done) {
      if (Date.now() - since > every) { await pause(); since = Date.now() }
      r = g.next()
    }
    return r.value
  }
  return { W, H, px, draw, drawAsync }
}

// Keeper's own colours, from keeper.svg (rim --keeper-accent, inner ring --keeper-main, pupil); deepened on light grounds
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const KEEPER_DARK = { glass: hex('#090c11'), rim: hex('#c4a9e2'), ring: hex('#e1c6a4'), pupil: hex('#f2e8ff') }
const KEEPER_LIGHT = { glass: hex('#1a1f2a'), rim: hex('#7d5fa6'), ring: hex('#a8835a'), pupil: hex('#f2e8ff') }

const to8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)))

// kitty / Ghostty: straight (un-premultiplied) RGBA bytes
export function toRGBA8(r) {
  const { W, H, px } = r
  const out = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const k = i * 4, a = Math.min(1, px[k + 3])
    const s = a > 1e-4 ? 1 / a : 0
    out[k] = to8(px[k] * s); out[k + 1] = to8(px[k + 1] * s); out[k + 2] = to8(px[k + 2] * s); out[k + 3] = to8(a)
  }
  return out
}

// the picture flattened onto a ground, as the eye sees it in the terminal (the same shade as toHalfBlocks): RGB bytes,
// for /spark convert's PNG
export function toRGB8(r, ground) {
  const { W, H, px } = r
  const out = new Uint8Array(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    const k = i * 4, a = Math.min(1, px[k + 3])
    out[i * 3] = to8(px[k] + ground[0] * (1 - a)); out[i * 3 + 1] = to8(px[k + 1] + ground[1] * (1 - a)); out[i * 3 + 2] = to8(px[k + 2] + ground[2] * (1 - a))
  }
  return out
}

// any terminal: Raster cells [codePoint, fg, bg] — '▀' top pixel as fg, bottom as bg; the terminal's own default
// background where a pixel is (nearly) empty, so the entity sits on whatever the terminal's ground is.
export const DEFAULT = 0x01000000
export function toHalfBlocks(r, ground) {
  const { W, H, px } = r
  const rows = Math.floor(H / 2)
  const words = new Uint32Array(W * rows * 3)
  const shade = (i) => {
    const k = i * 4, a = Math.min(1, px[k + 3])
    if (a < 0.05) return -1
    // premultiplied colour over the assumed ground (what the eye sees)
    const rr = Math.min(1, px[k] + ground[0] * (1 - a)), gg = Math.min(1, px[k + 1] + ground[1] * (1 - a)), bb = Math.min(1, px[k + 2] + ground[2] * (1 - a))
    return (to8(rr) << 16) | (to8(gg) << 8) | to8(bb)
  }
  let w = 0
  for (let cy = 0; cy < rows; cy++) {
    for (let x = 0; x < W; x++) {
      const top = shade(cy * 2 * W + x), bot = shade((cy * 2 + 1) * W + x)
      if (top < 0 && bot < 0) { words[w++] = 0x20; words[w++] = DEFAULT; words[w++] = DEFAULT }
      else if (bot < 0) { words[w++] = 0x2580; words[w++] = top; words[w++] = DEFAULT }
      else if (top < 0) { words[w++] = 0x2584; words[w++] = bot; words[w++] = DEFAULT }
      else { words[w++] = 0x2580; words[w++] = top; words[w++] = bot }
    }
  }
  return words
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64C = Uint8Array.from(B64, (c) => c.charCodeAt(0))
// fast: encode into a byte buffer, then turn it into a string in large chunks
export function base64(bytes) {
  const n = bytes.length, out = new Uint8Array(Math.ceil(n / 3) * 4)
  let o = 0, i = 0
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out[o++] = B64C[v >> 18]; out[o++] = B64C[(v >> 12) & 63]; out[o++] = B64C[(v >> 6) & 63]; out[o++] = B64C[v & 63]
  }
  if (i < n) {
    const v = (bytes[i] << 16) | ((i + 1 < n ? bytes[i + 1] : 0) << 8)
    out[o++] = B64C[v >> 18]; out[o++] = B64C[(v >> 12) & 63]
    out[o++] = i + 1 < n ? B64C[(v >> 6) & 63] : 61; out[o++] = 61
  }
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(out)
  let s = ''
  for (let k = 0; k < out.length; k += 0x8000) s += String.fromCharCode.apply(null, out.subarray(k, k + 0x8000))
  return s
}

// HD, for any terminal: four pixels to a cell instead of two, from the quadrant blocks (U+2596..U+259F, with the half
// and full blocks), which every terminal font draws as it draws the half blocks. The raster is drawn at two pixels
// across and four down per cell (square pixels, as the scene is composed); each quarter of a cell is the average of
// its 1 x 2 pixels (smoothing the edges), and of the ways to split the four quarters into two colours (a cell has
// one foreground and one background), the one that keeps closest to what was drawn is chosen. The half block is one of
// those ways, so a cell is never worse than before: a fine line can now be half a cell wide and keep its full light.
// Empty quarters stay the terminal's own background, as in toHalfBlocks.
const QUAD = [0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588] // by mask: 1 top-left, 2 top-right, 4 bottom-left, 8 bottom-right
const FAINT = 1 / 3
export function toQuadrants(r, ground) {
  const { W, H, px } = r
  const cols = Math.floor(W / 2), rows = Math.floor(H / 4)
  const words = new Uint32Array(cols * rows * 3)
  const qr = new Float64Array(4), qg = new Float64Array(4), qb = new Float64Array(4), qa = new Float64Array(4), empty = [false, false, false, false]
  const g0 = ground[0], g1 = ground[1], g2 = ground[2]
  let w = 0
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let lit = 0
      for (let q = 0; q < 4; q++) {
        const x = cx * 2 + (q & 1), y = cy * 4 + (q >> 1) * 2
        const k0 = (y * W + x) * 4, k1 = ((y + 1) * W + x) * 4
        const a = Math.min(1, (Math.min(1, px[k0 + 3]) + Math.min(1, px[k1 + 3])) / 2)
        const pr = (px[k0] + px[k1]) / 2, pg = (px[k0 + 1] + px[k1 + 1]) / 2, pb = (px[k0 + 2] + px[k1 + 2]) / 2
        empty[q] = a < 0.05; qa[q] = a
        // premultiplied colour over the assumed ground (what the eye sees)
        qr[q] = Math.min(1, pr + g0 * (1 - a)); qg[q] = Math.min(1, pg + g1 * (1 - a)); qb[q] = Math.min(1, pb + g2 * (1 - a))
        if (!empty[q]) lit++
      }
      if (!lit) { words[w++] = 0x20; words[w++] = DEFAULT; words[w++] = DEFAULT; continue }
      // the best split: the mask of quarters in the first colour (bottom-right always in the second: the rest are mirrors)
      let best = 0, bestErr = Infinity
      for (let m = 0; m < 8; m++) {
        let err = 0
        for (const side of [m, 15 ^ m]) {
          let n = 0, sr = 0, sg = 0, sb = 0
          for (let q = 0; q < 4; q++) if (side & (1 << q)) { n++; sr += qr[q]; sg += qg[q]; sb += qb[q] }
          if (!n) continue
          sr /= n; sg /= n; sb /= n
          for (let q = 0; q < 4; q++) if (side & (1 << q)) err += (qr[q] - sr) ** 2 * 0.3 + (qg[q] - sg) ** 2 * 0.59 + (qb[q] - sb) ** 2 * 0.11
        }
        if (err < bestErr - 1e-9) { bestErr = err; best = m }
      }
      // each side's colour, or the terminal's own background where a side is mostly empty: its colour is mixed over an
      // assumed ground, so a faint side drawn as a colour would show that ground (near black) on whatever the terminal
      // really is, as dark marks around her edges; below a third of cover it is left to the terminal instead
      const colour = (side) => {
        let n = 0, sr = 0, sg = 0, sb = 0, sa = 0
        for (let q = 0; q < 4; q++) if (side & (1 << q)) { n++; sr += qr[q]; sg += qg[q]; sb += qb[q]; sa += empty[q] ? 0 : qa[q] }
        if (!n || sa / n < FAINT) return DEFAULT
        return (to8(sr / n) << 16) | (to8(sg / n) << 8) | to8(sb / n)
      }
      let fgMask = best, fg = colour(best), bg = colour(15 ^ best)
      if (fgMask === 0) { fgMask = 15; fg = bg; bg = DEFAULT } // one colour across the cell
      else if (fg === DEFAULT) { fgMask = 15 ^ fgMask; fg = bg; bg = DEFAULT } // the lit side is drawn, the empty side is the terminal's
      // a glyph is never drawn in the terminal's default foreground (its text colour): a cell with nothing lit enough
      // to keep is the terminal's own background, a space
      if (fg === DEFAULT || fgMask === 0) { words[w++] = 0x20; words[w++] = DEFAULT; words[w++] = DEFAULT }
      else if (fgMask === 15) { words[w++] = 0x2580; words[w++] = fg; words[w++] = bg === DEFAULT ? fg : bg } // a whole cell: as the half blocks draw it
      else { words[w++] = QUAD[fgMask]; words[w++] = fg; words[w++] = bg }
    }
  }
  return words
}

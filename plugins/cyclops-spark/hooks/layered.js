// LAYERED: a painting made large with the depth it has in the terminal. There it is laid down mark by mark, the first
// marks the far ground and the last the nearest light, at a size where every speck is a whole block and every line a
// soft band of light; drawn large and crisp (faithful), the same marks read flat. Layered keeps the weight the terminal
// gives them and builds the picture as layers in depth, back to front: the far layers softened (as a lens focused on the
// front would), each nearer layer casting a soft shadow onto what lies behind it, and the brightest light blooming over
// the whole, as it does on a screen. The same marks, in the same order and colours; only how they sit in depth is new.

import { createRaster } from './render-raster.js'
import { paintingScene } from './painter.js'

export const LAYERS = 4
// the layers: the marks in the order they were laid down, cut into LAYERS runs, back (0) to front
export function layersOf(p, k = LAYERS) {
  const n = p.marks.length, out = []
  const per = Math.max(1, Math.ceil(n / k))
  for (let i = 0; i < n; i += per) out.push({ ...p, marks: p.marks.slice(i, i + per) })
  return out
}
// the terminal's weight for a canvas: a speck at least about 0.8% of the shorter side across, a line about 0.6%
export const layeredFloor = (W, H) => Math.max(1, Math.min(W, H) * 0.004)

// a blur of a premultiplied RGBA buffer, in place: three box passes each way (close to a gaussian of the radius given)
function boxH(src, dst, W, H, r) {
  const n = 2 * r + 1
  for (let y = 0; y < H; y++) {
    const row = y * W * 4
    for (let c = 0; c < 4; c++) {
      let acc = 0
      for (let i = -r; i <= r; i++) acc += src[row + Math.min(W - 1, Math.max(0, i)) * 4 + c]
      for (let x = 0; x < W; x++) {
        dst[row + x * 4 + c] = acc / n
        acc += src[row + Math.min(W - 1, x + r + 1) * 4 + c] - src[row + Math.max(0, x - r) * 4 + c]
      }
    }
  }
}
function boxV(src, dst, W, H, r) {
  const n = 2 * r + 1
  for (let x = 0; x < W; x++) {
    for (let c = 0; c < 4; c++) {
      let acc = 0
      for (let i = -r; i <= r; i++) acc += src[Math.min(H - 1, Math.max(0, i)) * W * 4 + x * 4 + c]
      for (let y = 0; y < H; y++) {
        dst[y * W * 4 + x * 4 + c] = acc / n
        acc += src[Math.min(H - 1, y + r + 1) * W * 4 + x * 4 + c] - src[Math.max(0, y - r) * W * 4 + x * 4 + c]
      }
    }
  }
}
export function blur(px, W, H, radius) {
  const r = Math.max(0, Math.round(radius / 1.7)) // three passes of r make about a gaussian of 1.7 r
  if (r < 1) return px
  const tmp = new Float32Array(px.length)
  for (let pass = 0; pass < 3; pass++) { boxH(px, tmp, W, H, r); boxV(tmp, px, W, H, r) }
  return px
}

// One layer onto what lies behind it: first its shadow (its cover, a little lower, softened) darkens what is there
// (none for the first layer), then the layer itself, its light added (on a light ground, painted over)
function addLayer(acc, px, W, H, li, { light, short }) {
  if (li > 0) {
    const sh = new Float32Array(W * H * 4)
    const dy = Math.round(short * 0.006)
    for (let y = dy; y < H; y++) for (let x = 0; x < W; x++) sh[(y * W + x) * 4 + 3] = px[((y - dy) * W + x) * 4 + 3]
    blur(sh, W, H, short * 0.012)
    const k = light ? 0.22 : 0.4
    for (let i = 0; i < W * H; i++) {
      const s = 1 - k * Math.min(1, sh[i * 4 + 3])
      acc[i * 4] *= s; acc[i * 4 + 1] *= s; acc[i * 4 + 2] *= s
    }
  }
  for (let i = 0; i < W * H; i++) {
    const k = i * 4, a = Math.min(1, px[k + 3])
    if (light) { acc[k] = px[k] + acc[k] * (1 - a); acc[k + 1] = px[k + 1] + acc[k + 1] * (1 - a); acc[k + 2] = px[k + 2] + acc[k + 2] * (1 - a) }
    else { acc[k] += px[k]; acc[k + 1] += px[k + 1]; acc[k + 2] += px[k + 2] }
    acc[k + 3] = a + acc[k + 3] * (1 - a)
  }
}
// the brightest light blooms: what is past three quarters bright, softened wide and added back
function bloomOver(acc, W, H, short) {
  const bloom = new Float32Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const k = i * 4, m = Math.max(acc[k], acc[k + 1], acc[k + 2])
    const over = Math.max(0, m - 0.75) / Math.max(m, 1e-6)
    bloom[k] = acc[k] * over; bloom[k + 1] = acc[k + 1] * over; bloom[k + 2] = acc[k + 2] * over; bloom[k + 3] = over
  }
  blur(bloom, W, H, short * 0.03)
  for (let i = 0; i < W * H * 4; i++) if ((i & 3) !== 3) acc[i] += bloom[i] * 0.9
}

// The picture laid down a little at a time (for the roll): frame(q) is the picture with q of its marks laid (the one in
// progress partly), in depth. The layers already finished are kept composed, and the one being laid keeps its finished
// marks on a raster of its own, so a frame costs one layer's softening, its shadow and the bloom, not the whole picture.
// `pause` is awaited now and then, so a large picture never holds everything else up.
export function layeredStepper(p, W, H, { theme = 'dark' } = {}) {
  const light = theme === 'light', floor = layeredFloor(W, H), short = Math.min(W, H)
  const layers = layersOf(p), L = layers.length
  const starts = []
  let s = 0
  for (const l of layers) { starts.push(s); s += l.marks.length }
  const depthOf = (li) => (L > 1 ? 1 - li / (L - 1) : 0)
  const acc = new Float32Array(W * H * 4) // the layers finished
  let done = 0
  const cur = createRaster(W, H), shot = createRaster(W, H)
  let laid = 0 // the marks of layer `done` already on `cur`
  const lay = async (upTo, pause) => {
    if (upTo > laid) { await cur.drawAsync(paintingScene({ ...p, marks: layers[done].marks.slice(laid, upTo) }, W, H, { reveal: 1, theme }), theme, { floor, keep: true }, pause); laid = upTo }
  }
  const soften = (px, li) => { const d = depthOf(li); if (d > 0) blur(px, W, H, short * 0.006 * d) }
  return {
    async frame(q, pause = async () => {}) {
      const n = p.marks.length
      q = Math.max(0, Math.min(n, q))
      let li = 0
      while (li + 1 < L && Math.floor(q) >= starts[li + 1]) li++
      while (done < li) { // the layers passed since the last frame, finished and composed for good
        await lay(layers[done].marks.length, pause)
        await pause()
        soften(cur.px, done)
        addLayer(acc, cur.px, W, H, done, { light, short })
        cur.px.fill(0); laid = 0; done++
      }
      const whole = Math.min(layers[li].marks.length, Math.floor(q) - starts[li])
      await lay(whole, pause)
      shot.px.set(cur.px)
      const part = q - Math.floor(q)
      if (part > 0.001 && whole < layers[li].marks.length) shot.draw(paintingScene({ ...p, marks: [layers[li].marks[whole]] }, W, H, { reveal: part, theme }), theme, { floor, keep: true })
      await pause()
      soften(shot.px, li)
      const out = acc.slice()
      addLayer(out, shot.px, W, H, li, { light, short })
      if (!light) { await pause(); bloomOver(out, W, H, short) }
      return out
    },
  }
}

// The whole picture, W x H, as a raster's pixels ({ W, H, px }, premultiplied RGBA, light added on a dark ground as the
// terminal does, painted over on a light one)
export async function layeredRaster(p, W, H, { theme = 'dark', pause = async () => {} } = {}) {
  return { W, H, px: await layeredStepper(p, W, H, { theme }).frame(p.marks.length, pause) }
}

// The scenes of its layers, back to front, each with its depth (1 the farthest), for sceneSVG's `layers`
export function layeredScenes(p, W, H, { theme = 'dark' } = {}) {
  const layers = layersOf(p), L = layers.length
  return layers.map((lp, li) => [paintingScene(lp, W, H, { reveal: 1, theme }), L > 1 ? 1 - li / (L - 1) : 0])
}

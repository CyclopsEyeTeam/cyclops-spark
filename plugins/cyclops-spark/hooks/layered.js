// LAYERED: a painting made large with the depth it has in the terminal. There it is laid down mark by mark, the first
// marks the far ground and the last the nearest light, at a size where every speck is a whole block and every line a
// soft band of light; drawn large and crisp (faithful), the same marks read flat. Layered keeps the weight the terminal
// gives them and builds the picture as layers in depth, back to front: the far layers softened (as a lens focused on the
// front would), each nearer layer casting a soft shadow onto what lies behind it, and the brightest light blooming over
// the whole, as it does on a screen. The same marks, in the same order and colours; only how they sit in depth is new.

import { createRaster } from './render-raster.js'
import { paintingScene } from './painter.js'
import { drain, drainAsync } from './steps.js'

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

// Every step below is a generator that yields after each row (or column) it finishes (see steps.js)
export { drain, drainAsync }

// a blur of a buffer of `ch` channels a pixel (premultiplied RGBA, or a cover alone), in place: three box passes each
// way (close to a gaussian of the radius given). `tmp` is scratch of at least the buffer's length, reused if given
function* boxH(src, dst, W, H, r, ch) {
  const n = 2 * r + 1
  for (let y = 0; y < H; y++) {
    const row = y * W * ch
    for (let c = 0; c < ch; c++) {
      let acc = 0
      for (let i = -r; i <= r; i++) acc += src[row + Math.min(W - 1, Math.max(0, i)) * ch + c]
      for (let x = 0; x < W; x++) {
        dst[row + x * ch + c] = acc / n
        acc += src[row + Math.min(W - 1, x + r + 1) * ch + c] - src[row + Math.max(0, x - r) * ch + c]
      }
    }
    yield
  }
}
function* boxV(src, dst, W, H, r, ch) {
  const n = 2 * r + 1, stride = W * ch
  for (let x = 0; x < W; x++) {
    for (let c = 0; c < ch; c++) {
      const col = x * ch + c
      let acc = 0
      for (let i = -r; i <= r; i++) acc += src[Math.min(H - 1, Math.max(0, i)) * stride + col]
      for (let y = 0; y < H; y++) {
        dst[y * stride + col] = acc / n
        acc += src[Math.min(H - 1, y + r + 1) * stride + col] - src[Math.max(0, y - r) * stride + col]
      }
    }
    yield
  }
}
function* blurring(px, W, H, radius, ch = 4, tmp = null) {
  const r = Math.max(0, Math.round(radius / 1.7)) // three passes of r make about a gaussian of 1.7 r
  if (r < 1) return px
  const t = tmp && tmp.length >= W * H * ch ? tmp : new Float32Array(W * H * ch)
  for (let pass = 0; pass < 3; pass++) { yield* boxH(px, t, W, H, r, ch); yield* boxV(t, px, W, H, r, ch) }
  return px
}
export function blur(px, W, H, radius) { return drain(blurring(px, W, H, radius)) }

// One layer onto what lies behind it: first its shadow (its cover, a little lower, softened) darkens what is there
// (none for the first layer), then the layer itself, its light added (on a light ground, painted over). `tmp` is
// scratch of 2 x W x H at least: the shadow's cover and its blur's own scratch
function* addLayer(acc, px, W, H, li, { light, short, tmp }) {
  if (li > 0) {
    const N = W * H, sh = tmp.subarray(0, N), shTmp = tmp.subarray(N, 2 * N)
    const dy = Math.round(short * 0.006)
    sh.fill(0, 0, dy * W)
    for (let y = dy; y < H; y++) { for (let x = 0; x < W; x++) sh[y * W + x] = px[((y - dy) * W + x) * 4 + 3]; yield }
    yield* blurring(sh, W, H, short * 0.012, 1, shTmp)
    const k = light ? 0.22 : 0.4
    for (let y = 0; y < H; y++) {
      for (let i = y * W; i < (y + 1) * W; i++) {
        const s = 1 - k * Math.min(1, sh[i])
        acc[i * 4] *= s; acc[i * 4 + 1] *= s; acc[i * 4 + 2] *= s
      }
      yield
    }
  }
  for (let y = 0; y < H; y++) {
    for (let i = y * W; i < (y + 1) * W; i++) {
      const k = i * 4, a = Math.min(1, px[k + 3])
      if (light) { acc[k] = px[k] + acc[k] * (1 - a); acc[k + 1] = px[k + 1] + acc[k + 1] * (1 - a); acc[k + 2] = px[k + 2] + acc[k + 2] * (1 - a) }
      else { acc[k] += px[k]; acc[k + 1] += px[k + 1]; acc[k + 2] += px[k + 2] }
      acc[k + 3] = a + acc[k + 3] * (1 - a)
    }
    yield
  }
}
// the brightest light blooms: what is past three quarters bright, softened wide and added back (`bloom` and `tmp` are
// scratch the size of the picture)
function* bloomOver(acc, W, H, short, bloom, tmp) {
  for (let y = 0; y < H; y++) {
    for (let i = y * W; i < (y + 1) * W; i++) {
      const k = i * 4, m = Math.max(acc[k], acc[k + 1], acc[k + 2])
      const over = Math.max(0, m - 0.75) / Math.max(m, 1e-6)
      bloom[k] = acc[k] * over; bloom[k + 1] = acc[k + 1] * over; bloom[k + 2] = acc[k + 2] * over; bloom[k + 3] = over
    }
    yield
  }
  yield* blurring(bloom, W, H, short * 0.03, 4, tmp)
  for (let y = 0; y < H; y++) {
    for (let i = y * W * 4; i < (y + 1) * W * 4; i++) if ((i & 3) !== 3) acc[i] += bloom[i] * 0.9
    yield
  }
}

// The picture laid down a little at a time (for the roll): frame(q) is the picture with q of its marks laid (the one in
// progress partly), in depth. The layers already finished are kept composed, and the one being laid keeps its finished
// marks on a raster of its own, so a frame costs one layer's softening, its shadow and the bloom, not the whole picture.
// `pause` is awaited now and then, so a large picture never holds everything else up. Its buffers are made once and
// reused frame after frame (a picture's worth each: the finished layers, the frame, the layer in progress, scratch), so
// a long roll asks no more memory than its first frame; the whole picture (q at the last mark) is composed straight
// onto the finished layers, with no frame buffer at all
export function layeredStepper(p, W, H, { theme = 'dark' } = {}) {
  const light = theme === 'light', floor = layeredFloor(W, H), short = Math.min(W, H)
  const layers = layersOf(p), L = layers.length
  const starts = []
  let s = 0
  for (const l of layers) { starts.push(s); s += l.marks.length }
  const depthOf = (li) => (L > 1 ? 1 - li / (L - 1) : 0)
  const N4 = W * H * 4
  const acc = new Float32Array(N4) // the layers finished
  const work = new Float32Array(N4) // the layer in progress, softened; then the bloom's light
  const tmp = new Float32Array(N4) // every blur's scratch, and the shadow's cover
  let out = null // the frame (made at the first frame short of the whole)
  let shot = null // a raster for a mark part laid (made the first time one is)
  let whole = null // the whole picture, once composed
  let done = 0
  const cur = createRaster(W, H)
  let laid = 0 // the marks of layer `done` already on `cur`
  const lay = async (upTo, pause) => {
    if (upTo > laid) { await cur.drawAsync(paintingScene({ ...p, marks: layers[done].marks.slice(laid, upTo) }, W, H, { reveal: 1, theme }), theme, { floor, keep: true }, pause); laid = upTo }
  }
  const soften = async (px, li, pause) => { const d = depthOf(li); if (d > 0) await drainAsync(blurring(px, W, H, short * 0.006 * d, 4, tmp), pause) }
  return {
    async frame(q, pause = async () => {}) {
      const n = p.marks.length
      q = Math.max(0, Math.min(n, q))
      if (whole) return whole
      let li = 0
      while (li + 1 < L && Math.floor(q) >= starts[li + 1]) li++
      while (done < li) { // the layers passed since the last frame, finished and composed for good
        await lay(layers[done].marks.length, pause)
        await pause()
        await soften(cur.px, done, pause)
        await drainAsync(addLayer(acc, cur.px, W, H, done, { light, short, tmp }), pause)
        cur.px.fill(0); laid = 0; done++
      }
      const upTo = Math.min(layers[li].marks.length, Math.floor(q) - starts[li])
      await lay(upTo, pause)
      const part = q - Math.floor(q)
      let layer = work
      if (part > 0.001 && upTo < layers[li].marks.length) {
        shot = shot || createRaster(W, H)
        shot.px.set(cur.px)
        await shot.drawAsync(paintingScene({ ...p, marks: [layers[li].marks[upTo]] }, W, H, { reveal: part, theme }), theme, { floor, keep: true }, pause)
        layer = shot.px
      } else work.set(cur.px)
      await pause()
      await soften(layer, li, pause)
      const last = q >= n
      if (!last) { out = out || new Float32Array(N4); out.set(acc) }
      const into = last ? acc : out
      await drainAsync(addLayer(into, layer, W, H, li, { light, short, tmp }), pause)
      if (!light) await drainAsync(bloomOver(into, W, H, short, work, tmp), pause)
      if (last) whole = acc
      return into
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

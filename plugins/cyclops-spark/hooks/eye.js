// The Cyclops eye, for the welcome above the prompt: the launch banner's eye (extras/launch-banner/make_banner.py),
// drawn here as a picture of its own rather than copied cell by cell, so it is sharp at whatever size the band has room
// for. The geometry is the banner's, on its 64 x 30 grid: an almond of lids glowing blue, the white of the eye shaded
// toward the corners, an iris from amber to red with streaks and a dark ring, the pupil, two glints, and a starfield
// with four twinkling crosses. Anything not part of the eye or a star is left empty, so the terminal's own background
// shows through. Each pixel is the average of 3 x 3 samples, so the edges are smooth.

import { drain } from './steps.js'

const GW = 64, GH = 30
const CX = GW / 2, CY = GH / 2, EW = 26, EH = 11
const lid = (x) => { const t = (x - CX) / EW; return Math.abs(t) < 1 ? EH * (1 - t * t) : -1 }

// the stars: a small seeded generator, so the sky is the same every time. Each is laid on whole pixels of the picture
// (one, or a cross of five for the four twinkles), at full light, so a small eye keeps a crisp sky rather than grey dust
function sky(light) {
  let s = 7
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const dots = [], crosses = []
  for (let i = 0; i < 55; i++) {
    const x = Math.floor(rnd() * GW), y = Math.floor(rnd() * GH), b = [90, 130, 180, 240][Math.floor(rnd() * 4)]
    dots.push([x + 0.5, y + 0.5, light ? [b * 0.45, b * 0.45, Math.min(255, b + 30) * 0.55] : [b, b, Math.min(255, b + 30)]])
  }
  for (const [x, y] of [[5, 4], [57, 6], [10, 25], [54, 24]]) crosses.push([x + 0.5, y + 0.5, light ? [70, 80, 140] : [255, 255, 255], light ? [120, 130, 180] : [150, 160, 210]])
  return { dots, crosses }
}
const GLINTS = new Set([[29, 12], [30, 12], [29, 13], [34, 16]].map(([x, y]) => y * GW + x))

// the colour of the eye at a point of the grid (continuous), or null where it is not the eye
function at(X, Y) {
  const l = lid(X), d = Math.abs(Y - CY)
  const cell = Math.floor(Y) * GW + Math.floor(X)
  if (l >= 0) {
    if (d < l - 1.2) {
      if (GLINTS.has(cell)) return [255, 255, 255]
      const r = Math.hypot(X - CX, Y - CY)
      if (r < 3.2) return [5, 5, 12] // the pupil
      if (r < 9.5) { // the iris: amber to red, with streaks
        const t = (r - 3.2) / 6.3
        let c = [255, 200 - 150 * t, 40 - 30 * t]
        const deg = Math.trunc((Math.atan2(Y - CY, X - CX) * 180) / Math.PI)
        if (((deg % 30) + 30) % 30 < 6) c = [255, Math.min(255, c[1] + 40), 60]
        return c
      }
      if (r < 10.4) return [90, 20, 10] // the iris's ring
      const s = 1 - (0.35 * Math.abs(X - CX)) / EW // the white, shaded toward the corners
      return [235 * s, 232 * s, 225 * s]
    }
    if (d < l + 0.6) return [70, 190, 255] // the lids, glowing
    if (d < l + 1.6 && l > 2) return [25, 60, 110] // their soft glow
  }
  return null
}

// A raster of the eye, W x H pixels (the shape of the banner: about 2.13 wide to 1 tall), premultiplied as
// render-raster's are, for toQuadrants or toHalfBlocks
export function eyeRaster(W, H, o = {}) { return drain(eyeRastering(W, H, o)) }
// the same, a row at a time (for a large eye: the roll's title card)
export function* eyeRastering(W, H, { light = false } = {}) {
  const px = new Float32Array(W * H * 4)
  const { dots, crosses } = sky(light)
  const S = 3
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const c = at(((x + (i + 0.5) / S) / W) * GW, ((y + (j + 0.5) / S) / H) * GH)
      if (c) { r += c[0] / 255; g += c[1] / 255; b += c[2] / 255; a += 1 }
    }
    const k = (y * W + x) * 4, n = S * S
    px[k] = r / n; px[k + 1] = g / n; px[k + 2] = b / n; px[k + 3] = a / n
    if (x === W - 1) yield
  }
  // the sky, only where the eye is not
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const k = (y * W + x) * 4
    if (px[k + 3] > 0.05) return
    px[k] = c[0] / 255; px[k + 1] = c[1] / 255; px[k + 2] = c[2] / 255; px[k + 3] = 1
  }
  const P = (gx, gy) => [Math.floor((gx / GW) * W), Math.floor((gy / GH) * H)]
  for (const [gx, gy, c] of dots) { const [x, y] = P(gx, gy); put(x, y, c) }
  for (const [gx, gy, c, arm] of crosses) { const [x, y] = P(gx, gy); put(x, y, c); put(x - 1, y, arm); put(x + 1, y, arm); put(x, y - 1, arm); put(x, y + 1, arm) }
  return { W, H, px }
}

// how many columns the eye takes at a number of rows, keeping its shape (a cell is twice as tall as wide)
export const eyeColumns = (rows) => Math.round((rows * 2 * GW) / GH)

export const DEFAULT: number
export type Raster = { W: number; H: number; px: Float32Array; draw(scene: any[], theme: string, o?: { over?: boolean; floor?: number; res?: number; keep?: boolean }): Float32Array; drawAsync(scene: any[], theme: string, o: { over?: boolean; floor?: number; res?: number; keep?: boolean } | undefined, pause: () => Promise<unknown>, every?: number): Promise<Float32Array> }
export function createRaster(W: number, H: number, opts?: { fill?: boolean }): Raster
export type Pixels = Pick<Raster, "W" | "H" | "px">
export function toHalfBlocks(r: Pixels, ground: number[]): Uint32Array
export function toQuadrants(r: Pixels, ground: number[]): Uint32Array
export function toQuadrantsClassic(r: Pixels, ground: number[]): Uint32Array
export const SPILL: number
export function spill(r: number, g: number, b: number, out: number[]): number[]
export function toRGBA8(r: Raster): Uint8Array
export function toRGB8(r: Raster, ground: number[]): Uint8Array
export function base64(bytes: Uint8Array): string
export function posterize(rgb: Uint8Array, levels: number): Uint8Array
export function base64Async(bytes: Uint8Array, pause: () => Promise<unknown>, slice?: number): Promise<string>
export function toRGB8Async(r: Raster, ground: number[], pause: () => Promise<unknown>, rows?: number): Promise<Uint8Array>
export function cellsToRGB(words: Uint32Array, cols: number, rows: number, cw: number, ch: number, ground: number[], levels?: number): Uint8Array

export const DEFAULT: number
export type Raster = { W: number; H: number; px: Float32Array; draw(scene: any[], theme: string, o?: { over?: boolean; floor?: number; res?: number; keep?: boolean }): Float32Array; drawAsync(scene: any[], theme: string, o: { over?: boolean; floor?: number; res?: number; keep?: boolean } | undefined, pause: () => Promise<unknown>, every?: number): Promise<Float32Array> }
export function createRaster(W: number, H: number, opts?: { fill?: boolean }): Raster
export type Pixels = Pick<Raster, "W" | "H" | "px">
export function toHalfBlocks(r: Pixels, ground: number[]): Uint32Array
export function toQuadrants(r: Pixels, ground: number[]): Uint32Array
export function toRGBA8(r: Raster): Uint8Array
export function toRGB8(r: Raster, ground: number[]): Uint8Array
export function base64(bytes: Uint8Array): string
export function base64Async(bytes: Uint8Array, pause: () => Promise<unknown>, slice?: number): Promise<string>
export function toRGB8Async(r: Raster, ground: number[], pause: () => Promise<unknown>, rows?: number): Promise<Uint8Array>

export const DEFAULT: number
export type Raster = { W: number; H: number; px: Float32Array; draw(scene: any[], theme: string): Float32Array }
export function createRaster(W: number, H: number, opts?: { fill?: boolean }): Raster
export function toHalfBlocks(r: Raster, ground: number[]): Uint32Array
export function toRGBA8(r: Raster): Uint8Array
export function base64(bytes: Uint8Array): string

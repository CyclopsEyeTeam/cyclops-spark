export const LAYERS: number
export function layersOf<P extends { marks: unknown[] }>(p: P, k?: number): P[]
export function layeredFloor(W: number, H: number): number
export function blur(px: Float32Array, W: number, H: number, radius: number): Float32Array
export function layeredStepper(p: any, W: number, H: number, o?: { theme?: string }): { frame(q: number, pause?: () => Promise<unknown>): Promise<Float32Array> }
export function layeredRaster(p: any, W: number, H: number, o?: { theme?: string; pause?: () => Promise<unknown> }): Promise<{ W: number; H: number; px: Float32Array }>
export function layeredScenes(p: any, W: number, H: number, o?: { theme?: string }): Array<[any[], number]>

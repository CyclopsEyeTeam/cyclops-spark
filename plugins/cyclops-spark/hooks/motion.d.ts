export type Motion = 'sway' | 'wave' | 'orbit' | 'blink' | 'gather' | 'pulse'
export const WIDTH: number
export function motion(kind: Motion, t: number): string
export function motionFor(f: { mode?: string; lanes?: Array<{ inflight: number; family: string }> }): Motion

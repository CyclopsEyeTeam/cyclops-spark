export function buildTrace(): Array<Record<string, unknown> & { t: number; type: string }>
export const MOMENTS: Array<[number, string]>
export const TRACE_END: number
export const LAPSE_SECONDS: number
export const REPLAY_LENGTH: number
export function replayAt(elapsed: number): { t: number; lapse: boolean; loop: number }
export const CODA_START: number
export const CODA_SECONDS: number

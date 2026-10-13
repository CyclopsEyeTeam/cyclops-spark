export type TurnFacts = { tools: Record<string, number>; errors: number; denied: number; mends: number; interrupted: number; thinkChars: number; textChars: number; steps: number; effort: string | number | null; agentStreams: number }
export type Painting = { title: string; marks: Array<Record<string, any>> }
export const PAINT_KINDS: string[]
export const MAX_MARKS: number
export const GIST_CHARS: number
export function newTurnFacts(): TurnFacts
export function recordTool(facts: TurnFacts | null, family: string): void
export function painterFacts(facts: TurnFacts | null, end: { reason: string; durationMs: number; mood: string; turn: number }): Record<string, unknown>
export function painterRequest(o: { facts: Record<string, unknown>; palette?: string; theme?: string; gist?: string; shape?: string; size?: [number, number] | null }): { system: string; prompt: string }
export const SHAPES: Record<string, number>
export function shapeFor(widthPx: number, heightPx: number): string
export function parsePainting(text: string, palette?: string): Painting | null
export function paintingScene(p: Painting | null, W: number, H: number, o?: { reveal?: number; theme?: string }): any[]

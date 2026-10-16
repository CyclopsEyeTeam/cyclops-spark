export function drain<T>(g: Generator<unknown, T, unknown>): T
export function drainAsync<T>(g: Generator<unknown, T, unknown>, pause: () => Promise<unknown>, every?: number): Promise<T>

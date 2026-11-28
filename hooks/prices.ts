import type { Tier } from '../types'

// Precios de la API de Anthropic en dólares por millón de tokens (noviembre de 2026).
// Es el único sitio con precios: cuando cambien, se actualiza aquí y nada más.
// Escribir en caché cuesta ≈ 1,25 × la entrada.

export type Price = { input: number; output: number; cacheRead: number }

export const PRICES: Record<Tier, Price> = {
  haiku: { input: 0.1, output: 0.5, cacheRead: 0.01 },
  sonnet: { input: 2, output: 10, cacheRead: 0.1 },
  opus: { input: 4, output: 20, cacheRead: 0.2 },
  fable: { input: 8, output: 40, cacheRead: 0.2 },
}

/** Haiku cobra 5 × más cuando la petición pasa de 100K tokens de entrada. */
const HAIKU_LONG = 100_000
const CACHE_WRITE = 1.25

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** Coste en dólares de una petición con el uso dado, si la hubiera hecho `tier`. */
export function costUsd(tier: Tier, u: Usage): number {
  const read = u.cache_read_input_tokens ?? 0
  const write = u.cache_creation_input_tokens ?? 0
  const total = u.input_tokens + read + write
  const k = tier === 'haiku' && total > HAIKU_LONG ? 5 : 1
  const p = PRICES[tier]
  return (
    (k * (u.input_tokens * p.input + write * p.input * CACHE_WRITE + read * p.cacheRead + u.output_tokens * p.output)) /
    1e6
  )
}

/** Escribir en caché `n` tokens de contexto con el modelo nuevo (lo que cuesta cambiar a mitad). */
export function cacheWriteUsd(tier: Tier, n: number): number {
  return costUsd(tier, { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: n })
}

export type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Mode = 'auto' | 'sugerir' | 'off'

export type Route = {
  model: Tier
  effort: Effort
  reason: string
  /** Fijado a mano (/modelo o botón Cambiar): el clasificador ya no lo cambia. */
  isPinned: boolean
}

/** Lo que se guarda por conversación en $.store, bajo `conv:<session id>`. */
export type Saved = { mode: Mode; route: Route | null }

declare module 'claude-code' {
  interface PluginState {
    'model-router': {
      route: Route | null
      /** Sugerencia pendiente de confirmar (cambiar ahora reprocesaría el contexto). */
      pending: Route | null
      mode: Mode
      isHidden: boolean
      /** Tokens de contexto de la última petición del hilo principal. */
      ctx: number
      /** Modelo que respondió la última petición del hilo principal. */
      lastModel: string | null
    }
  }
}

export type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Mode = 'auto' | 'sugerir' | 'off'
export type Lang = 'es' | 'en' | 'de' | 'fr'
/** Paleta del menú: claro, crema clara, verde salvia, crema oscura, oscuro, azul noche. */
export type Palette = 'light' | 'dark' | 'cream' | 'creamDark' | 'sage' | 'night'

export type Route = {
  model: Tier
  effort: Effort
  reason: string
  /** Fijado a mano (desplegable, /modelo o «Cambiar»): el clasificador ya no lo cambia. */
  isPinned: boolean
}

/** Lo que se guarda por conversación en $.store, bajo `conv:<session id>`. */
export type Saved = {
  mode: Mode
  route: Route | null
  /** Esfuerzo elegido sin fijar modelo: se aplica al modelo de la app. Ausente en datos de antes de la 0.7.1. */
  effort?: Effort | null
}

/** Si la cuenta puede usar un modelo, comprobado con una petición mínima, y cuándo. */
export type Availability = Partial<Record<Tier, { isOk: boolean; at: number }>>

declare module 'claude-code' {
  interface PluginState {
    'model-router': {
      route: Route | null
      /** Sugerencia pendiente de confirmar (cambiar ahora reprocesaría el contexto). */
      pending: Route | null
      mode: Mode
      /** Esfuerzo elegido sin fijar modelo (se aplica al modelo de la app). */
      effort: Effort | null
      lang: Lang
      isHidden: boolean
      /** Menú de opciones abierto encima del cuadro de texto. */
      isMenuOpen: boolean
      /** Paleta elegida en el selector de paleta; null = la de la app. Global, como el idioma. */
      palette: Palette | null
      /** Tokens de contexto de la última petición del hilo principal. */
      ctx: number
      /** Modelo que respondió la última petición del hilo principal. */
      lastModel: string | null
    }
  }
}

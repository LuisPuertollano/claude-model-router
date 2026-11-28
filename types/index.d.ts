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
  /** Propuesta hecha en el primer mensaje, cuando cambiar aún no costaba nada. */
  isFirst?: boolean
}

/** Lo que se guarda por conversación en $.store, bajo `conv:<session id>`. */
export type Saved = {
  mode: Mode
  route: Route | null
  /** Esfuerzo elegido sin fijar modelo: se aplica al modelo de la app. Ausente en datos de antes de la 0.7.1. */
  effort?: Effort | null
  /** Gasto del hilo principal en esta conversación. Ausente en datos de antes de la 1.0. */
  spend?: Spend
}

/** Lo gastado en una conversación y lo que habría costado lo mismo siempre con Opus, en dólares. */
export type Spend = { usd: number; opusUsd: number }

/** Una decisión tuya que corrige al enrutador: se guarda en $.store (`decisions`) y se da como ejemplo al clasificador. */
export type Decision = {
  /** Comienzo del mensaje que se clasificó. */
  text: string
  proposed: Tier
  proposedEffort: Effort
  chosen: Tier
  chosenEffort: Effort
  at: number
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
      /** Último mensaje clasificado, para recordar tu decisión si corriges al enrutador. */
      lastPrompt: string | null
      /** Gasto de esta conversación frente a usar siempre Opus. */
      spend: Spend
      /** Cuántas decisiones tuyas tiene en cuenta el clasificador. */
      learned: number
    }
  }
}

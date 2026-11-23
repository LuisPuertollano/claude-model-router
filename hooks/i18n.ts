import type { Lang, Mode, Palette } from '../types'

export const LANGS: readonly Lang[] = ['es', 'en', 'de', 'fr']

/** Nombre del idioma, para pedir al clasificador el motivo en ese idioma. */
export const LANG_NAME: Record<Lang, string> = {
  es: 'Spanish',
  en: 'English',
  de: 'German',
  fr: 'French',
}

export type Strings = {
  modelLabel: string
  palette: Record<Palette, string>
  paletteOff: string
  router: string
  title: string
  modeRow: string
  pinRow: string
  effortRow: string
  langLabel: string
  mode: Record<Mode, string>
  pin: (model: string) => string
  toast: Record<Mode, string>
  toastPin: (model: string, effort: string, cost: string) => string
  toastLang: string
  toastEffort: (effort: string) => string
  unavailable: (wanted: string, used: string) => string
  offWarn: string
  subagent: (task: string, model: string) => string
  suggested: string
  switchCost: (tokens: string, usd: string) => string
  apply: string
  keep: string
  cmdMode: (mode: Mode) => string
  cmdFreed: string
  cmdPinned: (model: string, effort: string, cost: string) => string
  cmdLang: string
  appModel: string
  status: (mode: Mode, now: string) => string
}

const es: Strings = {
  modelLabel: 'Modelo',
  palette: { light: 'Claro', dark: 'Oscuro', cream: 'Crema clara', creamDark: 'Crema oscura', sage: 'Verde salvia', night: 'Azul noche' },
  paletteOff: 'Colores de la app',
  router: 'Enrutador',
  title: 'Enrutador de modelo · solo esta conversación',
  modeRow: 'Modo',
  pinRow: 'Fijar',
  effortRow: 'Esfuerzo',
  langLabel: 'Idioma',
  mode: { off: "Modelo de la app", sugerir: 'Sugerir', auto: 'Auto' },
  pin: m => `Fijar ${m}`,
  toast: {
    off: 'Enrutador apagado en esta conversación: manda el modelo de la app.',
    sugerir: 'Sugerir, en esta conversación: nada cambia sin tu «Cambiar».',
    auto: 'Auto en esta conversación: elige en el primer mensaje; luego solo sugiere.',
  },
  toastPin: (m, e, c) => `Esta conversación queda en ${m} · ${e}${c ? ` (${c})` : ''}.`,
  toastLang: 'Idioma: español',
  toastEffort: e => `Esfuerzo ${e}, con el modelo que elija la app.`,
  unavailable: (w, u) => `${w} no está disponible en tu cuenta: uso ${u}.`,
  offWarn: 'Ojo: al apagar vuelve el modelo de la app y se reprocesa el contexto.',
  subagent: (d, m) => `Subagente «${d}» → ${m}`,
  suggested: 'Sugerido',
  switchCost: (k, usd) => `cambiar reprocesa ~${k} tokens de contexto (≈$${usd})`,
  apply: 'Cambiar',
  keep: 'Seguir igual',
  cmdMode: m =>
    ({
      auto: 'model-router en modo auto en esta conversación: elige en el primer mensaje; después solo sugiere.',
      sugerir: 'model-router en modo sugerir en esta conversación: nada cambia sin «Cambiar».',
      off: 'model-router apagado en esta conversación: manda el modelo de la app.',
    })[m],
  cmdFreed: 'model-router: modelo liberado en esta conversación; vuelve a mandar el de la app.',
  cmdPinned: (m, e, c) => `model-router: esta conversación queda en ${m} · ${e}${c ? ` (${c})` : ''}. /modelo libre para soltarlo.`,
  cmdLang: 'model-router: idioma cambiado a español.',
  appModel: 'el de la app',
  status: (mode, now) =>
    `model-router · esta conversación · modo ${mode} · modelo: ${now}\n` +
    '/modelo auto | sugerir | off   — modo (solo aquí)\n' +
    '/modelo opus high              — fija modelo y esfuerzo aquí\n' +
    '/modelo libre                  — vuelve al modelo de la app\n' +
    '/modelo idioma es|en|de|fr     — idioma de la mod',
}

const en: Strings = {
  modelLabel: 'Model',
  palette: { light: 'Light', dark: 'Dark', cream: 'Light cream', creamDark: 'Dark cream', sage: 'Sage green', night: 'Night blue' },
  paletteOff: 'App colours',
  router: 'Router',
  title: 'Model router · this conversation only',
  modeRow: 'Mode',
  pinRow: 'Pin',
  effortRow: 'Effort',
  langLabel: 'Language',
  mode: { off: "App's model", sugerir: 'Suggest', auto: 'Auto' },
  pin: m => `Pin ${m}`,
  toast: {
    off: "Router off in this conversation: the app's model is used.",
    sugerir: 'Suggest, in this conversation: nothing changes until you press “Switch”.',
    auto: 'Auto in this conversation: picks on the first message, then only suggests.',
  },
  toastPin: (m, e, c) => `This conversation now runs on ${m} · ${e}${c ? ` (${c})` : ''}.`,
  toastLang: 'Language: English',
  toastEffort: e => `Effort ${e}, with whichever model the app picks.`,
  unavailable: (w, u) => `${w} is not available on your account: using ${u}.`,
  offWarn: "Heads up: turning it off brings back the app's model and re-processes the context.",
  subagent: (d, m) => `Subagent “${d}” → ${m}`,
  suggested: 'Suggested',
  switchCost: (k, usd) => `switching re-processes ~${k} context tokens (≈$${usd})`,
  apply: 'Switch',
  keep: 'Keep',
  cmdMode: m =>
    ({
      auto: 'model-router set to auto in this conversation: picks on the first message, then only suggests.',
      sugerir: 'model-router set to suggest in this conversation: nothing changes until you press “Switch”.',
      off: "model-router off in this conversation: the app's model is used.",
    })[m],
  cmdFreed: "model-router: model released in this conversation; the app's model is used again.",
  cmdPinned: (m, e, c) => `model-router: this conversation now runs on ${m} · ${e}${c ? ` (${c})` : ''}. /modelo libre to release it.`,
  cmdLang: 'model-router: language set to English.',
  appModel: "the app's",
  status: (mode, now) =>
    `model-router · this conversation · mode ${mode} · model: ${now}\n` +
    '/modelo auto | sugerir | off   — mode (here only)\n' +
    '/modelo opus high              — pin model and effort here\n' +
    "/modelo libre                  — back to the app's model\n" +
    '/modelo idioma es|en|de|fr     — language of the mod',
}

const de: Strings = {
  modelLabel: 'Modell',
  palette: { light: 'Hell', dark: 'Dunkel', cream: 'Creme hell', creamDark: 'Creme dunkel', sage: 'Salbeigrün', night: 'Nachtblau' },
  paletteOff: 'Farben der App',
  router: 'Router',
  title: 'Modell-Router · nur diese Unterhaltung',
  modeRow: 'Modus',
  pinRow: 'Fixieren',
  effortRow: 'Aufwand',
  langLabel: 'Sprache',
  mode: { off: "Modell der App", sugerir: 'Vorschlagen', auto: 'Auto' },
  pin: m => `${m} fixieren`,
  toast: {
    off: 'Router in dieser Unterhaltung aus: es gilt das Modell der App.',
    sugerir: 'Vorschlagen, in dieser Unterhaltung: nichts ändert sich ohne „Wechseln“.',
    auto: 'Auto in dieser Unterhaltung: wählt bei der ersten Nachricht, danach nur Vorschläge.',
  },
  toastPin: (m, e, c) => `Diese Unterhaltung läuft jetzt auf ${m} · ${e}${c ? ` (${c})` : ''}.`,
  toastLang: 'Sprache: Deutsch',
  toastEffort: e => `Aufwand ${e}, mit dem Modell, das die App wählt.`,
  unavailable: (w, u) => `${w} ist für dein Konto nicht verfügbar: ich nehme ${u}.`,
  offWarn: 'Achtung: Ausschalten bringt das Modell der App zurück und verarbeitet den Kontext neu.',
  subagent: (d, m) => `Subagent „${d}“ → ${m}`,
  suggested: 'Vorschlag',
  switchCost: (k, usd) => `Wechsel verarbeitet ~${k} Kontext-Tokens neu (≈$${usd})`,
  apply: 'Wechseln',
  keep: 'Beibehalten',
  cmdMode: m =>
    ({
      auto: 'model-router in dieser Unterhaltung auf Auto: wählt bei der ersten Nachricht, danach nur Vorschläge.',
      sugerir: 'model-router in dieser Unterhaltung auf Vorschlagen: nichts ändert sich ohne „Wechseln“.',
      off: 'model-router in dieser Unterhaltung aus: es gilt das Modell der App.',
    })[m],
  cmdFreed: 'model-router: Modell in dieser Unterhaltung freigegeben; es gilt wieder das der App.',
  cmdPinned: (m, e, c) => `model-router: diese Unterhaltung läuft jetzt auf ${m} · ${e}${c ? ` (${c})` : ''}. /modelo libre zum Freigeben.`,
  cmdLang: 'model-router: Sprache auf Deutsch gestellt.',
  appModel: 'das der App',
  status: (mode, now) =>
    `model-router · diese Unterhaltung · Modus ${mode} · Modell: ${now}\n` +
    '/modelo auto | sugerir | off   — Modus (nur hier)\n' +
    '/modelo opus high              — Modell und Aufwand hier fixieren\n' +
    '/modelo libre                  — zurück zum Modell der App\n' +
    '/modelo idioma es|en|de|fr     — Sprache der Mod',
}

const fr: Strings = {
  modelLabel: 'Modèle',
  palette: { light: 'Clair', dark: 'Sombre', cream: 'Crème clair', creamDark: 'Crème foncé', sage: 'Vert sauge', night: 'Bleu nuit' },
  paletteOff: 'Couleurs de l’app',
  router: 'Routeur',
  title: 'Routeur de modèle · cette conversation',
  modeRow: 'Mode',
  pinRow: 'Fixer',
  effortRow: 'Effort',
  langLabel: 'Langue',
  mode: { off: "Modèle de l’app", sugerir: 'Suggérer', auto: 'Auto' },
  pin: m => `Fixer ${m}`,
  toast: {
    off: "Routeur désactivé dans cette conversation : le modèle de l'app est utilisé.",
    sugerir: 'Suggérer, dans cette conversation : rien ne change sans « Changer ».',
    auto: 'Auto dans cette conversation : choisit au premier message, puis suggère seulement.',
  },
  toastPin: (m, e, c) => `Cette conversation passe sur ${m} · ${e}${c ? ` (${c})` : ''}.`,
  toastLang: 'Langue : français',
  toastEffort: e => `Effort ${e}, avec le modèle choisi par l’app.`,
  unavailable: (w, u) => `${w} n’est pas disponible pour ton compte : j’utilise ${u}.`,
  offWarn: "Attention : désactiver rétablit le modèle de l'app et retraite le contexte.",
  subagent: (d, m) => `Sous-agent « ${d} » → ${m}`,
  suggested: 'Suggéré',
  switchCost: (k, usd) => `changer retraite ~${k} tokens de contexte (≈$${usd})`,
  apply: 'Changer',
  keep: 'Garder',
  cmdMode: m =>
    ({
      auto: 'model-router en auto dans cette conversation : choisit au premier message, puis suggère seulement.',
      sugerir: 'model-router en suggestion dans cette conversation : rien ne change sans « Changer ».',
      off: "model-router désactivé dans cette conversation : le modèle de l'app est utilisé.",
    })[m],
  cmdFreed: "model-router : modèle libéré dans cette conversation ; celui de l'app reprend.",
  cmdPinned: (m, e, c) => `model-router : cette conversation passe sur ${m} · ${e}${c ? ` (${c})` : ''}. /modelo libre pour libérer.`,
  cmdLang: 'model-router : langue réglée sur le français.',
  appModel: "celui de l'app",
  status: (mode, now) =>
    `model-router · cette conversation · mode ${mode} · modèle : ${now}\n` +
    '/modelo auto | sugerir | off   — mode (ici seulement)\n' +
    '/modelo opus high              — fixer modèle et effort ici\n' +
    "/modelo libre                  — revenir au modèle de l'app\n" +
    '/modelo idioma es|en|de|fr     — langue du mod',
}

export const STRINGS: Record<Lang, Strings> = { es, en, de, fr }

/** Traduce el ajuste `language` de Claude Code («spanish», «Deutsch», «fr»…) a un idioma de la mod. */
export const langFromSetting = (v: unknown): Lang | null => {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (/^(es|spa|spanish|español|espanol|castellano)/.test(s)) return 'es'
  if (/^(de|ger|german|deutsch)/.test(s)) return 'de'
  if (/^(fr|fre|french|français|francais)/.test(s)) return 'fr'
  if (/^(en|eng|english|inglés|ingles)/.test(s)) return 'en'
  return null
}

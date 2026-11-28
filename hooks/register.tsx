import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Availability, Decision, Effort, Lang, Mode, Palette, Route, Saved, Spend, Tier } from '../types'
import { LANGS, LANG_NAME, STRINGS, langFromSetting } from './i18n'
import { DOT, MENU, PALETTES, SWATCH } from './palettes'
import { cacheWriteUsd, costUsd } from './prices'

// Enrutador de modelo y esfuerzo para Claude Code, según "Which Claude model should
// you build with?" (Anthropic, nov 2026). Todo es POR CONVERSACIÓN: cada una guarda
// su modo y su modelo, y una conversación nueva empieza apagada. El idioma de la
// interfaz es una preferencia global.
//
// Regla de coste: cambiar de modelo (o de esfuerzo) a mitad de conversación obliga
// a reprocesar todo el contexto sin caché. Por eso el cambio automático solo ocurre
// en el PRIMER mensaje; después solo se sugiere, con los tokens que costaría, y se
// aplica únicamente si la persona lo pide.

const routeAtom = atom({ plugin: 'model-router', key: 'route' } as const, null)
const pendingAtom = atom({ plugin: 'model-router', key: 'pending' } as const, null)
const modeAtom = atom({ plugin: 'model-router', key: 'mode' } as const, 'off')
const effortAtom = atom({ plugin: 'model-router', key: 'effort' } as const, null)
const langAtom = atom({ plugin: 'model-router', key: 'lang' } as const, 'en')
const hiddenAtom = atom({ plugin: 'model-router', key: 'isHidden' } as const, false)
const menuAtom = atom({ plugin: 'model-router', key: 'isMenuOpen' } as const, false)
const paletteAtom = atom({ plugin: 'model-router', key: 'palette' } as const, null)
const ctxAtom = atom({ plugin: 'model-router', key: 'ctx' } as const, 0)
const lastModelAtom = atom({ plugin: 'model-router', key: 'lastModel' } as const, null)
const lastPromptAtom = atom({ plugin: 'model-router', key: 'lastPrompt' } as const, null)
const spendAtom = atom({ plugin: 'model-router', key: 'spend' } as const, { usd: 0, opusUsd: 0 })
const learnedAtom = atom({ plugin: 'model-router', key: 'learned' } as const, 0)

const TIERS: readonly Tier[] = ['haiku', 'sonnet', 'opus', 'fable']
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const RANK: Record<Tier, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }
const LABEL: Record<Tier, string> = {
  haiku: 'Haiku 5.5',
  sonnet: 'Sonnet 5.5',
  opus: 'Opus 5.5',
  fable: 'Fable 5.2',
}
const SHORT: Record<Tier, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', fable: 'Fable' }
const MODES: readonly Mode[] = ['off', 'sugerir', 'auto']
const HUMAN_ORIGINS = new Set(['composer', 'bridge', 'sdk', 'unclassified'])
// Subagentes de uso general: el resto trae su propio modelo en su definición.
const GENERIC_AGENTS = new Set(['general-purpose', 'Explore', 'Plan', 'claude'])

const RULES = `You are a router. You decide which Claude model and which effort level should handle the user's message, following Anthropic's model-selection guide.

Models, cheapest first:
- haiku: simple, repetitive and easy to check: classify, tag, extract data, summarize a given text, find a file, a quick factual question. Weak when judgment is needed.
- sonnet: a scoped task whose finished result fits in one sentence: fill a template, a routine email, a fixed-format report, fix a specific bug, a function from a spec, everyday documents, sheets or slides, fast interactive chat, running a fixed-workflow skill.
- opus: the default and the answer when unsure. Complex coding and knowledge work: debugging, multi-part features, research, analysis, writing that needs judgment, checking figures against sources, driving the browser or computer, complex financial models.
- fable: only ambitious, open-ended work with no set path where mistakes are costly: major refactors or migrations, system architecture, deep market research, hard quantitative or scientific analysis, orchestrating many subagents for hours. Twice the price of opus and no better at everyday coding.

Effort: stop at the first "yes".
1. Will there be back-and-forth with the user, or is it a simple task? -> low
2. Would a hidden mistake cost money, a client or a bad decision (contracts, finance, taxes, investments, real data)? -> high
3. Is it a long, hard, critical job left to run on its own? -> xhigh
4. Otherwise -> medium
Never use max.

If the message is a short continuation of what came before ("yes", "do it", "go on", "ok", a small correction, in any language), answer {"same":true}.

Answer ONLY with one line of JSON:
{"model":"haiku|sonnet|opus|fable","effort":"low|medium|high|xhigh","reason":"reason in LANGUAGE, at most 10 words"}`

const SUB_RULES = `You choose the model for a Claude subagent. Answer with ONE word: haiku, sonnet or opus.
- haiku: only reads and reports: find files or code, read logs or test output, summarize documents, gather data from the web. Mistakes are easy to spot.
- sonnet: scoped work with clear instructions: apply well-specified changes, review a diff against given criteria, draft from a template, research one concrete question.
- opus: needs its own judgment or several chained decisions: design, debug something with no known cause, broad code changes, analysis whose conclusions matter.`

type Classified = { same: true } | { model: Tier; effort: Effort; reason: string }

const parse = (text: string): Classified | null => {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>
    if (j.same === true) return { same: true }
    const model = j.model as Tier
    const effort = j.effort as Effort
    if (!TIERS.includes(model) || !EFFORTS.includes(effort)) return null
    const reason = typeof j.reason === 'string' ? j.reason.slice(0, 90) : ''
    return { model, effort: effort === 'max' ? 'xhigh' : effort, reason }
  } catch {
    return null
  }
}

const tierOf = (id: string | null): Tier | null =>
  (id?.toLowerCase().match(/haiku|sonnet|opus|fable/)?.[0] as Tier | undefined) ?? null

const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`)
const fmtUsd = (n: number) => (n < 0.1 ? n.toFixed(3) : n.toFixed(2))

const isSaved = (v: unknown): v is Saved =>
  typeof v === 'object' && v !== null && MODES.includes((v as Saved).mode)

const isSpend = (v: unknown): v is Spend =>
  typeof v === 'object' && v !== null && typeof (v as Spend).usd === 'number' && typeof (v as Spend).opusUsd === 'number'

async function keyOf($: EngineInterface) {
  return `conv:${await $.session.id()}`
}

async function save($: EngineInterface) {
  const s: Saved = {
    mode: await read($, modeAtom),
    route: await read($, routeAtom),
    effort: await read($, effortAtom),
    spend: await read($, spendAtom),
  }
  await $.store.set(await keyOf($), s)
}

/** Suma un gasto real y lo que habría costado con Opus. */
async function addSpend($: EngineInterface, usd: number, opusUsd: number) {
  await update($, spendAtom, s => ({ usd: s.usd + usd, opusUsd: s.opusUsd + opusUsd }))
}

// --- Aprender de tus decisiones -----------------------------------------------------
// Cuando corriges al enrutador (eliges otro modelo, o «Seguir igual» ante una sugerencia),
// se guarda el comienzo del mensaje y lo que elegiste. Las últimas van como ejemplos al
// clasificador, que las sigue cuando llega algo parecido. Solo se guardan en este equipo.
const MAX_DECISIONS = 20
const EXCERPT = 160

async function decisions($: EngineInterface): Promise<Decision[]> {
  const raw = await $.store.get('decisions')
  return Array.isArray(raw) ? (raw as Decision[]).filter(d => TIERS.includes(d?.chosen) && TIERS.includes(d?.proposed)) : []
}

async function learn($: EngineInterface, proposed: Route, chosen: Tier, chosenEffort: Effort) {
  const text = await read($, lastPromptAtom)
  if (!text) return
  if (proposed.model === chosen && proposed.effort === chosenEffort) return
  const d: Decision = {
    text: text.slice(0, EXCERPT),
    proposed: proposed.model,
    proposedEffort: proposed.effort,
    chosen,
    chosenEffort,
    at: Date.now(),
  }
  const all = [...(await decisions($)).filter(x => x.text !== d.text), d].slice(-MAX_DECISIONS)
  await $.store.set('decisions', all)
  await update($, learnedAtom, () => all.length)
}

async function forget($: EngineInterface) {
  await $.store.set('decisions', [])
  await update($, learnedAtom, () => 0)
}

function examples(list: Decision[]): string {
  if (list.length === 0) return ''
  const lines = list.map(
    d =>
      `- "${d.text.replace(/\s+/g, ' ')}" → router said ${d.proposed} ${d.proposedEffort}; the user chose ${d.chosen} ${d.chosenEffort}`,
  )
  return `\n\nThis user's own corrections to past routing (oldest first). They show this user's goals. When a new message is similar to one of these, prefer what the user chose over the general guide:\n${lines.join('\n')}`
}

/** Lo que el enrutador había decidido o propuesto en esta conversación, si lo hay. */
async function routerChoice($: EngineInterface): Promise<Route | null> {
  const pending = await read($, pendingAtom)
  if (pending) return pending
  const route = await read($, routeAtom)
  return route && !route.isPinned ? route : null
}

async function t($: EngineInterface) {
  return STRINGS[await read($, langAtom)]
}

// ¿La conversación aún no tiene ninguna respuesta? Entonces no hay caché que perder.
async function isFresh($: EngineInterface) {
  return (await $.session.messages()).every(m => m.role !== 'assistant')
}

async function costNote($: EngineInterface, to: Tier) {
  const ctx = await read($, ctxAtom)
  if (ctx === 0 || (await isFresh($))) return ''
  return (await t($)).switchCost(fmtK(ctx), cacheWriteUsd(to, ctx).toFixed(2))
}

async function current($: EngineInterface): Promise<Tier | null> {
  return (await read($, routeAtom))?.model ?? tierOf(await read($, lastModelAtom))
}

// --- Modelos que la cuenta puede usar ---------------------------------------------
// No hay forma de preguntar el plan; se prueba cada modelo con una petición mínima la primera
// vez que hace falta y se recuerda (un acierto 7 días, un fallo 1 día). Haiku se da por bueno:
// el clasificador ya lo usa.
const OK_TTL = 7 * 24 * 3600_000
const FAIL_TTL = 24 * 3600_000
const HARD_ERRORS = new Set(['model_not_found', 'invalid_request', 'authentication_failed', 'billing_error'])

async function isAvailable($: EngineInterface, tier: Tier): Promise<boolean> {
  if (tier === 'haiku') return true
  const raw = await $.store.get('availability')
  const cache: Availability = typeof raw === 'object' && raw !== null ? (raw as Availability) : {}
  const hit = cache[tier]
  const now = Date.now()
  if (hit && now - hit.at < (hit.isOk ? OK_TTL : FAIL_TTL)) return hit.isOk
  let isOk = true
  try {
    const r = await $.model.complete({ model: tier, maxTokens: 1, timeoutMs: 8000, prompt: '.' })
    // Solo un error que no se pasa solo cuenta como «no disponible»; saturación o red, no.
    if (!r.isAnswered && r.reason === 'api-error' && HARD_ERRORS.has(r.error)) isOk = false
  } catch {
    // El motor rechaza el modelo (p. ej. fuera de la lista availableModels de la organización).
    isOk = false
  }
  await $.store.set('availability', { ...cache, [tier]: { isOk, at: now } })
  return isOk
}

/** El modelo pedido si la cuenta lo tiene; si no, el mejor de los de debajo. */
async function usable($: EngineInterface, tier: Tier): Promise<Tier> {
  for (let i = RANK[tier]; i > 0; i--) {
    const cand = TIERS[i] as Tier
    if (await isAvailable($, cand)) return cand
  }
  return 'haiku'
}

/** Si el modelo no está, avisa y devuelve el que se usará en su lugar. */
async function usableWithNotice($: EngineInterface, tier: Tier): Promise<Tier> {
  const got = await usable($, tier)
  if (got !== tier) $.ui.toast((await t($)).unavailable(LABEL[tier], LABEL[got]))
  return got
}

/** Pone la paleta (o vuelve a la de la app con null) y la recuerda para todas las conversaciones. */
async function setPalette($: EngineInterface, p: Palette | null) {
  await update($, paletteAtom, () => p)
  await $.store.set('palette', p)
}

async function setMode($: EngineInterface, m: Mode) {
  const before = await read($, modeAtom)
  const route = await read($, routeAtom)
  await update($, modeAtom, () => m)
  if (m === 'off') await update($, pendingAtom, () => null)
  await save($)
  // Apagar devuelve el modelo de la app: si era otro, eso también reprocesa.
  if (m === 'off' && before !== 'off' && route && !(await isFresh($))) {
    const app = tierOf(await read($, lastModelAtom))
    if (app && app !== route.model) $.ui.toast((await t($)).offWarn)
  }
}

/** Fija modelo y esfuerzo en esta conversación; devuelve la nota de coste, si la hay. */
async function pin($: EngineInterface, wanted: Tier, effort: Effort) {
  const tier = await usableWithNotice($, wanted)
  const note = (await current($)) === tier ? '' : await costNote($, tier)
  // Fijar otro modelo después de que el enrutador eligiera o propusiera uno es una corrección: se aprende.
  const rc = await routerChoice($)
  if (rc && (await read($, modeAtom)) !== 'off') await learn($, rc, tier, effort)
  await update($, effortAtom, () => null)
  await update($, routeAtom, () => ({ model: tier, effort, reason: '', isPinned: true }))
  await update($, pendingAtom, () => null)
  if ((await read($, modeAtom)) === 'off') await update($, modeAtom, () => 'sugerir')
  await save($)
  return { tier, note }
}

/** Cambia solo el esfuerzo. Con un modelo elegido (fijado o del enrutador) lo mantiene; sin ninguno,
 *  no fija nada: el esfuerzo se aplica al modelo que elija la app. */
async function setEffort($: EngineInterface, effort: Effort) {
  const route = await read($, routeAtom)
  const mode = await read($, modeAtom)
  const s = await t($)
  if (route && mode !== 'off') {
    await update($, routeAtom, () => ({ ...route, effort }))
    await save($)
    return route.isPinned ? s.toastPin(LABEL[route.model], effort, '') : s.toastEffort(effort)
  }
  await update($, effortAtom, () => effort)
  await save($)
  return s.toastEffort(effort)
}

async function setLang($: EngineInterface, lang: Lang) {
  await update($, langAtom, () => lang)
  await $.store.set('lang', lang)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(await keyOf($))
    await update($, modeAtom, () => (isSaved(saved) ? saved.mode : 'off'))
    await update($, routeAtom, () => (isSaved(saved) ? saved.route : null))
    await update($, effortAtom, () =>
      isSaved(saved) && saved.effort && EFFORTS.includes(saved.effort) ? saved.effort : null,
    )
    await update($, pendingAtom, () => null)
    await update($, spendAtom, () => (isSaved(saved) && isSpend(saved.spend) ? saved.spend : { usd: 0, opusUsd: 0 }))
    const learnedCount = (await decisions($)).length
    await update($, learnedAtom, () => learnedCount)
    const stored = await $.store.get('lang')
    let lang: Lang = 'en'
    if (LANGS.includes(stored as Lang)) {
      lang = stored as Lang
    } else {
      try {
        lang = langFromSetting(await $.settings.read({ key: 'language' })) ?? 'en'
      } catch {
        // Sin acceso a los ajustes: se queda en inglés hasta que se elija otro.
      }
    }
    await update($, langAtom, () => lang)
    const palette = await $.store.get('palette')
    if (PALETTES.includes(palette as Palette)) await update($, paletteAtom, () => palette as Palette)
    // La 0.6.0 pintaba la paleta en toda la app con $.theme.set. Se deshace una vez.
    if ((await $.store.get('themeUndone')) !== true) {
      await $.store.set('themeUndone', true)
      if (palette) {
        try {
          await $.theme.clear()
        } catch {
          // Sin pantalla que pinte temas (terminal): no había nada que deshacer.
        }
      }
    }
    await $.command.register({
      name: 'modelo',
      description: 'model-router: auto | sugerir | off | opus high | libre | olvidar | idioma es|en|de|fr',
      argumentHint: '[auto|sugerir|off|libre|olvidar|haiku|sonnet|opus|fable] [effort] | idioma <es|en|de|fr>',
    })
    return next(e)
  })

  on('command.run', { command: 'modelo' }, async ($, e) => {
    // Admite lo que la pista sugiere tal cual: «[auto]», «<es>», «auto|sugerir».
    const [first = '', second = ''] = e.args.toLowerCase().replace(/[\[\]<>|,]/g, ' ').trim().split(/\s+/)
    const text = (s: string) => ({ text: s, isTextDisplayOnly: true as const })

    if (['idioma', 'lang', 'language', 'sprache', 'langue'].includes(first)) {
      if (LANGS.includes(second as Lang)) {
        await setLang($, second as Lang)
        return text((await t($)).cmdLang)
      }
    }
    if (MODES.includes(first as Mode)) {
      await setMode($, first as Mode)
      return text((await t($)).cmdMode(first as Mode))
    }
    if (['olvidar', 'forget', 'vergessen', 'oublier'].includes(first)) {
      await forget($)
      return text((await t($)).forgotten)
    }
    if (first === 'libre' || first === 'free') {
      await update($, routeAtom, () => null)
      await update($, pendingAtom, () => null)
      await update($, effortAtom, () => null)
      await save($)
      return text((await t($)).cmdFreed)
    }
    if (EFFORTS.includes(first as Effort)) {
      return text(await setEffort($, first as Effort))
    }
    if (TIERS.includes(first as Tier)) {
      const tier = first as Tier
      const effort: Effort = EFFORTS.includes(second as Effort) ? (second as Effort) : 'medium'
      const r = await pin($, tier, effort)
      return text((await t($)).cmdPinned(LABEL[r.tier], effort, r.note))
    }
    const s = await t($)
    const mode = await read($, modeAtom)
    const route = await read($, routeAtom)
    const effort = await read($, effortAtom)
    const now = route
      ? `${LABEL[route.model]} · ${route.effort}${route.isPinned ? ' (pin)' : ''}`
      : `${s.appModel}${effort ? ` · ${effort}` : ''}`
    return text(s.status(mode, now))
  })

  // --- 1. Clasificar el mensaje (solo si esta conversación tiene el enrutador activo)
  on('prompt.submit', async ($, e, next) => {
    const mode = await read($, modeAtom)
    const route = await read($, routeAtom)
    const isHuman = HUMAN_ORIGINS.has(e.origin.kind)
    if (mode === 'off' || e.command || e.isMeta || !isHuman || route?.isPinned) return next(e)
    if (route && e.text.trim().length < 25) return next(e)

    const r = await $.model.complete({
      model: 'haiku',
      effort: 'low',
      maxTokens: 200,
      timeoutMs: 8000,
      system: RULES.replace('LANGUAGE', LANG_NAME[await read($, langAtom)]) + examples(await decisions($)),
      prompt: `Current route: ${route ? `${route.model} ${route.effort}` : 'none'}\n\nUser message:\n<<<\n${e.text.slice(0, 6000)}\n>>>`,
    })
    // El clasificador también cuesta: cuenta en el gasto (y no en «siempre Opus», que no lo usaría).
    if (r.isAnswered) await addSpend($, costUsd('haiku', r.usage), 0)
    const c = r.isAnswered ? parse(r.text) : null
    if (c && !('same' in c)) await update($, lastPromptAtom, () => e.text)
    if (!c || 'same' in c) return next(e)
    const isFirst = await isFresh($)
    const proposal: Route = { model: await usable($, c.model), effort: c.effort, reason: c.reason, isPinned: false, isFirst }

    if (isFirst) {
      // Primer mensaje: todavía no hay caché, cambiar no cuesta nada extra.
      if (mode === 'auto') {
        await update($, routeAtom, () => proposal)
        await update($, pendingAtom, () => null)
        await save($)
      } else {
        await update($, pendingAtom, () => proposal)
      }
      await update($, hiddenAtom, () => false)
      return next(e)
    }

    // Conversación en marcha: nunca se cambia solo. Solo se sugiere subir de modelo
    // cuando la tarea lo pide; bajar no compensa reprocesar todo el contexto.
    const cur = await current($)
    const needsMore = cur !== null && RANK[c.model] > RANK[cur]
    await update($, pendingAtom, () => (needsMore ? proposal : null))
    if (needsMore) await update($, hiddenAtom, () => false)
    return next(e)
  }).catch(($, e, next) => next(e))

  // --- 2. Aplicar el modelo de ESTA conversación a cada petición del hilo principal
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const route = await read($, routeAtom)
    const mode = await read($, modeAtom)
    const effort = await read($, effortAtom)
    const res = yield* next(
      route && mode !== 'off' ? { ...e, model: route.model, effort: route.effort } : effort ? { ...e, effort } : e,
    )
    if (res.usage) {
      const u = res.usage
      const ctx = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await update($, ctxAtom, () => ctx)
      await update($, lastModelAtom, () => u.model)
      const tier = tierOf(u.model)
      if (tier) {
        await addSpend($, costUsd(tier, u), costUsd('opus', u))
        await save($)
      }
    }
    return res
  })

  // --- 3. Subagentes sin modelo (contexto propio, sin caché que perder) ------------
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const mode = await read($, modeAtom)
    const type = e.subagent_type ?? 'general-purpose'
    if (mode !== 'auto' || e.model || type === 'fork' || !GENERIC_AGENTS.has(type)) return next(e)
    let model: Tier | undefined
    if (type === 'Explore') {
      model = 'haiku'
    } else {
      const r = await $.model.complete({
        model: 'haiku',
        effort: 'low',
        maxTokens: 10,
        timeoutMs: 6000,
        system: SUB_RULES,
        prompt: `Subagent task (${e.description}):\n<<<\n${e.prompt.slice(0, 4000)}\n>>>`,
      })
      model = (r.isAnswered ? r.text.toLowerCase().match(/haiku|sonnet|opus/)?.[0] : undefined) as Tier | undefined
    }
    if (!model) return next(e)
    const cap = await current($)
    if (cap && RANK[model] > RANK[cap]) model = cap
    if (model === 'fable') model = 'opus'
    model = await usable($, model)
    $.ui.toast((await t($)).subagent(e.description, LABEL[model]))
    return next({ ...e, model: model as 'haiku' | 'sonnet' | 'opus' })
  }).catch(($, e, next) => next(e))

  // --- 4. Botón en el pie, junto al selector de la app: abre el menú de opciones ---
  // (la app de escritorio dibuja botones en el pie, pero no desplegables)
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const s = await t($)
    const mode = await read($, modeAtom)
    const route = await read($, routeAtom)
    const pending = await read($, pendingAtom)
    const isOpen = await read($, menuAtom)
    const { Box, Button } = $.ui.resolve(e)
    const now =
      mode === 'off'
        ? s.router
        : route?.isPinned
          ? `📌 ${SHORT[route.model]} · ${route.effort}`
          : route
            ? `${s.mode[mode]} · ${SHORT[route.model]} · ${route.effort}`
            : `${s.router} · ${s.mode[mode]}`
    const effortOnly = await read($, effortAtom)
    const label = (!route || mode === 'off') && effortOnly ? `${now} · ${effortOnly}` : now
    const dot = pending && mode !== 'off' ? ' •' : ''
    const engine = await next(e)
    return (
      <Box alignItems="center" columnGap={1}>
        <Button
          key="router-menu"
          variant={isOpen ? 'primary' : 'secondary'}
          label={`↯ ${label}${dot} ${isOpen ? '▴' : '▾'}`}
          onPress={() => update($, menuAtom, v => !v)}
        />
        {engine}
      </Box>
    )
  })

  // --- 4b. El menú: título, modo, fijar modelo, esfuerzo e idioma; lo actual resaltado ---
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, menuAtom))) return next(e)
    const s = await t($)
    const mode = await read($, modeAtom)
    const route = await read($, routeAtom)
    const lang = await read($, langAtom)
    const { Box, Button, Text } = $.ui.resolve(e)
    const pinned = route?.isPinned && mode !== 'off' ? route.model : null
    const activeEffort = route && mode !== 'off' ? route.effort : await read($, effortAtom)
    const close = () => update($, menuAtom, () => false)

    const onMode = async (m: Mode) => {
      const str = await t($)
      // Elegir un modo suelta el modelo fijado y vuelve a dejar decidir al enrutador.
      const r = await read($, routeAtom)
      if (r?.isPinned) await update($, routeAtom, () => ({ ...r, isPinned: false }))
      await setMode($, m)
      $.ui.toast(str.toast[m])
    }
    const onPin = async (tier: Tier) => {
      const str = await t($)
      const effort = (await read($, routeAtom))?.effort ?? (await read($, effortAtom)) ?? 'medium'
      const r = await pin($, tier, effort)
      $.ui.toast(str.toastPin(LABEL[r.tier], effort, r.note))
    }
    const onEffort = async (effort: Effort) => {
      // Solo cambia el esfuerzo: nunca fija un modelo ni reprocesa el contexto.
      $.ui.toast(await setEffort($, effort))
    }
    const palette = await read($, paletteAtom)
    // Pulsar la paleta activa vuelve a los colores de la app.
    const onPalette = async (p: Palette) => {
      const str = await t($)
      const chosen = (await read($, paletteAtom)) === p ? null : p
      await setPalette($, chosen)
      $.ui.toast(chosen ? str.palette[chosen] : str.paletteOff)
    }
    const onLang = async (l: Lang) => {
      await setLang($, l)
      $.ui.toast(STRINGS[l].toastLang)
    }

    // Con paleta elegida, el menú se pinta con sus colores; sin ella, con los de la app.
    const C = palette ? MENU[palette] : null
    const row = (label: string, children: JSX.Element[]) => (
      <Box alignItems="center" columnGap={1}>
        <Box width={10}>
          {C ? <Text color={C.dim}>{label}</Text> : <Text dimColor>{label}</Text>}
        </Box>
        {children}
      </Box>
    )
    // La app de escritorio dibuja el texto de cada botón con su propio color (oscuro):
    // con paleta, cada opción va sobre una pastilla clara (fondo de Box, que sí respeta).
    /** Etiqueta que llena el rectángulo de punta a punta (espacios duros), con ✓ en el centro si es la paleta activa. */
    // Dos celdas menos que el rectángulo: el botón de la app añade su propio margen y, si no cabe, corta el ✓ en «…».
    // El escritorio aún lo cortaba («…»): allí la etiqueta es un solo carácter, centrado en la caja.
    const swatchLabel = (isOn: boolean) => {
      if (!isTerminal) return isOn ? '✓' : ' '
      const n = SWATCH - 2
      const mid = Math.floor((n - 1) / 2)
      return ' '.repeat(mid) + (isOn ? '✓' : ' ') + ' '.repeat(n - 1 - mid)
    }
    // La terminal, en cambio, pinta el texto del botón con el color de su tema (claro sobre
    // oscuro): sobre una pastilla clara no se leería. Allí el texto lleva el color de la paleta.
    const isTerminal = e.surface === 'terminal'
    const chipButton = (key: string, text: string, color: string, onPress: () => unknown) =>
      isTerminal ? (
        <Button key={key} plain label={text} onPress={onPress}>
          <Text color={color}>{text}</Text>
        </Button>
      ) : (
        <Button key={key} plain label={text} onPress={onPress} />
      )
    const opt = (key: string, label: string, isOn: boolean, onPress: () => unknown) => {
      const text = isOn ? `✓ ${label}` : label
      return C ? (
        <Box key={`${key}-chip`} backgroundColor={isOn ? C.on : C.chip} paddingX={1}>
          {chipButton(key, text, isOn ? C.onText : C.chipText, onPress)}
        </Box>
      ) : (
        <Button key={key} label={text} variant={isOn ? 'primary' : 'secondary'} onPress={onPress} />
      )
    }
    const modes: Mode[] = ['off', 'sugerir', 'auto']
    const efforts: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
    const spend = await read($, spendAtom)
    const learned = await read($, learnedAtom)
    const pct = spend.opusUsd > 0 ? Math.round((1 - spend.usd / spend.opusUsd) * 100) : 0
    const onForget = async () => {
      await forget($)
      $.ui.toast((await t($)).forgotten)
    }
    return (
      <Box
        flexDirection="column"
        // En la terminal cada línea cuenta: sin hueco entre filas el menú cabe entero.
        rowGap={isTerminal ? 0 : 1}
        paddingX={1}
        {...(C ? { backgroundColor: C.bg, borderStyle: 'round', borderColor: C.border } : {})}
      >
        <Box justifyContent="space-between" alignItems="center">
          <Text bold color={C?.text}>
            ↯ {s.title}
          </Text>
          <Box alignItems="center" columnGap={1}>
            {/* Selector de paleta: cuatro rectángulos iguales en fila (claro · oscuro · crema clara · crema oscura) */}
            {/* Sin borde: el botón ocupa el rectángulo entero, así que al pasar el ratón se marca entero. */}
            <Box alignItems="center" columnGap={1}>
              {PALETTES.map(p => (
                <Box key={`router-palette-${p}-chip`} width={SWATCH} height={1} overflow="hidden" justifyContent="center" backgroundColor={DOT[p]}>
                  <Button key={`router-palette-${p}`} plain label={swatchLabel(palette === p)} onPress={() => onPalette(p)} />
                </Box>
              ))}
            </Box>
            <Box backgroundColor={C?.chip}>
              {C && isTerminal ? (
                <Button key="router-close" plain label=" ✕ " role="dismiss" onPress={close}>
                  <Text color={C.chipText}> ✕ </Text>
                </Button>
              ) : (
                <Button key="router-close" label="✕" role="dismiss" onPress={close} />
              )}
            </Box>
          </Box>
        </Box>
        {row(s.modeRow, modes.map(m => opt(`router-${m}`, s.mode[m], !pinned && mode === m, () => onMode(m))))}
        {row(s.pinRow, TIERS.map(tier => opt(`router-pin:${tier}`, SHORT[tier], pinned === tier, () => onPin(tier))))}
        {row(
          s.effortRow,
          efforts.map(ef => opt(`router-effort-${ef}`, ef, activeEffort === ef, () => onEffort(ef))),
        )}
        {row(s.langLabel, LANGS.map(l => opt(`router-lang-${l}`, l.toUpperCase(), l === lang, () => onLang(l))))}
        {spend.usd > 0 || learned > 0
          ? row(s.savingsRow, [
              ...(spend.usd > 0
                ? [
                    <Text key="router-spend" color={C?.text}>
                      {s.savings(fmtUsd(spend.usd), fmtUsd(spend.opusUsd), pct)}
                    </Text>,
                  ]
                : []),
              ...(learned > 0
                ? [
                    <Text key="router-learned" color={C?.dim} dimColor={!C}>
                      {spend.usd > 0 ? '· ' : ''}
                      {s.learned(learned)}
                    </Text>,
                    opt('router-forget', s.forget, false, onForget),
                  ]
                : []),
            ])
          : null}
      </Box>
    )
  })

  // --- 5. Sugerencia pendiente: solo aparece cuando hay algo que decidir ------------
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const mode = await read($, modeAtom)
    const pending = await read($, pendingAtom)
    const isHidden = await read($, hiddenAtom)
    if (e.props.hasSurvey || mode === 'off' || isHidden || !pending) return next(e)

    const s = await t($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const note = await costNote($, pending.model)
    const accept = async () => {
      await update($, routeAtom, () => ({ ...pending, isPinned: mode !== 'auto' }))
      await update($, pendingAtom, () => null)
      await save($)
    }
    // «Seguir igual» ante una propuesta del primer mensaje (cuando cambiar no costaba nada)
    // es una corrección: aquí bastaba el modelo de ahora. A mitad de conversación no se
    // aprende, porque rechazar puede deberse solo al coste de reprocesar.
    const keep = async () => {
      const cur = await current($)
      const r = await read($, routeAtom)
      if (cur && pending.isFirst) await learn($, pending, cur, r?.effort ?? (await read($, effortAtom)) ?? 'medium')
      await update($, pendingAtom, () => null)
    }
    return (
      <Box>
        <Text dimColor>
          {s.suggested}: {LABEL[pending.model]} · {pending.effort}
          {pending.reason ? ` · ${pending.reason}` : ''}
          {note ? ` · ${note}` : ''}{' '}
        </Text>
        <Button key="apply" label={s.apply} onPress={accept} />
        <Button key="keep" label={s.keep} onPress={keep} />
      </Box>
    )
  })
}

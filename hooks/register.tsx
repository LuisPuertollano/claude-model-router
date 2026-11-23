import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Effort, Lang, Mode, Route, Saved, Tier } from '../types'
import { LANGS, LANG_NAME, STRINGS, langFromSetting } from './i18n'

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
const langAtom = atom({ plugin: 'model-router', key: 'lang' } as const, 'en')
const hiddenAtom = atom({ plugin: 'model-router', key: 'isHidden' } as const, false)
const menuAtom = atom({ plugin: 'model-router', key: 'isMenuOpen' } as const, false)
const ctxAtom = atom({ plugin: 'model-router', key: 'ctx' } as const, 0)
const lastModelAtom = atom({ plugin: 'model-router', key: 'lastModel' } as const, null)

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

// Escribir en caché el contexto con el modelo nuevo (precio de escritura ≈ 1,25 × entrada).
const cacheWriteUsd = (t: Tier, n: number) =>
  (n / 1e6) * (t === 'haiku' ? (n > 100_000 ? 0.625 : 0.125) : { sonnet: 2.5, opus: 5, fable: 10 }[t])

const isSaved = (v: unknown): v is Saved =>
  typeof v === 'object' && v !== null && MODES.includes((v as Saved).mode)

async function keyOf($: EngineInterface) {
  return `conv:${await $.session.id()}`
}

async function save($: EngineInterface) {
  const s: Saved = { mode: await read($, modeAtom), route: await read($, routeAtom) }
  await $.store.set(await keyOf($), s)
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
async function pin($: EngineInterface, tier: Tier, effort: Effort) {
  const note = (await current($)) === tier ? '' : await costNote($, tier)
  await update($, routeAtom, () => ({ model: tier, effort, reason: '', isPinned: true }))
  await update($, pendingAtom, () => null)
  if ((await read($, modeAtom)) === 'off') await update($, modeAtom, () => 'sugerir')
  await save($)
  return note
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
    await update($, pendingAtom, () => null)
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
    await $.command.register({
      name: 'modelo',
      description: 'model-router: auto | sugerir | off | opus high | libre | idioma es|en|de|fr',
      argumentHint: '[auto|sugerir|off|libre|haiku|sonnet|opus|fable] [effort] | idioma <es|en|de|fr>',
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
    if (first === 'libre' || first === 'free') {
      await update($, routeAtom, () => null)
      await update($, pendingAtom, () => null)
      await save($)
      return text((await t($)).cmdFreed)
    }
    if (TIERS.includes(first as Tier)) {
      const tier = first as Tier
      const effort: Effort = EFFORTS.includes(second as Effort) ? (second as Effort) : 'medium'
      const note = await pin($, tier, effort)
      return text((await t($)).cmdPinned(LABEL[tier], effort, note))
    }
    const s = await t($)
    const mode = await read($, modeAtom)
    const route = await read($, routeAtom)
    const now = route ? `${LABEL[route.model]} · ${route.effort}${route.isPinned ? ' (pin)' : ''}` : s.appModel
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
      system: RULES.replace('LANGUAGE', LANG_NAME[await read($, langAtom)]),
      prompt: `Current route: ${route ? `${route.model} ${route.effort}` : 'none'}\n\nUser message:\n<<<\n${e.text.slice(0, 6000)}\n>>>`,
    })
    const c = r.isAnswered ? parse(r.text) : null
    if (!c || 'same' in c) return next(e)
    const proposal: Route = { model: c.model, effort: c.effort, reason: c.reason, isPinned: false }

    if (await isFresh($)) {
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
    const res = yield* next(route && mode !== 'off' ? { ...e, model: route.model, effort: route.effort } : e)
    if (res.usage) {
      const u = res.usage
      const ctx = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await update($, ctxAtom, () => ctx)
      await update($, lastModelAtom, () => u.model)
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
    const pick = route ? ` · ${SHORT[route.model]}·${route.effort}` : ''
    const now =
      route?.isPinned && mode !== 'off'
        ? `${s.pin(SHORT[route.model])} · ${route.effort}`
        : mode === 'auto'
          ? `${s.mode.auto}${pick}`
          : s.mode[mode]
    const dot = pending && mode !== 'off' ? ' •' : ''
    const engine = await next(e)
    return (
      <Box>
        <Button
          key="router-menu"
          plain
          label={`${s.modelLabel}: ${now}${dot} ${isOpen ? '▴' : '▾'}`}
          onPress={() => update($, menuAtom, v => !v)}
        />
        {engine}
      </Box>
    )
  })

  // --- 4b. El menú: una fila de modos, otra de idiomas; la opción actual resaltada ---
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, menuAtom))) return next(e)
    const s = await t($)
    const mode = await read($, modeAtom)
    const route = await read($, routeAtom)
    const lang = await read($, langAtom)
    const { Box, Button, Text } = $.ui.resolve(e)
    const value = route?.isPinned && mode !== 'off' ? `pin:${route.model}` : mode
    const options = [
      { value: 'off', label: s.mode.off },
      { value: 'sugerir', label: s.mode.sugerir },
      { value: 'auto', label: s.mode.auto },
      ...TIERS.map(tier => ({ value: `pin:${tier}`, label: s.pin(SHORT[tier]) })),
    ]
    const close = () => update($, menuAtom, () => false)
    const onModel = async (v: string) => {
      const str = await t($)
      await close()
      if (v.startsWith('pin:')) {
        const tier = v.slice(4) as Tier
        const effort = (await read($, routeAtom))?.effort ?? 'medium'
        const note = await pin($, tier, effort)
        $.ui.toast(str.toastPin(LABEL[tier], effort, note))
        return
      }
      const m = v as Mode
      // Elegir un modo suelta el modelo fijado y vuelve a dejar decidir al enrutador.
      const r = await read($, routeAtom)
      if (r?.isPinned) await update($, routeAtom, () => ({ ...r, isPinned: false }))
      await setMode($, m)
      $.ui.toast(str.toast[m])
    }
    const onLang = async (v: Lang) => {
      await setLang($, v)
      $.ui.toast(STRINGS[v].toastLang)
    }
    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>{s.modelLabel}: </Text>
          {options.map(o => (
            <Button
              key={`router-${o.value}`}
              label={o.value === value ? `✓ ${o.label}` : o.label}
              variant={o.value === value ? 'primary' : 'secondary'}
              onPress={() => onModel(o.value)}
            />
          ))}
        </Box>
        <Box>
          <Text dimColor>{s.langLabel}: </Text>
          {LANGS.map(l => (
            <Button
              key={`router-lang-${l}`}
              label={l === lang ? `✓ ${l.toUpperCase()}` : l.toUpperCase()}
              variant={l === lang ? 'primary' : 'secondary'}
              onPress={() => onLang(l)}
            />
          ))}
          <Button key="router-close" label="✕" role="dismiss" onPress={close} />
        </Box>
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
    return (
      <Box>
        <Text dimColor>
          {s.suggested}: {LABEL[pending.model]} · {pending.effort}
          {pending.reason ? ` · ${pending.reason}` : ''}
          {note ? ` · ${note}` : ''}{' '}
        </Text>
        <Button key="apply" label={s.apply} onPress={accept} />
        <Button key="keep" label={s.keep} onPress={() => update($, pendingAtom, () => null)} />
      </Box>
    )
  })
}

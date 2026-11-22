import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Effort, Mode, Route, Saved, Tier } from '../types'

// Enrutador de modelo y esfuerzo, según "Which Claude model should you build with?"
// (Anthropic, nov 2026). Todo es POR CONVERSACIÓN: cada una guarda su modo y su
// modelo, y una conversación nueva empieza apagada.
//
// Regla de coste: cambiar de modelo (o de esfuerzo) a mitad de conversación obliga
// a reprocesar todo el contexto sin caché. Por eso el cambio automático solo ocurre
// en el PRIMER mensaje; después solo se sugiere, con los tokens que costaría, y se
// aplica únicamente si se pulsa «Cambiar».

const routeAtom = atom({ plugin: 'model-router', key: 'route' } as const, null)
const pendingAtom = atom({ plugin: 'model-router', key: 'pending' } as const, null)
const modeAtom = atom({ plugin: 'model-router', key: 'mode' } as const, 'off')
const hiddenAtom = atom({ plugin: 'model-router', key: 'isHidden' } as const, false)
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
const MODES: readonly Mode[] = ['auto', 'sugerir', 'off']
const NEXT_MODE: Record<Mode, Mode> = { off: 'sugerir', sugerir: 'auto', auto: 'off' }
const HUMAN_ORIGINS = new Set(['composer', 'bridge', 'sdk', 'unclassified'])
// Subagentes de uso general: el resto trae su propio modelo en su definición.
const GENERIC_AGENTS = new Set(['general-purpose', 'Explore', 'Plan', 'claude'])

const RULES = `Eres un enrutador. Decides qué modelo de Claude y qué nivel de esfuerzo deben atender el mensaje del usuario, según la guía de Anthropic.

Modelos, de menor a mayor coste:
- haiku: simple, repetitivo y fácil de comprobar: clasificar, etiquetar, extraer datos, resumir un texto dado, buscar un archivo, una pregunta de dato rápido. Malo cuando hay que decidir con criterio.
- sonnet: tarea acotada cuyo resultado terminado se describe en una frase: rellenar una plantilla, un correo habitual, un informe con formato fijo, arreglar un fallo concreto, una función según especificación, documentos, hojas o presentaciones corrientes, chat interactivo rápido, ejecutar una skill de flujo fijo.
- opus: el modelo por defecto y la respuesta ante la duda. Programación y trabajo de conocimiento complejos: depurar, funcionalidades de varias partes, investigar, analizar, redactar con criterio, revisar cifras contra fuentes, manejar el navegador o el ordenador, modelos financieros complejos.
- fable: solo trabajo ambicioso y abierto, sin camino fijado, donde un error sale caro: grandes refactorizaciones o migraciones, arquitectura de un sistema, investigación profunda de un mercado, análisis cuantitativo o científico difícil, coordinar muchos subagentes durante horas. Cuesta el doble que opus y en programación diaria no rinde más.

Esfuerzo: para en el primer "sí".
1. ¿Habrá ida y vuelta con el usuario, o es una tarea simple? -> low
2. ¿Un error escondido costaría dinero, un cliente o una mala decisión (contratos, finanzas, impuestos, inversiones, datos reales)? -> high
3. ¿Es un trabajo largo, difícil y crítico que se deja correr solo? -> xhigh
4. Si no -> medium
Nunca uses max.

Si el mensaje es una continuación corta de lo anterior ("sí", "hazlo", "sigue", "vale", "perfecto", una corrección pequeña), responde {"same":true}.

Responde SOLO con JSON en una línea:
{"model":"haiku|sonnet|opus|fable","effort":"low|medium|high|xhigh","reason":"motivo en español, máximo 10 palabras"}`

const SUB_RULES = `Eliges el modelo de un subagente de Claude. Responde con UNA palabra: haiku, sonnet u opus.
- haiku: solo lee e informa: buscar archivos o código, leer logs o resultados de tests, resumir documentos, recopilar datos de la web. Errores fáciles de detectar.
- sonnet: trabajo acotado con instrucciones claras: aplicar cambios bien especificados, revisar un diff con criterios dados, redactar a partir de una plantilla, investigar una pregunta concreta.
- opus: requiere criterio propio o varias decisiones encadenadas: diseñar, depurar algo sin causa conocida, cambios de código amplios, análisis con conclusiones que importan.`

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

// ¿La conversación aún no tiene ninguna respuesta? Entonces no hay caché que perder.
async function isFresh($: EngineInterface) {
  return (await $.session.messages()).every(m => m.role !== 'assistant')
}

async function costNote($: EngineInterface, to: Tier) {
  const ctx = await read($, ctxAtom)
  if (ctx === 0 || (await isFresh($))) return ''
  return `reprocesa ~${fmtK(ctx)} tokens de contexto (≈$${cacheWriteUsd(to, ctx).toFixed(2)})`
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
    if (app && app !== route.model) $.ui.toast('Ojo: al apagar vuelve el modelo elegido en la app y se reprocesa el contexto.')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(await keyOf($))
    await update($, modeAtom, () => (isSaved(saved) ? saved.mode : 'off'))
    await update($, routeAtom, () => (isSaved(saved) ? saved.route : null))
    await update($, pendingAtom, () => null)
    await $.command.register({
      name: 'modelo',
      description: 'Modelo de ESTA conversación: auto, sugerir, off, fijar uno (opus high) o libre',
      argumentHint: '[auto|sugerir|off|libre|haiku|sonnet|opus|fable] [esfuerzo]',
    })
    return next(e)
  })

  on('command.run', { command: 'modelo' }, async ($, e) => {
    const [first = '', second = ''] = e.args.trim().toLowerCase().split(/\s+/)
    const text = (t: string) => ({ text: t, isTextDisplayOnly: true as const })

    if (MODES.includes(first as Mode)) {
      await setMode($, first as Mode)
      const what = {
        auto: 'elige en el primer mensaje; después solo sugiere y tú confirmas',
        sugerir: 'solo sugiere; no cambia nada sin que pulses «Cambiar»',
        off: 'apagado; manda el modelo elegido en la app',
      }[first as Mode]
      return text(`model-router en modo ${first} solo en esta conversación: ${what}.`)
    }
    if (first === 'libre') {
      await update($, routeAtom, () => null)
      await update($, pendingAtom, () => null)
      await save($)
      return text('model-router: modelo liberado en esta conversación; vuelve a mandar el de la app.')
    }
    if (TIERS.includes(first as Tier)) {
      const tier = first as Tier
      const effort: Effort = EFFORTS.includes(second as Effort) ? (second as Effort) : 'medium'
      const note = (await current($)) === tier ? '' : await costNote($, tier)
      await update($, routeAtom, () => ({ model: tier, effort, reason: 'fijado a mano', isPinned: true }))
      await update($, pendingAtom, () => null)
      if ((await read($, modeAtom)) === 'off') await update($, modeAtom, () => 'sugerir')
      await save($)
      return text(
        `model-router: esta conversación queda en ${LABEL[tier]} · ${effort}${note ? ` (${note})` : ''}. /modelo libre para soltarlo.`,
      )
    }
    const mode = await read($, modeAtom)
    const route = await read($, routeAtom)
    const now = route ? `${LABEL[route.model]} · ${route.effort}${route.isPinned ? ' (fijado)' : ''}` : 'el de la app'
    return text(
      `model-router · esta conversación · modo ${mode} · modelo: ${now}\n` +
        '/modelo auto | sugerir | off   — cambia el modo (solo aquí)\n' +
        '/modelo opus high              — fija modelo y esfuerzo aquí\n' +
        '/modelo libre                  — vuelve al modelo de la app',
    )
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
      system: RULES,
      prompt: `Ruta actual: ${route ? `${route.model} ${route.effort}` : 'ninguna'}\n\nMensaje del usuario:\n<<<\n${e.text.slice(0, 6000)}\n>>>`,
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
        prompt: `Tarea del subagente (${e.description}):\n<<<\n${e.prompt.slice(0, 4000)}\n>>>`,
      })
      model = (r.isAnswered ? r.text.toLowerCase().match(/haiku|sonnet|opus/)?.[0] : undefined) as Tier | undefined
    }
    if (!model) return next(e)
    const cap = await current($)
    if (cap && RANK[model] > RANK[cap]) model = cap
    if (model === 'fable') model = 'opus'
    $.ui.toast(`Subagente «${e.description}» → ${LABEL[model]}`)
    return next({ ...e, model: model as 'haiku' | 'sonnet' | 'opus' })
  }).catch(($, e, next) => next(e))

  // --- 4. Botón en el pie del cuadro de texto, junto al selector de la app ---------
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const mode = await read($, modeAtom)
    const route = await read($, routeAtom)
    const pending = await read($, pendingAtom)
    const { Box, Button } = $.ui.resolve(e)
    const pick = route ? `${SHORT[route.model]}·${route.effort}` : ''
    const label =
      mode === 'off'
        ? 'Modelo auto: no'
        : route?.isPinned
          ? `Fijado: ${pick}`
          : mode === 'auto'
            ? route ? `Auto: ${pick}` : 'Modelo auto: sí'
            : 'Modelo: sugerir'
    const press = async () => {
      const m = NEXT_MODE[mode]
      await setMode($, m)
      $.ui.toast(
        {
          off: 'Enrutador apagado en esta conversación.',
          sugerir: 'Solo sugerir, en esta conversación: nada cambia sin tu «Cambiar».',
          auto: 'Auto en esta conversación: elige en el primer mensaje; luego solo sugiere.',
        }[m],
      )
    }
    const engine = await next(e)
    return (
      <Box>
        <Button key="router" label={pending && mode !== 'off' ? `${label} •` : label} onPress={press} />
        {engine}
      </Box>
    )
  })

  // --- 5. Sugerencia pendiente: solo aparece cuando hay algo que decidir ------------
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const mode = await read($, modeAtom)
    const pending = await read($, pendingAtom)
    const isHidden = await read($, hiddenAtom)
    if (e.props.hasSurvey || mode === 'off' || isHidden || !pending) return next(e)

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
          Sugerido: {LABEL[pending.model]} · {pending.effort}
          {pending.reason ? ` · ${pending.reason}` : ''}
          {note ? ` · cambiar ${note}` : ''}{' '}
        </Text>
        <Button key="apply" label="Cambiar" onPress={accept} />
        <Button key="keep" label="Seguir igual" onPress={() => update($, pendingAtom, () => null)} />
      </Box>
    )
  })
}

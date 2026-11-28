/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from 'claude-code/testing'
import { cacheWriteUsd, costUsd } from './prices'

const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const run = ($: any, args: string): Promise<{ text?: string }> => $.command.run({ command: 'modelo', args })

const engine = (on: any, saved: Record<string, unknown> = {}, language?: string) => {
  const store: Record<string, unknown> = { ...saved }
  on('session.id', () => ({ value: 'conv-A' }))
  on('session.messages', () => ({ value: [] }))
  on('settings.read', () => ({ value: language ? { language } : {} }))
  on('ui.toast', () => ({ value: undefined }))
  on('store.get', (_: unknown, e: any) => ({ value: store[e.key] }))
  on('store.set', (_: unknown, e: any) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'modelo' } }))
  on('theme.set', (_: unknown, e: any) => {
    store['__theme'] = e
    return { value: { isDrawn: true, requestId: 't1' } }
  })
  on('theme.clear', () => {
    store['__theme'] = null
    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'engine')
  })
  return store
}

const FOOTER = { plugin: 'model-router', component: 'SessionMode', props: { modes: [] } } as const
const MENU = {
  plugin: 'model-router',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 20 },
} as const

test('una conversación nueva empieza apagada y no toca los subagentes', async ($, on) => {
  engine(on)
  const seen: (string | undefined)[] = []
  on('tool.call', (_: unknown, e: any) => {
    if (e.tool === 'Agent') seen.push(e.model)
    return { result: {} }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const status = await run($, '')
  expect(status.text).toContain('mode off')
  await $.tool.call({ tool: 'Agent', description: 'buscar', prompt: 'p', subagent_type: 'Explore' })
  expect(seen).toEqual([undefined])
})

test('el idioma sale del ajuste language de Claude Code', async ($, on) => {
  engine(on, {}, 'Spanish')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const status = await run($, '')
  expect(status.text).toContain('esta conversación · modo off')
})

test('el modo se guarda solo para esta conversación', async ($, on) => {
  const store = engine(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'opus', usage } }))
  const seen: (string | undefined)[] = []
  on('tool.call', (_: unknown, e: any) => {
    if (e.tool === 'Agent') seen.push(e.model)
    return { result: {} }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($, 'sonnet high')
  await run($, 'auto')
  expect(store['conv:conv-A']).toEqual({
    mode: 'auto',
    route: { model: 'sonnet', effort: 'high', reason: '', isPinned: true },
    effort: null,
    spend: { usd: 0, opusUsd: 0 },
  })
  expect(store['mode']).toBeUndefined()

  // Subagentes: Explore → Haiku; el clasificador pide Opus pero no supera Sonnet.
  await $.tool.call({ tool: 'Agent', description: 'buscar', prompt: 'x', subagent_type: 'Explore' })
  await $.tool.call({ tool: 'Agent', description: 'diseñar', prompt: 'arquitectura' })
  expect(seen).toEqual(['haiku', 'sonnet'])
})

test('al volver a una conversación recupera su modo y su modelo', async ($, on) => {
  engine(on, {
    lang: 'es',
    'conv:conv-A': { mode: 'auto', route: { model: 'opus', effort: 'high', reason: 'x', isPinned: true } },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const status = await run($, '')
  expect(status.text).toContain('modo auto')
  expect(status.text).toContain('Opus 5.5 · high (pin)')
})

test('el botón del pie y su menú cambian el modo de la conversación y el idioma', async ($, on) => {
  const store = engine(on, { lang: 'es' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...FOOTER, surface })
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    await ui.unmount()
  }

  const foot = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  await foot.press({ key: 'router-menu' })
  const menu = await $.ui.mount({ ...MENU, surface: 'desktop' } as any)
  await menu.press({ key: 'router-auto' })
  expect((store['conv:conv-A'] as any).mode).toBe('auto')
  await menu.press({ key: 'router-pin:haiku' })
  expect((store['conv:conv-A'] as any).route.model).toBe('haiku')
  await menu.press({ key: 'router-effort-high' })
  expect((store['conv:conv-A'] as any).route.effort).toBe('high')
  expect((store['conv:conv-A'] as any).route.model).toBe('haiku')
  await menu.press({ key: 'router-lang-de' })
  expect(store['lang']).toBe('de')
  await menu.unmount()
  await foot.unmount()

  // «/modelo [sugerir]», copiado tal cual de la pista, también vale
  await run($, '[sugerir]')
  expect((store['conv:conv-A'] as any).mode).toBe('sugerir')

  const status = await run($, '')
  expect(status.text).toContain('diese Unterhaltung')
})

test('el selector de paleta cambia solo los colores del menú y al repetirla vuelve a los de la app', async ($, on) => {
  const store = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const foot = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  await foot.press({ key: 'router-menu' })
  const menu = await $.ui.mount({ ...MENU, surface: 'desktop' } as any)

  await menu.press({ key: 'router-palette-cream' })
  expect(store['palette']).toBe('cream')
  expect(store['__theme']).toBeUndefined() // la app no cambia de tema
  await menu.press({ key: 'router-auto' }) // las opciones siguen funcionando con paleta
  expect((store['conv:conv-A'] as any).mode).toBe('auto')

  await menu.press({ key: 'router-palette-cream' })
  expect(store['palette']).toBe(null)
  await menu.unmount()
  await foot.unmount()
})

test('deshace una vez el tema que la 0.6.0 puso en toda la app', async ($, on) => {
  const store = engine(on, { palette: 'creamDark' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(store['__theme']).toBe(null)
  expect(store['themeUndone']).toBe(true)
  store['__theme'] = 'otro'
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(store['__theme']).toBe('otro') // la segunda vez ya no toca el tema
})

test('el esfuerzo sin modelo fijado no fija ninguno', async ($, on) => {
  const store = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const foot = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  await foot.press({ key: 'router-menu' })
  const menu = await $.ui.mount({ ...MENU, surface: 'desktop' } as any)
  await menu.press({ key: 'router-effort-high' })
  expect((store['conv:conv-A'] as any).route).toBe(null)
  expect((store['conv:conv-A'] as any).effort).toBe('high')
  expect((store['conv:conv-A'] as any).mode).toBe('off')
  await menu.unmount()
  await foot.unmount()
  expect((await run($, '')).text).toContain('high')
})

test('si la cuenta no tiene Fable, fijarlo usa Opus y lo recuerda', async ($, on) => {
  const store = engine(on)
  const asked: string[] = []
  on('model.complete', (_: unknown, e: any) => {
    asked.push(e.model)
    return e.model === 'fable'
      ? { value: { isAnswered: false, reason: 'api-error', status: 404, error: 'model_not_found', usage } }
      : { value: { isAnswered: true, text: '.', usage } }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($, 'fable high')
  expect((store['conv:conv-A'] as any).route.model).toBe('opus')
  expect((store['availability'] as any).fable.isOk).toBe(false)
  await run($, 'fable')
  expect(asked.filter(m => m === 'fable').length).toBe(1) // la segunda vez sale de lo recordado
})

test('aprende de tus correcciones, se las da al clasificador y las olvida si se lo pides', async ($, on) => {
  const store = engine(on)
  const systems: string[] = []
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  on('model.complete', (_: unknown, e: any) => {
    if (e.system) systems.push(e.system)
    return { value: { isAnswered: true, text: '{"model":"opus","effort":"high","reason":"r"}', usage } }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($, 'auto')
  await $.prompt.submit({ text: 'redacta un correo corto a Marta para quedar el jueves', origin: { kind: 'composer' } } as any)
  expect((store['conv:conv-A'] as any).route.model).toBe('opus')
  await run($, 'sonnet low') // la persona corrige: para esto bastaba Sonnet
  const saved = store['decisions'] as any[]
  expect(saved.length).toBe(1)
  expect(saved[0]).toMatchObject({ proposed: 'opus', chosen: 'sonnet', chosenEffort: 'low' })

  await run($, 'libre')
  await $.prompt.submit({ text: 'otro correo corto, ahora para Pedro, para cambiar la cita', origin: { kind: 'composer' } } as any)
  expect(systems.at(-1)).toContain('the user chose sonnet low')

  await run($, 'olvidar')
  expect(store['decisions']).toEqual([])
})

test('el gasto se calcula con una sola tabla de precios', async () => {

  const u = { input_tokens: 1_000_000, output_tokens: 0 }
  expect(costUsd('opus', u)).toBe(4)
  expect(costUsd('sonnet', { input_tokens: 0, output_tokens: 1_000_000 })).toBe(10)
  expect(cacheWriteUsd('opus', 1_000_000)).toBe(5)
  expect(Math.round(costUsd('haiku', { input_tokens: 200_000, output_tokens: 0 }) * 1000)).toBe(100)
})

test('el menú muestra lo gastado frente a usar siempre Opus', async ($, on) => {
  engine(on, { lang: 'es', 'conv:conv-A': { mode: 'auto', route: null, spend: { usd: 0.5, opusUsd: 1 } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const foot = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  await foot.press({ key: 'router-menu' })
  const menu = await $.ui.mount({ ...MENU, surface: 'desktop' } as any)
  expect((await menu.find({ type: 'Text', text: /ahorras 50%/ }))?.text).toContain('$0.50')
  await menu.unmount()
  await foot.unmount()
})

test('en la terminal, con paleta, el texto de las opciones lleva el color de la paleta', async ($, on) => {
  engine(on, { lang: 'es', palette: 'night' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const foot = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  await foot.press({ key: 'router-menu' })
  const menu = await $.ui.mount({ ...MENU, surface: 'terminal' } as any)
  const t = await menu.find({ type: 'Text', text: /Sugerir/ })
  expect((t as any)?.props?.color ?? (t as any)?.color).toBe('#16202e')
  await menu.press({ key: 'router-auto' })
  await menu.unmount()
  await foot.unmount()
})

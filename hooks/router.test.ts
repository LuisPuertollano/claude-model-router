import { expect, test } from 'claude-code/testing'

const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type On = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = ($: any, args: string): Promise<{ text?: string }> => $.command.run({ command: 'modelo', args })

const engine = (on: On, saved: Record<string, unknown> = {}) => {
  const store: Record<string, unknown> = { ...saved }
  on('session.id', () => ({ value: 'conv-A' }))
  on('session.messages', () => ({ value: [] }))
  on('store.get', (_: unknown, e: any) => ({ value: store[e.key] }))
  on('store.set', (_: unknown, e: any) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'modelo' } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  return store
}

test('una conversación nueva empieza apagada y no toca los subagentes', async ($, on) => {
  engine(on)
  const seen: (string | undefined)[] = []
  on('tool.call', (_: unknown, e: any) => {
    if (e.tool === 'Agent') seen.push(e.model)
    return { result: {} }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const status = await run($, '')
  expect(status.text).toContain('modo off')
  await $.tool.call({ tool: 'Agent', description: 'buscar', prompt: 'p', subagent_type: 'Explore' })
  expect(seen).toEqual([undefined])
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
    route: { model: 'sonnet', effort: 'high', reason: 'fijado a mano', isPinned: true },
  })
  expect(store['mode']).toBeUndefined()

  // Subagentes: Explore → Haiku; el clasificador pide Opus pero no supera Sonnet.
  await $.tool.call({ tool: 'Agent', description: 'buscar', prompt: 'x', subagent_type: 'Explore' })
  await $.tool.call({ tool: 'Agent', description: 'diseñar', prompt: 'arquitectura' })
  expect(seen).toEqual(['haiku', 'sonnet'])
})

test('al volver a una conversación recupera su modo y su modelo', async ($, on) => {
  engine(on, {
    'conv:conv-A': { mode: 'auto', route: { model: 'opus', effort: 'high', reason: 'x', isPinned: true } },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const status = await run($, '')
  expect(status.text).toContain('modo auto')
  expect(status.text).toContain('Opus 5.5 · high (fijado)')
})

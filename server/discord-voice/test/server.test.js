import test from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { RoomManager, TEXT } from '../rooms.js'
import { startServer, wrapSocket } from '../server.js'
import { FakeAdapter } from '../test-support/fake-adapter.js'

const quiet = { info() {}, warn() {}, error() {} }

async function boot(t, adapter = new FakeAdapter()) {
  const manager = new RoomManager({ adapter, log: quiet })
  adapter?.attach(manager)
  const app = startServer({ manager, port: 0, host: '127.0.0.1' })
  t.after(() => app.close())
  await app.listening
  const base = `127.0.0.1:${app.port()}`
  return { manager, http: `http://${base}`, ws: `ws://${base}` }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.inbox = []
    ws.on('message', data => ws.inbox.push(JSON.parse(data)))
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

async function waitFor(ws, t, timeout = 2000) {
  const end = Date.now() + timeout
  for (;;) {
    const hit = ws.inbox.find(msg => msg.t === t)
    if (hit) return hit
    if (Date.now() > end) throw new Error(`no '${t}' message within ${timeout} ms`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

const hello = JSON.stringify({ t: 'hello', room: 'ABCD', v: 1 })

test('GET /health reports Discord status and live rooms; other paths are 404', async t => {
  const s = await boot(t)
  let res = await fetch(`${s.http}/health`)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, discord: 'connected', rooms: 0 })
  const ws = await connect(`${s.ws}/discord`)
  ws.send(hello)
  await waitFor(ws, 'ready')
  res = await fetch(`${s.http}/health`)
  assert.deepEqual(await res.json(), { ok: true, discord: 'connected', rooms: 1 })
  assert.equal((await fetch(`${s.http}/nope`)).status, 404)
  ws.close()
})

test('the /discord WebSocket speaks the protocol and shrugs off junk', async t => {
  const s = await boot(t)
  const ws = await connect(`${s.ws}/discord`)
  ws.send('{not json')
  ws.send('42')
  ws.send(Buffer.from([1, 2, 3])) // binary frame
  ws.send(JSON.stringify({ t: 'state', phase: 'play', players: [] })) // before hello
  ws.send(JSON.stringify({ t: 'mystery' }))
  ws.send(hello)
  assert.deepEqual(await waitFor(ws, 'ready'), { t: 'ready', guild: 'Test Guild', lobby: 'Last Call ABCD / Lobby' })
  ws.send(JSON.stringify({ t: 'roster', players: [{ key: 'host', name: 'Steve' }] }))
  const { codes } = await waitFor(ws, 'codes')
  assert.match(codes.host, /^\d{4}$/)
  assert.equal(s.manager.link('u1', codes.host).ok, true)
  assert.deepEqual(await waitFor(ws, 'voice'), { t: 'voice', key: 'host', inVoice: false })
  assert.deepEqual(ws.inbox, [
    { t: 'ready', guild: 'Test Guild', lobby: 'Last Call ABCD / Lobby' },
    { t: 'codes', codes },
    { t: 'linked', key: 'host', user: 'Discord u1' },
    { t: 'codes', codes: {} },
    { t: 'voice', key: 'host', inVoice: false },
  ])
  ws.close()
})

test('a second hello for the same room closes the old socket (host reload)', async t => {
  const s = await boot(t)
  const first = await connect(`${s.ws}/discord`)
  first.send(hello)
  await waitFor(first, 'ready')
  const closed = new Promise(resolve => first.once('close', code => resolve(code)))
  const second = await connect(`${s.ws}/discord`)
  second.send(hello)
  await waitFor(second, 'ready')
  assert.equal(await closed, 4000)
  second.close()
})

test('without a token the server still answers every hello with the not-set-up error', async t => {
  const s = await boot(t, null)
  const ws = await connect(`${s.ws}/discord`)
  ws.send(hello)
  assert.deepEqual(await waitFor(ws, 'error'), { t: 'error', why: TEXT.notSetUp })
  assert.deepEqual(await (await fetch(`${s.http}/health`)).json(), { ok: true, discord: 'disconnected', rooms: 0 })
  ws.close()
})

test('WebSocket upgrades on other paths are refused', async t => {
  const s = await boot(t)
  await assert.rejects(connect(`${s.ws}/elsewhere`))
})

test('sending to a closed or failing socket is a quiet no-op', () => {
  let sent = 0
  const closed = { readyState: WebSocket.CLOSED, send() { sent++ }, close() { throw new Error('already closed') } }
  assert.doesNotThrow(() => wrapSocket(closed).send({ t: 'ready' }))
  assert.doesNotThrow(() => wrapSocket(closed).close(1000, 'bye'))
  assert.equal(sent, 0)
  const failing = { readyState: WebSocket.OPEN, send() { throw new Error('socket hung up') } }
  assert.doesNotThrow(() => wrapSocket(failing).send({ t: 'ready' }))
})

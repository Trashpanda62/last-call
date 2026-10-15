import test from 'node:test'
import assert from 'node:assert/strict'
import { CHANNEL_NAMES, MOVE_BUDGET, MOVE_WINDOW_MS, ROOM_CHANNELS, RoomManager, TEXT } from '../rooms.js'
import { FakeAdapter } from '../test-support/fake-adapter.js'

const quiet = { info() {}, warn() {}, error() {} }
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve))
}

function gameSocket() {
  return {
    sent: [],
    closed: null,
    send(msg) { this.sent.push(structuredClone(msg)) },
    close(code, reason) { this.closed = { code, reason } },
    of(t) { return this.sent.filter(msg => msg.t === t) },
    last(t) { return this.of(t).at(-1) },
  }
}

function harness({ fake: fakeOptions, ...options } = {}) {
  let time = 1_000_000
  const fake = new FakeAdapter(fakeOptions)
  const m = new RoomManager({ adapter: fake, now: () => time, log: quiet, ...options })
  fake.attach(m)
  const h = {
    fake,
    m,
    host: gameSocket(),
    get time() { return time },
    // Moves the clock forward in 250 ms steps, like the server's tick loop.
    async run(ms) {
      for (let left = ms; left > 0; left -= 250) {
        time += Math.min(250, left)
        m.tick()
        await flush()
      }
    },
    send(msg, socket = h.host) { m.message(socket, msg) },
    state(phase, players, socket = h.host) { m.message(socket, { t: 'state', phase, players }) },
  }
  return h
}

const roster = keys => ({ t: 'roster', players: keys.map(key => ({ key, name: key.toUpperCase() })) })
const playing = (rooms, alive = {}) => Object.entries(rooms).map(([key, room]) => ({ key, room, alive: alive[key] ?? true }))

// hello + roster, then every player joins the room's Lobby voice channel and links (user id u-<key>).
async function game(h, keys = ['host', 'mint'], room = 'ABCD') {
  h.send({ t: 'hello', room, v: 1 })
  await flush()
  h.send(roster(keys))
  const { codes } = h.host.last('codes')
  for (const key of keys) {
    h.fake.join(`u-${key}`, room, 'Lobby')
    assert.equal(h.m.link(`u-${key}`, codes[key]).ok, true)
  }
  await flush()
}

test('channel names and room mapping match the spec', () => {
  assert.deepEqual(CHANNEL_NAMES, ['Lobby', 'Bar', 'Floor', 'Arcade', 'Duck Pond', 'Slots', 'Alley', 'VIP Lounge', 'Restrooms', 'Meeting', 'Ghosts'])
  assert.deepEqual(ROOM_CHANNELS, { bar: 'Bar', floor: 'Floor', arcade: 'Arcade', race: 'Duck Pond', slots: 'Slots', alley: 'Alley', vip: 'VIP Lounge', rest: 'Restrooms' })
  assert.equal(MOVE_BUDGET, 8)
  assert.equal(MOVE_WINDOW_MS, 10_000)
})

test('hello creates the category and voice channels, then answers ready', async () => {
  const h = harness()
  h.send({ t: 'hello', room: 'abcd', v: 1 })
  assert.deepEqual(h.host.sent, []) // ready waits for the channels
  await flush()
  assert.deepEqual(h.fake.created, CHANNEL_NAMES.map(name => `ABCD/${name}`))
  assert.deepEqual(h.host.sent, [{ t: 'ready', guild: 'Test Guild', lobby: 'Last Call ABCD / Lobby' }])
})

test('hello reuses channels that already exist (bot restart) and honours the prefix', async () => {
  const h = harness({ prefix: 'LC' })
  await h.fake.ensureChannels('ABCD', CHANNEL_NAMES)
  h.fake.created.length = 0
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  await flush()
  assert.deepEqual(h.fake.created, [])
  assert.equal(h.host.last('ready').lobby, 'LC ABCD / Lobby')
  h.send(roster(['host']))
  assert.match(h.m.link('u1', h.host.last('codes').codes.host).text, /Join the "LC ABCD \/ Lobby" voice channel\.$/)
})

test('roster: a unique 4-digit code per unlinked key, kept until it links or leaves', () => {
  const h = harness()
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  h.send(roster(['host', 'p1']))
  const first = h.host.last('codes').codes
  assert.deepEqual(Object.keys(first), ['host', 'p1'])
  for (const code of Object.values(first)) assert.match(code, /^\d{4}$/)
  assert.notEqual(first.host, first.p1)
  h.send(roster(['host', 'p1', 'p2']))
  const second = h.host.last('codes').codes
  assert.equal(second.host, first.host)
  assert.equal(second.p1, first.p1)
  assert.match(second.p2, /^\d{4}$/)
  h.send(roster(['host', 'p2']))
  assert.deepEqual(h.host.last('codes').codes, { host: first.host, p2: second.p2 })
  assert.equal(h.m.link('u1', first.p1).text, TEXT.badCode) // p1 left, so its code died with it
  const sentBefore = h.host.of('codes').length
  h.send({ t: 'roster', players: [{ key: 'host', name: 'Renamed' }, { key: 'p2', name: 'P2' }] })
  assert.equal(h.host.of('codes').length, sentBefore) // nothing changed, nothing resent
})

test('codes stay unique across rooms even when the random source repeats', () => {
  const h = harness({ random: () => 0.5 })
  const other = gameSocket()
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  h.send({ t: 'hello', room: 'WXYZ', v: 1 }, other)
  h.send(roster(['a', 'b']))
  h.send(roster(['a', 'b']), other)
  const all = [...Object.values(h.host.last('codes').codes), ...Object.values(other.last('codes').codes)]
  assert.equal(new Set(all).size, 4)
  for (const code of all) assert.match(code, /^\d{4}$/)
})

test('link: exact reply, linked + codes + voice messages, and a user already in voice goes to Lobby', async () => {
  const h = harness()
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  await flush()
  h.send({ t: 'roster', players: [{ key: 'host', name: 'Steve' }, { key: 'p1', name: 'Mint' }] })
  const { codes } = h.host.last('codes')
  h.fake.names.set('u1', 'stevo')
  h.fake.joinOther('u1')
  assert.deepEqual(h.m.link('u1', ` ${codes.host} `), {
    ok: true,
    text: 'Linked: you are Steve in Last Call room ABCD. Join the "Last Call ABCD / Lobby" voice channel.',
  })
  assert.deepEqual(h.host.sent.slice(-3), [
    { t: 'linked', key: 'host', user: 'stevo' },
    { t: 'codes', codes: { p1: codes.p1 } },
    { t: 'voice', key: 'host', inVoice: true },
  ])
  await flush()
  assert.equal(h.fake.where('u1'), 'ABCD/Lobby')
  assert.equal(h.m.link('u2', codes.host).text, TEXT.badCode) // used up
})

test('a code that is not live gets the exact error reply', () => {
  const h = harness()
  assert.deepEqual(h.m.link('u1', '1234'), { ok: false, text: "That code isn't live. Check the code on your game screen." })
  assert.equal(h.m.link('u1', undefined).ok, false)
})

test('linking again replaces the old link, and a key holds one Discord user', () => {
  let n = 0
  const h = harness({ random: () => (n++ % 9000) / 9000 }) // codes 1000, 1001, ... so "fresh" is deterministic
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  h.send(roster(['host', 'p1']))
  const first = h.host.last('codes').codes
  h.m.link('u1', first.host)
  h.m.link('u1', first.p1)
  assert.deepEqual(h.host.of('unlinked'), [{ t: 'unlinked', key: 'host' }])
  assert.deepEqual(h.host.last('linked'), { t: 'linked', key: 'p1', user: 'Discord u1' })
  const now = h.host.last('codes').codes
  assert.deepEqual(Object.keys(now), ['host'])
  assert.notEqual(now.host, first.host) // the freed key gets a fresh code
  assert.equal(h.m.link('u2', first.host).ok, false)
  assert.equal(h.m.link('u2', now.host).ok, true)
  assert.equal(h.m.links.get('u1').key, 'p1')
  assert.equal(h.m.links.get('u2').key, 'host')
})

test('unlink frees the key and gives it a new code', () => {
  const h = harness()
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  h.send(roster(['host']))
  h.m.link('u1', h.host.last('codes').codes.host)
  assert.deepEqual(h.host.last('codes').codes, {})
  assert.deepEqual(h.m.unlink('u1'), { ok: true, text: 'Unlinked from Last Call room ABCD. The bot will stop moving you.' })
  assert.deepEqual(h.host.last('unlinked'), { t: 'unlinked', key: 'host' })
  assert.match(h.host.last('codes').codes.host, /^\d{4}$/)
  assert.deepEqual(h.m.unlink('u1'), { ok: false, text: "You aren't linked to a Last Call room." })
})

test('a linked key that leaves the roster is unlinked', () => {
  const h = harness()
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  h.send(roster(['host', 'p1']))
  h.m.link('u1', h.host.last('codes').codes.p1)
  h.send(roster(['host']))
  assert.deepEqual(h.host.last('unlinked'), { t: 'unlinked', key: 'p1' })
  assert.equal(h.m.links.size, 0)
  assert.deepEqual(Object.keys(h.host.last('codes').codes), ['host'])
})

test('never pulls anyone into voice: moves them once they join, and reports inVoice', async () => {
  const h = harness()
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  await flush()
  h.send(roster(['host']))
  h.m.link('u1', h.host.last('codes').codes.host)
  assert.deepEqual(h.host.last('voice'), { t: 'voice', key: 'host', inVoice: false })
  h.state('play', playing({ host: 'bar' }))
  await h.run(3000)
  assert.deepEqual(h.fake.moves, [])
  h.fake.joinOther('u1')
  assert.deepEqual(h.host.last('voice'), { t: 'voice', key: 'host', inVoice: true })
  await flush()
  assert.equal(h.fake.where('u1'), 'ABCD/Bar')
  h.fake.leave('u1')
  assert.deepEqual(h.host.last('voice'), { t: 'voice', key: 'host', inVoice: false })
  await h.run(3000)
  assert.equal(h.fake.moves.length, 1)
  assert.equal(h.host.of('voice').length, 3)
})

test('play: a doorway flicker moves nobody; a room held for 1.2 s does', async () => {
  const h = harness()
  await game(h, ['host'])
  const at = room => h.state('play', playing({ host: room }))
  at('bar')
  await flush()
  assert.equal(h.fake.where('u-host'), 'ABCD/Bar') // the phase change moves at once
  for (const room of ['floor', 'bar', 'floor', 'bar']) {
    at(room)
    await h.run(500)
  }
  assert.equal(h.fake.moves.length, 1)
  at('floor')
  await h.run(1000)
  assert.equal(h.fake.where('u-host'), 'ABCD/Bar')
  await h.run(250)
  assert.equal(h.fake.where('u-host'), 'ABCD/Floor')
  assert.equal(h.fake.moves.length, 2)
})

test('phase changes move at once: meeting sends the living to Meeting and the dead to Ghosts', async () => {
  const h = harness()
  await game(h, ['host', 'mint'])
  h.state('play', playing({ host: 'bar', mint: 'slots' }))
  await flush()
  assert.equal(h.fake.where('u-host'), 'ABCD/Bar')
  assert.equal(h.fake.where('u-mint'), 'ABCD/Slots')
  h.state('play', playing({ host: 'bar', mint: 'slots' }, { mint: false }))
  await flush()
  assert.equal(h.fake.where('u-mint'), 'ABCD/Ghosts') // dying is not debounced
  h.state('meeting', playing({ host: null, mint: null }, { mint: false }))
  await flush()
  assert.equal(h.fake.where('u-host'), 'ABCD/Meeting')
  assert.equal(h.fake.where('u-mint'), 'ABCD/Ghosts')
  h.state('play', playing({ host: 'vip', mint: 'vip' }, { mint: false }))
  await flush()
  assert.equal(h.fake.where('u-host'), 'ABCD/VIP Lounge')
  assert.equal(h.fake.where('u-mint'), 'ABCD/Ghosts')
  h.state('over', playing({ host: 'vip', mint: null }, { mint: false }))
  await flush()
  assert.equal(h.fake.where('u-host'), 'ABCD/Lobby')
  assert.equal(h.fake.where('u-mint'), 'ABCD/Lobby')
})

test('play: room null leaves a player where they are, and so does an unknown room id', async () => {
  const h = harness()
  await game(h, ['host'])
  h.state('play', playing({ host: 'race' }))
  await flush()
  assert.equal(h.fake.where('u-host'), 'ABCD/Duck Pond')
  h.state('play', playing({ host: null }))
  await h.run(3000)
  h.state('play', playing({ host: 'kitchen' }))
  await h.run(3000)
  assert.equal(h.fake.where('u-host'), 'ABCD/Duck Pond')
  h.state('play', playing({ host: 'rest' }))
  await h.run(1250)
  assert.equal(h.fake.where('u-host'), 'ABCD/Restrooms')
})

test('moves are rate limited to 8 per 10 s per guild; the rest wait their turn', async () => {
  const h = harness()
  const keys = Array.from({ length: 10 }, (_, i) => `p${i}`)
  await game(h, keys)
  assert.equal(h.fake.moves.length, 0)
  h.state('meeting', playing(Object.fromEntries(keys.map(key => [key, null]))))
  await flush()
  assert.equal(h.fake.moves.length, 8)
  await h.run(9750)
  assert.equal(h.fake.moves.length, 8)
  await h.run(250)
  assert.equal(h.fake.moves.length, 10)
  for (const key of keys) assert.equal(h.fake.where(`u-${key}`), 'ABCD/Meeting')
})

test('one move in flight per user, and the newest target replaces a queued one', async () => {
  const h = harness()
  await game(h, ['host'])
  h.fake.hold = true
  h.state('play', playing({ host: 'bar' }))
  await flush()
  assert.deepEqual(h.fake.moves.map(move => move.to), ['ABCD/Bar'])
  h.state('play', playing({ host: 'floor' }))
  await h.run(1500)
  h.state('play', playing({ host: 'arcade' }))
  await h.run(1500)
  assert.equal(h.fake.moves.length, 1) // Floor, then Arcade, waited behind the Bar move
  h.fake.hold = false
  h.fake.release()
  await flush()
  assert.deepEqual(h.fake.moves.map(move => move.to), ['ABCD/Bar', 'ABCD/Arcade'])
  assert.equal(h.fake.where('u-host'), 'ABCD/Arcade')
})

test('a failed move is retried after a pause, not hammered', async () => {
  const h = harness()
  await game(h, ['host'])
  const realMove = h.fake.moveMember.bind(h.fake)
  let failures = 0
  h.fake.moveMember = (user, channelId) => {
    if (failures++ < 1) return Promise.reject(new Error('Discord hiccup'))
    return realMove(user, channelId)
  }
  h.state('play', playing({ host: 'alley' }))
  await h.run(4750)
  assert.equal(failures, 1)
  await h.run(500)
  assert.equal(failures, 2)
  assert.equal(h.fake.where('u-host'), 'ABCD/Alley')
})

test('messages before hello, unknown types and malformed messages are ignored', async () => {
  const h = harness()
  const stray = gameSocket()
  h.send({ t: 'state', phase: 'play', players: playing({ a: 'bar' }) }, stray)
  h.send(roster(['a']), stray)
  h.send({ t: 'bye' }, stray)
  for (const junk of [null, 42, 'hello', [], {}, { t: 7 }, { t: 'dance' }]) h.m.message(stray, junk)
  assert.deepEqual(stray.sent, [])
  assert.equal(h.m.rooms.size, 0)
  h.send({ t: 'hello', room: 'AB' }, stray)
  h.send({ t: 'hello', room: 42 }, stray)
  h.send({ t: 'hello', room: 'ABCD', v: 2 }, stray)
  assert.deepEqual(stray.sent, [
    { t: 'error', why: TEXT.badRoom },
    { t: 'error', why: TEXT.badRoom },
    { t: 'error', why: TEXT.badVersion },
  ])
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  h.send({ t: 'state', phase: 'dance', players: [] })
  h.send({ t: 'state', phase: 'play', players: 'nope' })
  h.send({ t: 'roster', players: { key: 'x' } })
  h.send({ t: 'roster', players: [null, { key: 5 }, { name: 'no key' }] })
  assert.equal(h.m.rooms.get('ABCD').phase, 'lobby')
  await flush()
  assert.deepEqual(h.host.sent, [{ t: 'codes', codes: {} }, { t: 'ready', guild: 'Test Guild', lobby: 'Last Call ABCD / Lobby' }])
})

test('host reload: a second hello replaces the old socket and gets a full resync', async () => {
  const h = harness()
  await game(h, ['host', 'mint'])
  const fresh = gameSocket()
  h.send({ t: 'hello', room: 'ABCD', v: 1 }, fresh)
  assert.equal(h.host.closed.code, 4000)
  assert.deepEqual(fresh.sent, [
    { t: 'ready', guild: 'Test Guild', lobby: 'Last Call ABCD / Lobby' },
    { t: 'codes', codes: {} },
    { t: 'linked', key: 'host', user: 'Discord u-host' },
    { t: 'voice', key: 'host', inVoice: true },
    { t: 'linked', key: 'mint', user: 'Discord u-mint' },
    { t: 'voice', key: 'mint', inVoice: true },
  ])
  h.send({ t: 'bye' }) // the replaced socket no longer speaks for the room
  h.m.disconnect(h.host)
  assert.equal(h.m.rooms.get('ABCD').client, fresh)
  h.state('play', playing({ host: 'arcade', mint: 'floor' }), fresh)
  await flush()
  assert.equal(h.fake.where('u-host'), 'ABCD/Arcade')
})

test('host gone: everything is kept for 90 s so a reload can pick it back up', async () => {
  const h = harness()
  await game(h, ['host', 'mint'])
  h.m.disconnect(h.host)
  await h.run(89_750)
  assert.equal(h.m.links.size, 2)
  assert.equal(h.m.liveRooms(), 1)
  const back = gameSocket()
  h.send({ t: 'hello', room: 'ABCD', v: 1 }, back)
  assert.deepEqual(back.sent.map(msg => msg.t), ['ready', 'codes', 'linked', 'voice', 'linked', 'voice'])
  await h.run(120_000)
  assert.equal(h.m.links.size, 2)
  assert.deepEqual(h.fake.deleted, [])
})

test('host gone for 90 s: players gathered in Lobby, links and codes dropped, channels deleted once empty', async () => {
  const h = harness()
  await game(h, ['host', 'mint'])
  h.send(roster(['host', 'mint', 'rook']))
  const rookCode = h.host.last('codes').codes.rook
  h.state('play', playing({ host: 'bar', mint: 'floor' }))
  await flush()
  assert.equal(h.fake.where('u-host'), 'ABCD/Bar')
  h.m.disconnect(h.host)
  await h.run(89_750)
  assert.equal(h.m.links.size, 2)
  await h.run(250)
  assert.equal(h.fake.where('u-host'), 'ABCD/Lobby')
  assert.equal(h.fake.where('u-mint'), 'ABCD/Lobby')
  assert.equal(h.m.links.size, 0)
  assert.equal(h.m.unlink('u-host').ok, false)
  assert.equal(h.m.link('u-new', rookCode).ok, false)
  assert.equal(h.m.liveRooms(), 0)
  await h.run(60_000)
  assert.deepEqual(h.fake.deleted, []) // people are still in the Lobby
  h.fake.leave('u-host')
  h.fake.leave('u-mint')
  await h.run(29_750)
  assert.deepEqual(h.fake.deleted, []) // checked every 30 s
  await h.run(250)
  assert.deepEqual(h.fake.deleted, ['ABCD'])
  assert.equal(h.m.rooms.size, 0)
})

test('bye closes the room at once, and an empty room loses its channels right away', async () => {
  const h = harness()
  await game(h, ['host'])
  h.fake.leave('u-host')
  h.send({ t: 'bye' })
  await flush()
  assert.deepEqual(h.fake.deleted, ['ABCD'])
  assert.equal(h.m.rooms.size, 0)
  assert.equal(h.m.links.size, 0)
  h.state('play', playing({ host: 'bar' })) // the socket is no longer bound to a room
  assert.equal(h.m.rooms.size, 0)
})

test('a hello for a closed room that still has people in it reopens it with the same channels', async () => {
  const h = harness()
  await game(h, ['host'])
  h.send({ t: 'bye' })
  await flush()
  assert.equal(h.m.liveRooms(), 0)
  const created = h.fake.created.length
  const again = gameSocket()
  h.send({ t: 'hello', room: 'ABCD', v: 1 }, again)
  assert.deepEqual(again.sent.map(msg => msg.t), ['ready'])
  assert.equal(h.fake.created.length, created)
  h.fake.leave('u-host')
  await h.run(60_000)
  assert.deepEqual(h.fake.deleted, []) // open again, so not swept
})

test('missing permissions: one error naming them, then ready once they are granted', async () => {
  const h = harness()
  h.fake.missing = ['Manage Channels', 'Move Members']
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  await h.run(2000)
  assert.deepEqual(h.host.sent, [{ t: 'error', why: 'The Discord bot needs these permissions in Test Guild: Manage Channels, Move Members.' }])
  assert.deepEqual(h.fake.created, [])
  h.fake.missing = []
  await h.run(250)
  assert.equal(h.host.last('ready').guild, 'Test Guild')
  assert.equal(h.fake.created.length, 11)
})

test('losing Move Members mid-game pauses moves and tells the game once', async () => {
  const h = harness()
  await game(h, ['host'])
  h.fake.missing = ['Move Members']
  h.state('play', playing({ host: 'bar' }))
  await h.run(3000)
  assert.deepEqual(h.fake.moves, [])
  assert.deepEqual(h.host.of('error'), [{ t: 'error', why: 'The Discord bot needs the Move Members permission in Test Guild.' }])
  h.fake.missing = []
  await h.run(250)
  assert.equal(h.fake.where('u-host'), 'ABCD/Bar')
})

test('a voice channel deleted by hand is recreated the next time someone needs it', async () => {
  const h = harness()
  await game(h, ['host'])
  h.state('play', playing({ host: 'bar' }))
  await flush()
  assert.equal(h.fake.where('u-host'), 'ABCD/Bar')
  h.fake.created.length = 0
  h.fake.deleteByHand('ABCD', 'Bar') // also drops the host out of voice
  await h.run(1000)
  assert.deepEqual(h.fake.created, []) // nobody needs it yet
  h.fake.join('u-host', 'ABCD', 'Lobby')
  await flush()
  assert.deepEqual(h.fake.created, ['ABCD/Bar'])
  assert.equal(h.fake.where('u-host'), 'ABCD/Bar')
})

test('without a Discord token every hello gets the not-set-up error', () => {
  const m = new RoomManager({ adapter: null, log: quiet })
  const socket = gameSocket()
  m.message(socket, { t: 'hello', room: 'ABCD', v: 1 })
  m.message(socket, roster(['host']))
  m.tick()
  m.message(socket, { t: 'hello', room: 'ABCD', v: 1 })
  assert.deepEqual(socket.sent, [
    { t: 'error', why: 'The Discord bot is not set up on this server.' },
    { t: 'error', why: 'The Discord bot is not set up on this server.' },
  ])
  assert.equal(m.discordStatus(), 'disconnected')
  assert.equal(m.liveRooms(), 0)
})

test('Discord offline at hello: error after 5 s, then ready once it connects', async () => {
  const h = harness({ fake: { ready: false } })
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  await h.run(4750)
  assert.deepEqual(h.host.sent, [])
  await h.run(250)
  assert.deepEqual(h.host.sent, [{ t: 'error', why: TEXT.offline }])
  await h.run(5000)
  assert.equal(h.host.of('error').length, 1)
  assert.equal(h.m.discordStatus(), 'disconnected')
  h.fake.ready = true
  await h.run(250)
  assert.deepEqual(h.host.sent.map(msg => msg.t), ['error', 'ready'])
  assert.equal(h.m.discordStatus(), 'connected')
})

test('a room that never reached Discord is forgotten as soon as it closes', async () => {
  const h = harness({ fake: { ready: false } })
  const other = gameSocket()
  h.send({ t: 'hello', room: 'ABCD', v: 1 })
  h.send({ t: 'hello', room: 'WXYZ', v: 1 }, other)
  h.send({ t: 'bye' }, other)
  assert.deepEqual([...h.m.rooms.keys()], ['ABCD'])
  h.m.disconnect(h.host)
  await h.run(90_000)
  assert.equal(h.m.rooms.size, 0)
  assert.deepEqual(h.fake.deleted, [])
})

test('the number of rooms is capped, since each holds 12 channels', () => {
  const h = harness({ maxRooms: 2 })
  const [a, b, c] = [gameSocket(), gameSocket(), gameSocket()]
  h.send({ t: 'hello', room: 'AAAA', v: 1 }, a)
  h.send({ t: 'hello', room: 'BBBB', v: 1 }, b)
  h.send({ t: 'hello', room: 'CCCC', v: 1 }, c)
  assert.deepEqual(c.sent, [{ t: 'error', why: TEXT.full }])
  assert.equal(h.m.liveRooms(), 2)
})

test('categories left by an earlier run are deleted about 90 s after start-up once empty', async () => {
  const h = harness()
  await h.fake.ensureChannels('WXYZ', CHANNEL_NAMES)
  await h.fake.ensureChannels('ABCD', CHANNEL_NAMES)
  h.send({ t: 'hello', room: 'ABCD', v: 1 }) // a host came back for this one
  await h.run(89_000)
  assert.deepEqual(h.fake.deleted, [])
  await h.run(1500)
  assert.deepEqual(h.fake.deleted, ['WXYZ'])
  assert.equal(h.m.liveRooms(), 1)
})

// Room logic for Last Call's Discord voice. No discord.js and no timers in here: the clock is
// injected (now) and the server calls tick(), so tests can drive everything with a fake adapter.

export const CHANNEL_NAMES = ['Lobby', 'Bar', 'Floor', 'Arcade', 'Duck Pond', 'Slots', 'Alley', 'VIP Lounge', 'Restrooms', 'Meeting', 'Ghosts']
export const ROOM_CHANNELS = { bar: 'Bar', floor: 'Floor', arcade: 'Arcade', race: 'Duck Pond', slots: 'Slots', alley: 'Alley', vip: 'VIP Lounge', rest: 'Restrooms' }
export const MOVE_BUDGET = 8 // moves per window, per guild
export const MOVE_WINDOW_MS = 10_000

const PHASES = new Set(['lobby', 'pick', 'play', 'meeting', 'over'])
const LOBBY_PHASES = new Set(['lobby', 'pick', 'over'])

export const TEXT = {
  notSetUp: 'The Discord bot is not set up on this server.',
  offline: 'The Discord bot is offline right now.',
  badRoom: 'Bad room code.',
  badVersion: 'This Discord bot speaks protocol v1.',
  full: 'Too many Last Call rooms are using Discord right now.',
  setupFailed: 'Could not create the Discord voice channels.',
  badCode: "That code isn't live. Check the code on your game screen.",
  notLinked: "You aren't linked to a Last Call room.",
}

const DEFAULTS = {
  prefix: 'Last Call',
  moveBudget: MOVE_BUDGET,
  moveWindowMs: MOVE_WINDOW_MS,
  debounceMs: 1200, // a room must hold this long during play before its owner is moved
  graceMs: 90_000, // a host reload gets this long to come back
  sweepMs: 30_000, // a closed room re-checks this often whether its channels are empty
  settleMs: 3000, // after a move, give the gateway this long to report it before sending it again
  retryMs: 5000, // after a failed move, wait this long before trying the same channel again
  offlineMs: 5000, // a new room waits this long for Discord before saying it is offline
  setupRetryMs: 15_000,
  maxRooms: 20, // each room holds 12 channels and a guild allows 500
  maxPlayers: 32,
}

export class RoomManager {
  constructor({ adapter = null, now = Date.now, random = Math.random, log = console, ...options } = {}) {
    this.adapter = adapter
    this.now = now
    this.random = random
    this.log = log
    this.opt = { ...DEFAULTS }
    for (const [name, value] of Object.entries(options)) if (value !== undefined) this.opt[name] = value
    this.rooms = new Map() // room code -> room
    this.codes = new Map() // link code -> { room, key }
    this.links = new Map() // Discord user id -> { room, key, user, inVoice }
    this.bound = new WeakMap() // game socket -> room code
    this.queue = new Map() // Discord user id -> channel id; Map order is queue order
    this.inFlight = new Set()
    this.started = [] // start times of the moves inside the current budget window
    this.holds = new Map() // Discord user id -> { channelId, until }: do not send that move again before `until`
    this.orphansAt = null
  }

  // ---- Game socket side ----

  message(client, msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return
    if (msg.t === 'hello') return this.hello(client, msg)
    const room = this.roomOf(client)
    if (!room) return // nothing before hello, and nothing from a replaced socket
    if (msg.t === 'roster') this.roster(room, msg.players)
    else if (msg.t === 'state') this.state(room, msg.phase, msg.players)
    else if (msg.t === 'bye') this.closeRoom(room)
  }

  disconnect(client) {
    const room = this.roomOf(client)
    this.bound.delete(client)
    if (!room) return
    room.client = null
    room.closedAt = this.now()
    this.log.info(`Room ${room.code}: host disconnected, keeping it for ${this.opt.graceMs / 1000} s.`)
  }

  roomOf(client) {
    const room = this.rooms.get(this.bound.get(client))
    return room?.client === client ? room : null
  }

  hello(client, { room: raw, v = 1 }) {
    if (!this.adapter) return client.send({ t: 'error', why: TEXT.notSetUp })
    if (v !== 1) return client.send({ t: 'error', why: TEXT.badVersion })
    const code = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
    if (!/^[A-Z]{4}$/.test(code)) return client.send({ t: 'error', why: TEXT.badRoom })
    if (this.bound.get(client) !== code) this.disconnect(client) // the socket switched rooms
    let room = this.rooms.get(code)
    if (!room) {
      if (this.rooms.size >= this.opt.maxRooms) return client.send({ t: 'error', why: TEXT.full })
      room = this.newRoom(code)
      this.rooms.set(code, room)
    }
    if (room.client && room.client !== client) {
      this.bound.delete(room.client)
      room.client.close?.(4000, 'Replaced by a newer connection')
    }
    if (room.closing) this.reopen(room)
    Object.assign(room, { client, closedAt: null, helloAt: this.now(), readySent: false, errors: new Set(), lastCodes: null })
    this.bound.set(client, code)
    this.log.info(`Room ${code}: host connected.`)
    this.setup(room)
    this.resync(room)
  }

  newRoom(code) {
    return {
      code, client: null, helloAt: 0, closedAt: null, closing: false, deleting: false, nextSweepAt: 0, claimed: false,
      channels: null, setupPending: false, setupRetryAt: 0, readySent: false, errors: new Set(), lastCodes: null,
      ops: Promise.resolve(), roster: new Map(), keyCodes: new Map(), keyUsers: new Map(), phase: 'lobby', players: new Map(),
    }
  }

  reopen(room) {
    room.closing = false
    if (room.deleting) room.channels = null // set up again once the running delete finishes
  }

  // Everything a reconnecting host needs to rebuild its Discord panel.
  resync(room) {
    if (room.roster.size) this.sendCodes(room)
    for (const userId of room.keyUsers.values()) {
      const link = this.links.get(userId)
      this.send(room, { t: 'linked', key: link.key, user: link.user })
      if (link.inVoice !== null) this.send(room, { t: 'voice', key: link.key, inVoice: link.inVoice })
    }
  }

  roster(room, players) {
    if (!Array.isArray(players)) return
    const next = new Map()
    for (const p of players.slice(0, this.opt.maxPlayers)) if (validKey(p?.key)) next.set(p.key, cleanName(p.name))
    const old = room.roster
    room.roster = next
    for (const key of old.keys()) if (!next.has(key)) this.dropKey(room, key)
    for (const key of next.keys()) if (!room.keyUsers.has(key) && !room.keyCodes.has(key)) this.giveCode(room, key)
    this.sendCodes(room)
  }

  state(room, phase, players) {
    if (!PHASES.has(phase) || !Array.isArray(players)) return
    const now = this.now()
    const fresh = phase !== room.phase // a phase change settles everyone at once
    room.phase = phase
    const next = new Map()
    for (const p of players.slice(0, this.opt.maxPlayers)) {
      if (!validKey(p?.key)) continue
      const where = typeof p.room === 'string' && Object.hasOwn(ROOM_CHANNELS, p.room) ? p.room : null
      const entry = (!fresh && room.players.get(p.key)) || { room: where, since: now, settled: where }
      if (entry.room !== where) Object.assign(entry, { room: where, since: now })
      entry.alive = p.alive !== false
      next.set(p.key, entry)
    }
    room.players = next
    this.settle(room)
    this.sync()
  }

  // Debounce: during play a player's room only counts once it has held for debounceMs.
  settle(room) {
    const now = this.now()
    for (const p of room.players.values()) {
      if (p.settled !== p.room && now - p.since >= this.opt.debounceMs) p.settled = p.room
    }
  }

  target(room, key) {
    if (LOBBY_PHASES.has(room.phase)) return 'Lobby'
    const p = room.players.get(key)
    if (!p) return null
    if (!p.alive) return 'Ghosts'
    if (room.phase === 'meeting') return 'Meeting'
    return p.settled ? ROOM_CHANNELS[p.settled] : null // null: leave them where they are
  }

  // ---- Discord side ----

  link(userId, text) {
    const entry = this.codes.get(String(text ?? '').trim())
    const room = entry && this.rooms.get(entry.room)
    if (!room || room.closing) return { ok: false, text: TEXT.badCode }
    this.dropLink(userId) // one key per Discord user: a new link replaces the old one
    const { key } = entry
    this.codes.delete(room.keyCodes.get(key))
    room.keyCodes.delete(key)
    const link = { room: room.code, key, user: this.adapter.displayName(userId), inVoice: null }
    this.links.set(userId, link)
    room.keyUsers.set(key, userId)
    this.log.info(`Room ${room.code}: ${link.user} linked as ${room.roster.get(key)}.`)
    this.send(room, { t: 'linked', key, user: link.user })
    this.sendCodes(room)
    const current = this.adapter.memberVoiceChannel(userId)
    this.reportVoice(room, link, current !== null)
    if (current !== null && room.channels) this.want(room, userId, current, this.target(room, key) ?? 'Lobby')
    this.pump()
    return { ok: true, text: `Linked: you are ${room.roster.get(key)} in Last Call room ${room.code}. Join the "${this.lobbyName(room.code)}" voice channel.` }
  }

  unlink(userId) {
    const link = this.dropLink(userId)
    if (!link) return { ok: false, text: TEXT.notLinked }
    return { ok: true, text: `Unlinked from Last Call room ${link.room}. The bot will stop moving you.` }
  }

  voiceChanged(userId) {
    this.holds.delete(userId)
    if (this.links.has(userId)) this.sync()
  }

  // ---- Time ----

  tick() {
    if (!this.adapter) return
    const now = this.now()
    for (const [userId, hold] of this.holds) if (now >= hold.until) this.holds.delete(userId)
    if (this.adapter.ready && this.orphansAt === null) this.orphansAt = now + this.opt.graceMs
    if (this.adapter.ready && now >= (this.orphansAt ?? Infinity)) {
      this.orphansAt = Infinity
      this.adoptOrphans()
    }
    for (const room of [...this.rooms.values()]) {
      if (room.closing) this.sweep(room)
      else if (!room.client && room.closedAt !== null && now - room.closedAt >= this.opt.graceMs) this.closeRoom(room)
      else {
        this.settle(room)
        this.setup(room)
      }
    }
    this.sync()
  }

  // ---- Status ----

  discordStatus() {
    return this.adapter?.ready ? 'connected' : 'disconnected'
  }

  liveRooms() {
    let count = 0
    for (const room of this.rooms.values()) if (!room.closing) count++
    return count
  }

  // ---- Internals ----

  setup(room) {
    const a = this.adapter
    if (!room.client || room.closing) return
    if (!a.ready) {
      if (!room.readySent && this.now() - room.helloAt >= this.opt.offlineMs) this.error(room, TEXT.offline)
      return
    }
    const missing = a.missingPermissions()
    if (missing.length) return this.error(room, missingText(missing, a.guildName()))
    if (!room.channels) return this.ensure(room)
    if (room.readySent) return
    room.readySent = true
    this.send(room, { t: 'ready', guild: a.guildName(), lobby: this.lobbyName(room.code) })
  }

  ensure(room) {
    if (room.setupPending || this.now() < room.setupRetryAt) return
    room.setupPending = true
    room.claimed = true // from here on the room may own channels in Discord
    this.op(room, async () => {
      try {
        room.channels = await this.adapter.ensureChannels(room.code, CHANNEL_NAMES)
      } catch (err) {
        this.log.error(`Room ${room.code}: could not set up channels: ${err?.message ?? err}`)
        room.setupRetryAt = this.now() + this.opt.setupRetryMs
        this.error(room, TEXT.setupFailed)
      } finally {
        room.setupPending = false
      }
      this.setup(room)
      this.sync()
    })
  }

  // Channel work for one room runs in order, so a reopened room never races its own delete.
  op(room, fn) {
    room.ops = room.ops.then(fn).catch(err => this.log.error(`Room ${room.code}: ${err?.message ?? err}`))
  }

  closeRoom(room) {
    if (room.client) this.bound.delete(room.client)
    room.client = null
    room.closing = true
    const lobby = room.channels?.Lobby
    const ours = new Set(Object.values(room.channels ?? {}))
    for (const userId of room.keyUsers.values()) {
      this.links.delete(userId)
      this.queue.delete(userId)
      const current = this.adapter.memberVoiceChannel(userId)
      if (lobby && current !== lobby && ours.has(current)) this.queue.set(userId, lobby)
    }
    for (const code of room.keyCodes.values()) this.codes.delete(code)
    for (const map of [room.roster, room.keyCodes, room.keyUsers, room.players]) map.clear()
    room.phase = 'lobby'
    this.log.info(`Room ${room.code}: closed.`)
    if (!room.claimed) return void this.rooms.delete(room.code) // never reached Discord: nothing to clean up
    room.nextSweepAt = this.now()
    this.sweep(room)
    this.pump()
  }

  sweep(room) {
    const now = this.now()
    if (room.deleting || now < room.nextSweepAt) return
    room.nextSweepAt = now + this.opt.sweepMs
    if (!this.adapter.ready || this.adapter.membersIn(room.code) > 0) return
    room.deleting = true
    this.op(room, async () => {
      try {
        await this.adapter.deleteChannels(room.code)
        room.channels = null
        if (room.closing) this.rooms.delete(room.code) // otherwise a hello reopened it meanwhile
        this.log.info(`Room ${room.code}: channels deleted.`)
      } finally {
        room.deleting = false
      }
    })
  }

  // Categories an earlier run left behind (bot restart) that no host reclaimed in time.
  adoptOrphans() {
    for (const code of this.adapter.existingRooms()) {
      if (this.rooms.has(code)) continue
      const room = this.newRoom(code)
      room.closing = true
      room.claimed = true
      this.rooms.set(code, room)
      this.sweep(room)
    }
  }

  sync() {
    this.reconcile()
    this.pump()
  }

  reconcile() {
    if (!this.adapter?.ready) return
    for (const [userId, link] of this.links) {
      const room = this.rooms.get(link.room)
      const current = this.adapter.memberVoiceChannel(userId)
      this.reportVoice(room, link, current !== null)
      if (current === null) {
        this.queue.delete(userId) // never pull anyone into voice
        continue
      }
      const name = room.channels && this.target(room, link.key)
      if (name) this.want(room, userId, current, name)
    }
  }

  want(room, userId, current, name) {
    const id = room.channels[name]
    if (!this.adapter.hasChannel(id)) return this.ensure(room) // deleted by hand: recreate it now that it is needed
    if (current === id || this.held(userId, id)) return void this.queue.delete(userId)
    this.queue.set(userId, id) // replaces any older target but keeps the user's place in line
  }

  pump() {
    const a = this.adapter
    if (!a?.ready || a.missingPermissions().length) return
    const now = this.now()
    this.started = this.started.filter(at => now - at < this.opt.moveWindowMs)
    for (const [userId, channelId] of this.queue) {
      if (this.started.length >= this.opt.moveBudget) return
      if (this.inFlight.has(userId)) continue
      this.queue.delete(userId)
      const current = a.memberVoiceChannel(userId)
      if (current === null || current === channelId || !a.hasChannel(channelId) || this.held(userId, channelId)) continue
      this.started.push(now)
      this.move(userId, channelId)
    }
  }

  move(userId, channelId) {
    this.inFlight.add(userId)
    new Promise(resolve => resolve(this.adapter.moveMember(userId, channelId)))
      .then(
        () => this.hold(userId, channelId, this.opt.settleMs),
        err => {
          this.log.warn(`Could not move Discord user ${userId}: ${err?.message ?? err}`)
          this.hold(userId, channelId, this.opt.retryMs)
        },
      )
      .finally(() => {
        this.inFlight.delete(userId)
        this.sync()
      })
      .catch(err => this.log.error(`Move bookkeeping failed: ${err?.message ?? err}`))
  }

  hold(userId, channelId, ms) {
    this.holds.set(userId, { channelId, until: this.now() + ms })
  }

  held(userId, channelId) {
    const hold = this.holds.get(userId)
    return hold?.channelId === channelId && this.now() < hold.until
  }

  dropKey(room, key) {
    const code = room.keyCodes.get(key)
    if (code) this.codes.delete(code)
    room.keyCodes.delete(key)
    const userId = room.keyUsers.get(key)
    if (userId) this.dropLink(userId)
  }

  dropLink(userId) {
    const link = this.links.get(userId)
    if (!link) return null
    this.links.delete(userId)
    this.queue.delete(userId)
    const room = this.rooms.get(link.room)
    room.keyUsers.delete(link.key)
    this.log.info(`Room ${room.code}: ${link.user} unlinked.`)
    this.send(room, { t: 'unlinked', key: link.key })
    if (room.roster.has(link.key)) {
      this.giveCode(room, link.key)
      this.sendCodes(room)
    }
    return link
  }

  giveCode(room, key) {
    const code = this.freshCode()
    room.keyCodes.set(key, code)
    this.codes.set(code, { room: room.code, key })
  }

  freshCode() {
    for (let i = 0; i < 50; i++) {
      const code = String(1000 + Math.floor(this.random() * 9000))
      if (!this.codes.has(code)) return code
    }
    for (let n = 1000; n < 10_000; n++) if (!this.codes.has(String(n))) return String(n)
    throw new Error('Out of link codes')
  }

  sendCodes(room) {
    const codes = Object.fromEntries(room.keyCodes)
    const json = JSON.stringify(codes)
    if (json === room.lastCodes) return
    room.lastCodes = json
    this.send(room, { t: 'codes', codes })
  }

  reportVoice(room, link, inVoice) {
    if (link.inVoice === inVoice) return
    link.inVoice = inVoice
    this.send(room, { t: 'voice', key: link.key, inVoice })
  }

  error(room, why) {
    if (room.errors.has(why)) return
    room.errors.add(why)
    this.send(room, { t: 'error', why })
  }

  send(room, msg) {
    room.client?.send(msg)
  }

  lobbyName(code) {
    return `${this.opt.prefix} ${code} / Lobby`
  }
}

function validKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 64
}

function cleanName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 32) || 'Player'
}

function missingText(missing, guild) {
  return missing.length === 1
    ? `The Discord bot needs the ${missing[0]} permission in ${guild}.`
    : `The Discord bot needs these permissions in ${guild}: ${missing.join(', ')}.`
}

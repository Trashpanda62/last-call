// Stands in for discord-adapter.js in tests: records what the RoomManager asks for, and lets a test
// act as Discord users (joining and leaving voice) and as server admins (deleting channels).
// It lives outside test/ so `node --test` does not count it as a test file.
export class FakeAdapter {
  constructor({ ready = true, guild = 'Test Guild' } = {}) {
    this.ready = ready
    this.guild = guild
    this.missing = [] // permission names the bot lacks
    this.channels = new Map() // channel id -> { room, name }
    this.voice = new Map() // user id -> channel id
    this.names = new Map() // user id -> display name
    this.created = [] // 'ROOM/Name' for each channel created
    this.deleted = [] // room codes whose channels were deleted
    this.moves = [] // { user, to: 'ROOM/Name' } in request order
    this.hold = false // true: moves stay in flight until release()
    this.held = []
    this.manager = null
    this.nextId = 1
  }

  attach(manager) {
    this.manager = manager
  }

  guildName() {
    return this.guild
  }

  missingPermissions() {
    return [...this.missing]
  }

  async ensureChannels(room, names) {
    return Object.fromEntries(names.map(name => [name, this.find(room, name) ?? this.create(room, name)]))
  }

  async deleteChannels(room) {
    for (const [id, channel] of this.channels) if (channel.room === room) this.channels.delete(id)
    this.deleted.push(room)
  }

  existingRooms() {
    return [...new Set([...this.channels.values()].map(channel => channel.room))]
  }

  membersIn(room) {
    return [...this.voice.values()].filter(id => this.channels.get(id)?.room === room).length
  }

  hasChannel(id) {
    return this.channels.has(id)
  }

  memberVoiceChannel(user) {
    return this.voice.get(user) ?? null
  }

  displayName(user) {
    return this.names.get(user) ?? `Discord ${user}`
  }

  moveMember(user, channelId) {
    this.moves.push({ user, to: this.label(channelId) })
    const finish = () => this.setVoice(user, channelId)
    if (!this.hold) return Promise.resolve().then(finish) // Discord reports the move a moment later
    return new Promise(resolve => this.held.push(() => {
      finish()
      resolve()
    }))
  }

  release() {
    for (const done of this.held.splice(0)) done()
  }

  // ---- Test helpers ----

  find(room, name) {
    for (const [id, channel] of this.channels) if (channel.room === room && channel.name === name) return id
    return undefined
  }

  create(room, name) {
    const id = `ch${this.nextId++}`
    this.channels.set(id, { room, name })
    this.created.push(`${room}/${name}`)
    return id
  }

  label(id) {
    const channel = this.channels.get(id)
    return channel ? `${channel.room}/${channel.name}` : id
  }

  where(user) {
    return this.voice.has(user) ? this.label(this.voice.get(user)) : null
  }

  setVoice(user, channelId) {
    if (channelId) this.voice.set(user, channelId)
    else this.voice.delete(user)
    this.manager?.voiceChanged(user, channelId ?? null)
  }

  join(user, room, name) {
    this.setVoice(user, this.find(room, name))
  }

  joinOther(user) {
    this.setVoice(user, 'general') // a voice channel that is not part of Last Call
  }

  leave(user) {
    this.setVoice(user, null)
  }

  deleteByHand(room, name) {
    const id = this.find(room, name)
    this.channels.delete(id)
    for (const [user, at] of this.voice) if (at === id) this.leave(user) // Discord drops everyone in a deleted channel
  }
}

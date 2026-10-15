// discord-adapter.js against a hand-made guild (discord.js Collections, no network), to check the
// channel bookkeeping that the FakeAdapter stands in for everywhere else.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ChannelType, Collection, PermissionFlagsBits } from 'discord.js'
import { COMMAND, DiscordAdapter, PERMISSIONS, inviteUrl } from '../discord-adapter.js'
import { CHANNEL_NAMES } from '../rooms.js'

function mockGuild({ granted = Object.values(PermissionFlagsBits) } = {}) {
  let nextId = 100
  const channels = new Collection()
  const guild = {
    id: 'g1',
    name: 'Test Guild',
    available: true,
    edits: [],
    channels: {
      cache: channels,
      async create({ name, type, parent = null }) {
        const channel = { id: String(nextId++), name, type, parentId: parent, async delete() { channels.delete(this.id) } }
        channels.set(channel.id, channel)
        return channel
      },
    },
    voiceStates: { cache: new Collection() },
    members: {
      cache: new Collection([['u1', { displayName: 'Stevo' }]]),
      me: { permissions: { has: bit => granted.includes(bit) } },
      async edit(userId, { channel }) { guild.edits.push([userId, channel]) },
    },
  }
  return guild
}

function adapterWith(guild, prefix) {
  const adapter = new DiscordAdapter({ token: 'unused', prefix })
  adapter.guild = guild
  return adapter
}

test('invite link asks for exactly View Channels, Manage Channels, Move Members and Connect', () => {
  assert.equal(PERMISSIONS, 17826832n)
  assert.equal(inviteUrl('42'), 'https://discord.com/oauth2/authorize?client_id=42&scope=bot+applications.commands&permissions=17826832')
})

test('one /lastcall command with link code:<4 chars> and unlink', () => {
  const json = COMMAND.toJSON()
  assert.equal(json.name, 'lastcall')
  const [link, unlink] = json.options
  assert.equal(link.name, 'link')
  assert.deepEqual(link.options.map(o => [o.name, o.required, o.min_length, o.max_length]), [['code', true, 4, 4]])
  assert.equal(unlink.name, 'unlink')
})

test('ensureChannels creates a category with the voice channels once, then reuses them', async () => {
  const guild = mockGuild()
  const adapter = adapterWith(guild)
  const ids = await adapter.ensureChannels('ABCD', CHANNEL_NAMES)
  const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory)
  assert.equal(category.name, 'Last Call ABCD')
  for (const name of CHANNEL_NAMES) {
    const channel = guild.channels.cache.get(ids[name])
    assert.deepEqual([channel.name, channel.type, channel.parentId], [name, ChannelType.GuildVoice, category.id])
  }
  assert.equal(guild.channels.cache.size, 12)
  guild.channels.cache.delete(ids.Bar) // deleted by hand
  const again = await adapter.ensureChannels('ABCD', CHANNEL_NAMES)
  assert.equal(guild.channels.cache.size, 12)
  assert.notEqual(again.Bar, ids.Bar)
  assert.equal(again.Lobby, ids.Lobby)
})

test('existingRooms, membersIn, moves and voice lookups', async () => {
  const guild = mockGuild()
  const adapter = adapterWith(guild, 'LC')
  const ids = await adapter.ensureChannels('WXYZ', CHANNEL_NAMES)
  await guild.channels.create({ name: 'LC nope', type: ChannelType.GuildCategory })
  await guild.channels.create({ name: 'Other ABCD', type: ChannelType.GuildCategory })
  assert.deepEqual(adapter.existingRooms(), ['WXYZ'])
  const general = await guild.channels.create({ name: 'General', type: ChannelType.GuildVoice })
  guild.voiceStates.cache.set('u1', { channelId: ids.Bar })
  guild.voiceStates.cache.set('u2', { channelId: general.id })
  guild.voiceStates.cache.set('u3', { channelId: null })
  assert.equal(adapter.membersIn('WXYZ'), 1)
  assert.equal(adapter.membersIn('QQQQ'), 0)
  assert.equal(adapter.memberVoiceChannel('u1'), ids.Bar)
  assert.equal(adapter.memberVoiceChannel('u3'), null)
  assert.equal(adapter.memberVoiceChannel('nobody'), null)
  assert.equal(adapter.hasChannel(ids.Lobby), true)
  assert.equal(adapter.hasChannel('missing'), false)
  assert.equal(adapter.displayName('u1'), 'Stevo')
  await adapter.moveMember('u1', ids.Lobby)
  assert.deepEqual(guild.edits, [['u1', ids.Lobby]])
})

test('deleteChannels removes our channels and the category, but keeps a category someone added to', async () => {
  const guild = mockGuild()
  const adapter = adapterWith(guild)
  await adapter.ensureChannels('ABCD', CHANNEL_NAMES)
  await adapter.ensureChannels('WXYZ', CHANNEL_NAMES)
  await adapter.deleteChannels('ABCD')
  assert.deepEqual(adapter.existingRooms(), ['WXYZ'])
  assert.equal(guild.channels.cache.size, 12)
  const wxyz = adapter.category('WXYZ')
  await guild.channels.create({ name: 'notes', type: ChannelType.GuildText, parent: wxyz.id })
  await adapter.deleteChannels('WXYZ')
  assert.deepEqual(guild.channels.cache.map(c => c.name), ['Last Call WXYZ', 'notes'])
  await adapter.deleteChannels('NONE') // nothing there: no error
})

test('missing permissions are named, and nothing is ready without a guild or a login', () => {
  const guild = mockGuild({ granted: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] })
  assert.deepEqual(adapterWith(guild).missingPermissions(), ['Manage Channels', 'Move Members'])
  const lonely = new DiscordAdapter({ token: 'unused' })
  assert.equal(lonely.ready, false)
  assert.deepEqual(lonely.missingPermissions(), ['View Channels', 'Manage Channels', 'Move Members', 'Connect'])
  assert.equal(lonely.memberVoiceChannel('u1'), null)
  assert.equal(lonely.hasChannel('x'), false)
  assert.equal(lonely.displayName('u1'), 'Discord user')
})

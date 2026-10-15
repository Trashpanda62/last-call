// The only file that imports discord.js. It carries out the RoomManager's requests in one guild
// and routes /lastcall commands and voice state changes back to it.
import { ChannelType, Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, Status } from 'discord.js'
import { CHANNEL_NAMES } from './rooms.js'

const NEEDED = [
  ['View Channels', PermissionFlagsBits.ViewChannel],
  ['Manage Channels', PermissionFlagsBits.ManageChannels],
  ['Move Members', PermissionFlagsBits.MoveMembers],
  ['Connect', PermissionFlagsBits.Connect],
]
export const PERMISSIONS = NEEDED.reduce((bits, [, bit]) => bits | bit, 0n) // 17826832
const ROOM_CODE = /^[A-Z]{4}$/
const REASON = 'Last Call voice'
const LOGIN_RETRY_MS = 30_000

export const COMMAND = new SlashCommandBuilder()
  .setName('lastcall')
  .setDescription('Last Call voice chat')
  .addSubcommand(sub => sub
    .setName('link')
    .setDescription('Link your Discord voice to your player in a Last Call game')
    .addStringOption(opt => opt
      .setName('code')
      .setDescription('The 4-digit code next to your name on the game screen')
      .setRequired(true)
      .setMinLength(4)
      .setMaxLength(4)))
  .addSubcommand(sub => sub
    .setName('unlink')
    .setDescription('Stop the bot from moving you between voice channels'))

export function inviteUrl(appId) {
  return `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot+applications.commands&permissions=${PERMISSIONS}`
}

export class DiscordAdapter {
  constructor({ token, guildId = '', prefix = 'Last Call', log = console }) {
    this.token = token
    this.guildId = guildId
    this.prefix = prefix
    this.log = log
    this.guild = null
    this.manager = null
    this.client = null
  }

  attach(manager) {
    this.manager = manager
  }

  // A failed login destroys the discord.js client for good, so every attempt gets a new one.
  async login() {
    const client = this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] })
    client.once(Events.ClientReady, () => this.onReady())
    client.on(Events.GuildCreate, guild => this.onGuildCreate(guild))
    client.on(Events.GuildDelete, guild => this.onGuildDelete(guild))
    client.on(Events.VoiceStateUpdate, (before, after) => this.onVoice(before, after))
    client.on(Events.InteractionCreate, interaction => this.onInteraction(interaction))
    client.on(Events.ShardDisconnect, ({ code }) => this.log.error(`Discord: disconnected for good (close code ${code}). Fix the cause and restart.`))
    client.on(Events.Error, err => this.log.error(`Discord: ${err.message}`))
    try {
      await client.login(this.token)
    } catch (err) {
      this.log.error(`Discord: login failed: ${err.message}`)
      if (err.code === 'TokenInvalid') {
        this.log.error('Discord: DISCORD_TOKEN is wrong. Copy a fresh one from the Bot page of the Developer Portal.')
        return
      }
      this.log.info(`Discord: trying again in ${LOGIN_RETRY_MS / 1000} s.`)
      setTimeout(() => this.login(), LOGIN_RETRY_MS).unref()
    }
  }

  destroy() {
    return this.client?.destroy()
  }

  // Connected (not mid-reconnect) and managing a guild.
  get ready() {
    const { client, guild } = this
    return Boolean(guild?.available && client?.isReady() && client.ws.shards.every(shard => shard.status === Status.Ready))
  }

  // ---- Events ----

  onReady() {
    this.log.info(`Discord: logged in as ${this.client.user.tag}.`)
    this.log.info(`Discord: invite link: ${inviteUrl(this.client.application.id)}`)
    this.pickGuild()
  }

  pickGuild() {
    const guilds = this.client.guilds.cache
    const guild = this.guildId ? guilds.get(this.guildId) : guilds.first()
    if (!guild) {
      this.log.warn(this.guildId
        ? `Discord: the bot is not in server ${this.guildId}. Add it with the invite link.`
        : 'Discord: the bot is not in any server yet. Add it with the invite link.')
      return
    }
    if (!this.guildId && guilds.size > 1) this.log.warn(`Discord: the bot is in ${guilds.size} servers. Set DISCORD_GUILD_ID to pick one; using "${guild.name}".`)
    this.guild = guild
    this.log.info(`Discord: managing voice in "${guild.name}" (${guild.id}).`)
    guild.commands.set([COMMAND.toJSON()]).then(
      () => this.log.info('Discord: /lastcall is registered.'),
      err => this.log.error(`Discord: could not register /lastcall (${err.message}). Re-invite the bot with the invite link.`),
    )
    this.manager?.tick()
  }

  onGuildCreate(guild) {
    if (!this.guild && (!this.guildId || guild.id === this.guildId)) this.pickGuild()
  }

  onGuildDelete(guild) {
    if (guild.id !== this.guild?.id) return
    this.guild = null
    this.log.warn(`Discord: the bot was removed from "${guild.name}".`)
  }

  onVoice(before, after) {
    if (after.guild.id !== this.guild?.id || before.channelId === after.channelId) return
    this.manager?.voiceChanged(after.id, after.channelId)
  }

  async onInteraction(interaction) {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'lastcall') return
    const { manager } = this
    let text
    if (!manager || interaction.guildId !== this.guild?.id) text = 'This bot runs Last Call voice in a different server.'
    else if (interaction.options.getSubcommand() === 'link') text = manager.link(interaction.user.id, interaction.options.getString('code', true)).text
    else text = manager.unlink(interaction.user.id).text
    try {
      await interaction.reply({ content: text, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })
    } catch (err) {
      this.log.error(`Discord: could not answer /lastcall: ${err.message}`)
    }
  }

  // ---- What the RoomManager calls ----

  guildName() {
    return this.guild?.name ?? 'Discord'
  }

  missingPermissions() {
    const me = this.guild?.members.me
    return NEEDED.filter(([, bit]) => !me?.permissions.has(bit)).map(([name]) => name)
  }

  async ensureChannels(roomCode, names) {
    const { channels } = this.guild
    const category = this.category(roomCode)
      ?? await channels.create({ name: this.categoryName(roomCode), type: ChannelType.GuildCategory, reason: REASON })
    const ids = {}
    for (const name of names) {
      const found = this.voiceChannels(category).find(channel => channel.name === name)
      ids[name] = (found ?? await channels.create({ name, type: ChannelType.GuildVoice, parent: category.id, reason: REASON })).id
    }
    return ids
  }

  async deleteChannels(roomCode) {
    const category = this.category(roomCode)
    if (!category) return
    for (const channel of this.voiceChannels(category).values()) {
      if (CHANNEL_NAMES.includes(channel.name)) await channel.delete(REASON)
    }
    // A channel someone added by hand keeps the category alive.
    if (!this.guild.channels.cache.some(channel => channel.parentId === category.id)) await category.delete(REASON)
  }

  existingRooms() {
    const head = `${this.prefix} `
    return this.guild.channels.cache
      .filter(c => c.type === ChannelType.GuildCategory && c.name.startsWith(head) && ROOM_CODE.test(c.name.slice(head.length)))
      .map(c => c.name.slice(head.length))
  }

  membersIn(roomCode) {
    const category = this.category(roomCode)
    if (!category) return 0
    const { channels, voiceStates } = this.guild
    return voiceStates.cache.filter(state => channels.cache.get(state.channelId)?.parentId === category.id).size
  }

  hasChannel(id) {
    return Boolean(id && this.guild?.channels.cache.has(id))
  }

  moveMember(userId, channelId) {
    return this.guild.members.edit(userId, { channel: channelId, reason: REASON })
  }

  memberVoiceChannel(userId) {
    return this.guild?.voiceStates.cache.get(userId)?.channelId ?? null
  }

  displayName(userId) {
    return this.guild?.members.cache.get(userId)?.displayName ?? this.client?.users.cache.get(userId)?.displayName ?? 'Discord user'
  }

  // ---- Helpers ----

  categoryName(roomCode) {
    return `${this.prefix} ${roomCode}`
  }

  category(roomCode) {
    const name = this.categoryName(roomCode)
    return this.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name)
  }

  voiceChannels(category) {
    return this.guild.channels.cache.filter(c => c.parentId === category.id && c.type === ChannelType.GuildVoice)
  }
}

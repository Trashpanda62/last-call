// HTTP + WebSocket front door. The game host connects to /discord (nginx proxies https://host/discord
// here) and GET /health reports status. Run directly, it wires the RoomManager to Discord.
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'
import { RoomManager } from './rooms.js'

const TICK_MS = 250
const PING_MS = 30_000 // finds dead hosts, and keeps proxies from closing a quiet lobby socket
const WS_PATHS = new Set(['/discord', '/discord/'])

// What the RoomManager sees of a game socket. Sending to a closed socket is a no-op.
export function wrapSocket(ws) {
  return {
    send(msg) {
      if (ws.readyState !== WebSocket.OPEN) return
      try {
        ws.send(JSON.stringify(msg))
      } catch {
        // closed under us; the close handler cleans up
      }
    },
    close(code, reason) {
      try {
        ws.close(code, reason)
      } catch {
        // already closed
      }
    },
  }
}

function parse(data) {
  try {
    return JSON.parse(data.toString())
  } catch {
    return null
  }
}

function pathOf(req) {
  return new URL(req.url ?? '/', 'http://localhost').pathname
}

function guard(what, fn) {
  try {
    fn()
  } catch (err) {
    console.error(`${what} failed:`, err)
  }
}

export function startServer({ manager, port = 3170, host } = {}) {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && pathOf(req) === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: true, discord: manager.discordStatus(), rooms: manager.liveRooms() }))
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('Not found')
  })

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    if (!WS_PATHS.has(pathOf(req))) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      return
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
  })

  wss.on('connection', ws => {
    const client = wrapSocket(ws)
    ws.alive = true
    ws.on('pong', () => { ws.alive = true })
    ws.on('message', (data, isBinary) => {
      const msg = isBinary ? null : parse(data)
      if (msg) guard('Message', () => manager.message(client, msg))
    })
    ws.on('close', () => guard('Disconnect', () => manager.disconnect(client)))
    ws.on('error', () => {}) // 'close' follows; an unhandled 'error' would crash the process
  })

  const tick = setInterval(() => guard('Tick', () => manager.tick()), TICK_MS)
  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) {
        ws.terminate()
        continue
      }
      ws.alive = false
      ws.ping()
    }
  }, PING_MS)

  const listening = new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  server.listen(port, host)

  return {
    listening,
    port: () => server.address().port,
    async close() {
      clearInterval(tick)
      clearInterval(ping)
      for (const ws of wss.clients) ws.terminate()
      wss.close()
      await new Promise(resolve => server.close(resolve))
    },
  }
}

async function main() {
  const env = process.env
  const prefix = env.CHANNEL_PREFIX?.trim() || 'Last Call'
  const token = env.DISCORD_TOKEN?.trim()
  let adapter = null
  if (token) {
    const { DiscordAdapter } = await import('./discord-adapter.js')
    adapter = new DiscordAdapter({ token, guildId: env.DISCORD_GUILD_ID?.trim(), prefix })
  } else {
    console.warn('DISCORD_TOKEN is not set: every game will be told Discord voice is not set up. See README.md.')
  }
  const manager = new RoomManager({ adapter, prefix })
  adapter?.attach(manager)
  const app = startServer({ manager, port: Number(env.PORT) || 3170 })
  await app.listening
  console.log(`Last Call Discord voice: listening on port ${app.port()} (WebSocket /discord, GET /health).`)
  adapter?.login()
  const stop = async () => {
    await app.close()
    await adapter?.destroy()
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

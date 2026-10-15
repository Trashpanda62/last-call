# Last Call: Discord voice bot

Discord proximity chat for Last Call, done per room. Each game room gets a Discord category
("Last Call ABCD") with one voice channel per casino room. Players link their Discord account to
their player with a 4-digit code, and the bot moves them into the voice channel of the room they
are standing in.

This is proximity by room, not by distance. Everyone in the Bar channel hears everyone else in the
Bar at full volume, and nobody hears through a wall. Discord's distance-based voice exists only for
native games (its Social SDK), not for browser games. When this bot is not set up, the game falls
back to its own in-browser voice.

Where players go:

- Lobby, character pick and game over: everyone in Lobby.
- Meeting: the living in Meeting, the dead in Ghosts.
- Play: the dead in Ghosts, the living in their room's channel (Bar, Floor, Arcade, Duck Pond,
  Slots, Alley, VIP Lounge, Restrooms). Someone between rooms stays where they are.

Worth knowing:

- During play a player is moved only after 1.2 s in a new room, so walking through a doorway does
  not bounce them. Deaths and phase changes move people at once.
- The bot never pulls anyone into voice. Players join a voice channel themselves; the bot only moves
  people who are already connected somewhere in the server.
- Discord rate-limits moves, so the bot makes at most 8 moves per 10 s (MOVE_BUDGET in rooms.js).
  With 10 players, sorting everyone into a meeting takes about 10 s; with a full room of 32 it takes about 30 s
  (8 moves at once, then 8 more every 10 s), and the same again to send everyone back to their rooms afterwards.
- If the host closes the game, or reloads and is not back within 90 s, linked players are gathered
  in Lobby and unlinked. The room's channels are deleted once nobody is in them (checked every 30 s).
- At most 20 rooms at once (each uses 12 of a server's 500 channels).

## For players

1. Join the "Last Call ABCD / Lobby" voice channel (ABCD is the room code).
2. Type `/lastcall link code:1234` with the code shown next to your name in the game.
3. `/lastcall unlink` stops the bot from moving you.

## Discord setup (one time)

1. Open https://discord.com/developers/applications, click New Application, name it (say, Last Call).
2. On the Bot page click Reset Token and copy the token. That is `DISCORD_TOKEN`. Keep it secret.
3. Leave every Privileged Gateway Intent off. The bot only uses Guilds and Guild Voice States,
   which are not privileged.
4. Optional: turn off Public Bot so only you can add it to servers.
5. Add the bot to your server: start it once (below) and open the invite link it prints, or build
   the link with the Application ID from the General Information page:
   `https://discord.com/oauth2/authorize?client_id=APPLICATION_ID&scope=bot+applications.commands&permissions=17826832`
   (17826832 = View Channels + Manage Channels + Connect + Move Members, nothing else).
6. If the bot is in more than one server, set `DISCORD_GUILD_ID` (turn on Developer Mode in Discord,
   right-click the server, Copy Server ID).

The bot makes its own categories and channels. If a role change takes one of the four permissions
away, the game gets an error naming the missing permission.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `DISCORD_TOKEN` | none | Bot token. Without it the server still runs and tells every game that Discord voice is not set up. |
| `DISCORD_GUILD_ID` | first server the bot is in | The one server it manages. |
| `PORT` | 3170 | HTTP and WebSocket port. |
| `CHANNEL_PREFIX` | Last Call | Category names are "<prefix> <ROOM>". |

## Run locally

```
cd server/discord-voice
npm install
DISCORD_TOKEN=... node server.js              # Git Bash
$env:DISCORD_TOKEN='...'; node server.js      # PowerShell
npm test
```

`GET http://localhost:3170/health` answers `{"ok":true,"discord":"connected","rooms":0}`.

## Docker on TrueNAS

Copy this folder to the NAS, then from it:

```
cp discord.env.example discord.env    # put the token in it
docker compose up -d --build
docker logs last-call-discord-voice   # shows the invite link
```

`compose.yaml` builds the `Dockerfile` (node:22-alpine, `npm ci --omit=dev`), reads `discord.env`,
restarts unless stopped and publishes port 3170.

nginx in front, so the game can connect to `wss://your-host/discord`:

```
location /discord {
    proxy_pass http://NAS_IP:3170;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## Game protocol (v1)

JSON messages on the WebSocket at `/discord`. The game host is the only client for its room.

Game to bot:

- `{t:'hello', room:'ABCD', v:1}` first. A second hello for the same room from a new socket takes
  over, and the old socket is closed with code 4000.
- `{t:'roster', players:[{key, name}]}` whenever the lobby list changes.
- `{t:'state', phase, players:[{key, room, alive}]}` about twice a second. phase is lobby, pick,
  play, meeting or over; room is bar, floor, arcade, race, slots, alley, vip, rest or null.
- `{t:'bye'}` when the host closes the room on purpose.

Bot to game:

- `{t:'ready', guild, lobby}` once the channels exist; lobby is the full name, "Last Call ABCD / Lobby".
- `{t:'codes', codes:{<key>:'4821'}}` the codes of every unlinked roster key, sent whole whenever
  they change (this can arrive before ready).
- `{t:'linked', key, user}` and `{t:'unlinked', key}`.
- `{t:'voice', key, inVoice}` whether a linked player is connected to voice in the server.
- `{t:'error', why}` short and human readable, each one once per connection. A later ready means
  the problem cleared (Discord reconnected, a permission was granted).

Malformed JSON, unknown message types and anything sent before hello are ignored.

## Files

- `rooms.js`: all the rules (codes, links, targets, debounce, rate limit, cleanup). No discord.js;
  the clock is injected.
- `discord-adapter.js`: the only file that talks to Discord.
- `server.js`: the HTTP and WebSocket server, and startup.
- `test/`: `node --test` runs the rules against a fake adapter (`test-support/`), the adapter
  against a mock guild, and the server over real sockets.

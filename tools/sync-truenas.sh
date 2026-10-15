# Copies this checkout to the dev preview on TrueNAS (Steve, 2026-10-14: "truenas should be hosting the server not this
# pc"): nginx in /mnt/apps/last-call-dev serves site/ at https://10.42.0.37:3161/ (LAN only, caching off; http :3160 forwards there). Only files
# changed since the last copy go over; files gone from the checkout are dropped there one by one. The same nginx serves
# https on 3161 (self-signed: the microphone needs a secure page) and proxies /discord to the voice bot's container.
#   bash tools/sync-truenas.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SITE=/mnt/apps/last-call-dev/site
mkdir -p .dev/truenas
git ls-files -co --exclude-standard | grep -v '^\.dev/' | grep -v '^server/' | LC_ALL=C sort > .dev/truenas/files # (server/: the Discord bot runs in its own container)
STAMP=.dev/truenas/synced
if [ -f "$STAMP" ]; then
  while IFS= read -r f; do [ -f "$f" ] && [ "$f" -nt "$STAMP" ] && echo "$f"; done < .dev/truenas/files > .dev/truenas/changed || true
else cp .dev/truenas/files .dev/truenas/changed; fi
touch .dev/truenas/now
echo "sync-truenas: copying $(wc -l < .dev/truenas/changed) changed files"
[ -s .dev/truenas/changed ] && tar czf - -T .dev/truenas/changed | ssh truenas37 "tar xzf - -C $SITE"
scp -q .dev/truenas/files "truenas37:$SITE/../files.new"
ssh truenas37 "cd $SITE && if [ -f ../files ]; then LC_ALL=C comm -23 <(LC_ALL=C sort ../files) <(LC_ALL=C sort ../files.new) > ../gone; if [ \$(wc -l < ../gone) -le 100 ]; then while IFS= read -r f; do rm -f -- \"\$f\"; done < ../gone; fi; fi; mv ../files.new ../files"
# The Discord voice bot (server/discord-voice) goes over in the same sync: its files when they changed, and the token
# file (discord.env next to it, never committed) when it differs from TrueNAS's; then the bot is rebuilt and restarted.
BOT=server/discord-voice; DST=/mnt/apps/last-call-dev/discord; botchg=0
for f in Dockerfile .dockerignore discord-adapter.js package.json package-lock.json rooms.js server.js discord.env.example; do
  if [ ! -f "$STAMP" ] || [ "$BOT/$f" -nt "$STAMP" ]; then botchg=1; fi
done
if [ "$botchg" = 1 ]; then (cd "$BOT" && tar czf - Dockerfile .dockerignore discord-adapter.js package.json package-lock.json rooms.js server.js discord.env.example) | ssh truenas37 "tar xzf - -C $DST"; fi
if [ -f "$BOT/discord.env" ] && [ "$(md5sum < "$BOT/discord.env")" != "$(ssh truenas37 "md5sum < $DST/discord.env")" ]; then
  scp -q "$BOT/discord.env" "truenas37:$DST/discord.env" && ssh truenas37 "chmod 600 $DST/discord.env"; botchg=1; echo "sync-truenas: new discord.env"
fi
if [ "$botchg" = 1 ]; then ssh truenas37 "cd /mnt/apps/last-call-dev && docker compose up -d --build discord >/dev/null 2>&1 && sleep 3 && docker logs --tail 3 last-call-discord-voice 2>&1"; fi
mv .dev/truenas/now "$STAMP"
echo "sync-truenas: https://10.42.0.37:3161/"

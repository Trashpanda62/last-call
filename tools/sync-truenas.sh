# Copies this checkout to the dev preview on TrueNAS (Steve, 2026-10-14: "truenas should be hosting the server not this
# pc"): nginx in /mnt/apps/last-call-dev serves site/ at http://10.42.0.37:3160/ (LAN only, caching off). Only files
# changed since the last copy go over; files gone from the checkout are dropped there one by one.
#   bash tools/sync-truenas.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SITE=/mnt/apps/last-call-dev/site
mkdir -p .dev/truenas
git ls-files -co --exclude-standard | grep -v '^\.dev/' | LC_ALL=C sort > .dev/truenas/files
STAMP=.dev/truenas/synced
if [ -f "$STAMP" ]; then
  while IFS= read -r f; do [ -f "$f" ] && [ "$f" -nt "$STAMP" ] && echo "$f"; done < .dev/truenas/files > .dev/truenas/changed || true
else cp .dev/truenas/files .dev/truenas/changed; fi
touch .dev/truenas/now
echo "sync-truenas: copying $(wc -l < .dev/truenas/changed) changed files"
[ -s .dev/truenas/changed ] && tar czf - -T .dev/truenas/changed | ssh truenas37 "tar xzf - -C $SITE"
scp -q .dev/truenas/files "truenas37:$SITE/../files.new"
ssh truenas37 "cd $SITE && if [ -f ../files ]; then LC_ALL=C comm -23 <(LC_ALL=C sort ../files) <(LC_ALL=C sort ../files.new) > ../gone; if [ \$(wc -l < ../gone) -le 100 ]; then while IFS= read -r f; do rm -f -- \"\$f\"; done < ../gone; fi; fi; mv ../files.new ../files"
mv .dev/truenas/now "$STAMP"
echo "sync-truenas: http://10.42.0.37:3160/"

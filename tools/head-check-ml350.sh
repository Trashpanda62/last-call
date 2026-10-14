#!/bin/bash
# Last Call's HEAD check on the ml350 (Steve: the checks run headless there, never on his PC). Reads `git archive HEAD`
# on stdin, so it tests exactly the committed tree and nothing in the working copy, unpacks it fresh into
# ~/lc-runner/last-call-head, then: node --check on every src file, the bot batch (tools/batch.mjs 20 8 2 normal,
# failing on any sim error), the route check (tools/nav-check.mjs) and the return-to-player table (tools/ev.mjs). Installed as ~/lc-runner/bin/lchead.sh;
# the studio records it as command proof with
#   git archive --format=tar HEAD | ssh -o BatchMode=yes ml350 ~/lc-runner/bin/lchead.sh
# Reinstall after editing: scp tools/head-check-ml350.sh ml350:lc-runner/bin/lchead.sh
set -u
exec 9> "$HOME/lc-runner/lchead.lock"; flock 9   # one run at a time: they share the unpack folder
DIR=$HOME/lc-runner/last-call-head
TAR=$(mktemp /tmp/lchead-XXXXXX.tar)
trap 'rm -f "$TAR"' EXIT
cat > "$TAR"
SHA=$(git get-tar-commit-id < "$TAR")
[ -n "$SHA" ] || { echo "lchead: stdin is not a git archive of a commit"; exit 2; }
rm -rf "$DIR" && mkdir -p "$DIR" && tar xf "$TAR" -C "$DIR" || { echo "lchead: could not unpack"; exit 2; }
cd "$DIR"
echo "lchead: HEAD $SHA on $(hostname)"
fail=0

n=0; bad=0
while IFS= read -r f; do
  n=$((n + 1))
  node --check "$f" || { echo "syntax: $f"; bad=$((bad + 1)); }
done < <(find src -type f \( -name '*.js' -o -name '*.mjs' \) | sort)
echo "node --check: $n files, $bad failed"; [ $n -gt 0 ] && [ $bad = 0 ] || fail=1

out=$(nice -n 5 node tools/batch.mjs 20 8 2 normal); s=$?
echo "batch 20 8 2 normal (exit $s): $out"
errors=$(printf '%s' "$out" | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{try{console.log(JSON.parse(t.trim().split("\n").pop()).errors)}catch{console.log("unparsed")}})')
[ $s = 0 ] && [ "$errors" = 0 ] || { echo "batch: exit $s, errors $errors"; fail=1; }

out=$(node tools/nav-check.mjs 20000); s=$?
echo "nav-check 20000 (exit $s): $out"; [ $s = 0 ] || fail=1

nice -n 5 node tools/ev.mjs; s=$?
echo "ev exit $s"; [ $s = 0 ] || fail=1

echo "lchead: $([ $fail = 0 ] && echo PASS || echo FAIL) at $SHA"
exit $fail

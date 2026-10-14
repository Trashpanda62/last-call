# Table screenshots on the ml350's P100s instead of Steve's PC (Steve, 2026-10-14: "why aren't you running this
# headless on the ml350?"). Syncs the checkout to the dev preview on TrueNAS (tools/sync-truenas.sh), copies
# tools/table-shots.mjs to ~/lc-runner on the ml350, runs it headless on one P100 through ANGLE Vulkan (Playwright 1.63
# from ~/ptd-runner) against http://10.42.0.37:3160/, and copies the shots back into .dev/shots.
#   bash tools/shots-ml350.sh [--gpu 0-3] [table-shots args...]
set -euo pipefail
cd "$(dirname "$0")/.."
GPU=3
if [ "${1:-}" = "--gpu" ]; then GPU=$2; shift 2; fi
case $GPU in 0) BUS=pci-0000_04_00_0 ;; 1) BUS=pci-0000_0a_00_0 ;; 2) BUS=pci-0000_84_00_0 ;; 3) BUS=pci-0000_8a_00_0 ;; *) echo "shots-ml350: no GPU $GPU" >&2; exit 2 ;; esac
bash tools/sync-truenas.sh
mkdir -p .dev/shots
ssh ml350 "mkdir -p ~/lc-runner"
scp -q tools/table-shots.mjs ml350:lc-runner/table-shots.mjs
RUN=lc-shots-$(date +%Y%m%d-%H%M%S)
Q=$(printf ' %q' "$@")
STATUS=0
ssh ml350 "cd ~/lc-runner && DRI_PRIME=$BUS LC_GPU=vulkan PW=\$HOME/ptd-runner/node_modules/playwright nice -n 5 node table-shots.mjs --url http://10.42.0.37:3160/ --out /tmp/$RUN$Q" || STATUS=$?
ssh ml350 "cd /tmp/$RUN && tar cf - ." | tar xf - -C .dev/shots
echo "shots-ml350: shots in .dev/shots"
exit $STATUS

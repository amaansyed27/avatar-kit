#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export AVATARKIT_HOME="${AVATARKIT_HOME:-$root/backend/.avatarkit}"
python="$AVATARKIT_HOME/environments/backend/bin/python"
test -x "$python" || { echo 'Run scripts/unix/setup.sh first.' >&2; exit 1; }
(cd "$root/backend" && "$python" -m uvicorn app.main:app --host 127.0.0.1 --port 7866) >"$AVATARKIT_HOME/logs/backend.log" 2>&1 &
echo $! > "$AVATARKIT_HOME/backend.pid"
(cd "$root/frontend" && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 7865 --strictPort) >"$AVATARKIT_HOME/logs/frontend.log" 2>&1 &
echo $! > "$AVATARKIT_HOME/frontend.pid"
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:7865 >/dev/null 2>&1 && break; sleep 0.5; done
echo 'AvatarKit: http://127.0.0.1:7865'
if command -v open >/dev/null 2>&1; then open http://127.0.0.1:7865; elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://127.0.0.1:7865 >/dev/null 2>&1 || true; fi

#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export AVATARKIT_HOME="${AVATARKIT_HOME:-$root/backend/.avatarkit}"
for name in backend frontend; do
  pid_file="$AVATARKIT_HOME/$name.pid"
  if [ -f "$pid_file" ]; then
    pid="$(cat "$pid_file")"
    kill "$pid" 2>/dev/null || true
    rm -f "$pid_file"
  fi
done
echo 'AvatarKit stopped.'

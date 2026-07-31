#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export AVATARKIT_HOME="${AVATARKIT_HOME:-$root/backend/.avatarkit}"
python_version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
case "$python_version" in 3.11|3.12) ;; *) echo "Python 3.11 or 3.12 is required (found $python_version)." >&2; exit 1;; esac
mkdir -p "$AVATARKIT_HOME"/{cache,database,engines,environments,jobs,logs,models,outputs,temp}
venv="$AVATARKIT_HOME/environments/backend"
if [ ! -x "$venv/bin/python" ]; then python3 -m venv "$venv"; fi
"$venv/bin/python" -m pip install --upgrade pip
"$venv/bin/python" -m pip install -e "$root/backend[dev]"
(cd "$root/frontend" && npm install && npm run build)
echo "AvatarKit core setup complete."

#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export AVATARKIT_HOME="${AVATARKIT_HOME:-$root/backend/.avatarkit}"
python="$AVATARKIT_HOME/environments/backend/bin/python"
test -x "$python" || { echo 'Run scripts/unix/setup.sh first.' >&2; exit 1; }
(cd "$root/backend" && "$python" -c 'from app.main import diagnostics; import json; print(json.dumps(diagnostics(), indent=2))')

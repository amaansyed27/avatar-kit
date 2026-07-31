#!/usr/bin/env bash
set -euo pipefail

repo="amaansyed27/avatar-kit"
install_dir="${AVATARKIT_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/avatarkit/app}"
data_dir="${AVATARKIT_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/avatarkit/data}"

for command in python3 node npm ffmpeg ffprobe curl tar; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing prerequisite: $command" >&2; exit 1; }
done

case "$install_dir" in /|"$HOME") echo "Refusing unsafe install directory: $install_dir" >&2; exit 1;; esac
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
curl -fsSL "https://github.com/$repo/archive/refs/heads/master.tar.gz" -o "$staging/source.tar.gz"
mkdir -p "$staging/source"
tar -xzf "$staging/source.tar.gz" -C "$staging/source" --strip-components=1
test -f "$staging/source/scripts/unix/setup.sh"

backup="${install_dir}.previous"
rm -rf "$backup"
if [ -e "$install_dir" ]; then mv "$install_dir" "$backup"; fi
mkdir -p "$(dirname "$install_dir")" "$data_dir"
mv "$staging/source" "$install_dir"
if ! AVATARKIT_HOME="$data_dir" "$install_dir/scripts/unix/setup.sh"; then
  rm -rf "$install_dir"
  if [ -e "$backup" ]; then mv "$backup" "$install_dir"; fi
  exit 1
fi
rm -rf "$backup"
printf 'Installed AvatarKit core to %s\n' "$install_dir"
printf 'Start with: AVATARKIT_HOME=%q %q\n' "$data_dir" "$install_dir/scripts/unix/start.sh"
printf 'SadTalker and Chatterbox installation is currently verified on Windows only.\n'

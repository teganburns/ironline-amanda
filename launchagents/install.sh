#!/bin/bash
# Install and load ironline-amanda LaunchAgents
# Run once: bash launchagents/install.sh
# Re-run after OS updates, new machines, or config changes.

set -e

AGENTS_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS"
mkdir -p "$HOME/Library/Logs/ironline"

# Load secrets from ~/.bashrc
# shellcheck disable=SC1090
source "$HOME/.bashrc" 2>/dev/null || true

if [ -z "$OPENAI_API_KEY_AMANDA_IRONLINE_AGENT" ]; then
  echo "ERROR: OPENAI_API_KEY_AMANDA_IRONLINE_AGENT not found in ~/.bashrc"
  exit 1
fi

install_plist() {
  local plist="$1"
  local src="$AGENTS_DIR/$plist"
  local dst="$LAUNCH_AGENTS/$plist"

  sed "s|YOUR_OPENAI_API_KEY_HERE|$OPENAI_API_KEY_AMANDA_IRONLINE_AGENT|g" \
    "$src" > "$dst"

  launchctl unload "$dst" 2>/dev/null || true
  launchctl load "$dst"
  echo "✓ $plist"
}

install_plist "app.ironline.poller.plist"

echo ""
echo "All agents loaded. Check status with:"
echo "  launchctl list | grep ironline"
echo ""
echo "Logs at: ~/Library/Logs/ironline/"

#!/bin/sh
set -eu

# Compose preserves node_modules across image rebuilds. Synchronize that volume
# with the checked-out lockfile before starting either development service.
dependency_hash=$(sha256sum package.json package-lock.json | sha256sum | cut -d ' ' -f 1)
marker=/app/node_modules/.dashboard-dependency-hash
installed_hash=$(cat "$marker" 2>/dev/null || true)
if [ "$dependency_hash" != "$installed_hash" ]; then
  echo "[development] Synchronizing dependencies with package-lock.json..."
  npm ci --no-audit --no-fund
  printf '%s\n' "$dependency_hash" > "$marker"
fi

exec "$@"

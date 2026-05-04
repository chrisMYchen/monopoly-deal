#!/usr/bin/env bash
# One-shot setup for a fresh cloud sandbox (Claude cloud, Codex, Codespaces,
# generic Linux VMs). Idempotent — safe to re-run.
#
#   - Installs bun if missing (pinned version below mirrors CI).
#   - Installs JS deps with frozen lockfile.
#   - Runs both typechecks + the engine vitest suite.
#
# Does NOT start any servers, install Playwright, or touch wrangler. The point
# is "verify the toolchain works" so the agent can iterate from there.

set -euo pipefail

BUN_VERSION="${BUN_VERSION:-1.3.11}"   # mirror .github/workflows/ci.yml

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "\033[32m✓\033[0m %s\n" "$*"; }
fail() { printf "\033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }

bold "[1/4] bun"
if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found — installing $BUN_VERSION"
  curl -fsSL "https://bun.sh/install" | bash -s -- "bun-v${BUN_VERSION}"
  # Add ~/.bun/bin to PATH for the remainder of this script.
  export PATH="$HOME/.bun/bin:$PATH"
fi
ok "bun $(bun --version)"

bold "[2/4] install"
bun install --frozen-lockfile
ok "deps installed"

bold "[3/4] typecheck"
bun run typecheck
bun run typecheck:worker
ok "typechecks clean"

bold "[4/4] engine tests"
bun run test:run
ok "engine suite green"

echo
bold "ready."
echo "next steps:"
echo "  bun run dev:all       # start Next + dev-server (foreground, ctrl-c to stop)"
echo "  bun run check:up      # poll until both servers respond (run in another shell)"
echo "  bun run sim:headless  # full game over WS, no browser needed"
echo "  bun run test:e2e      # WS scenario tests against the dev-server"

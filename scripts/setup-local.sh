#!/usr/bin/env bash
# setup-local.sh — Start a local Solana test validator with sensible defaults.
# Usage: bash scripts/setup-local.sh

set -euo pipefail

LEDGER_DIR=".local-ledger"
LOG_FILE=".local-validator.log"

echo ""
echo "◎ sol-wallet — local validator setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Prereq checks ─────────────────────────────────────────────────────────────
if ! command -v solana-test-validator &>/dev/null; then
  echo "✗  solana-test-validator not found. Install the Solana CLI:"
  echo "   sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
  exit 1
fi

# ── Kill any existing validator ───────────────────────────────────────────────
if lsof -ti:8899 &>/dev/null; then
  echo "→  Stopping existing validator on :8899…"
  kill "$(lsof -ti:8899)" 2>/dev/null || true
  sleep 1
fi

# ── Clean ledger ──────────────────────────────────────────────────────────────
if [[ -d "$LEDGER_DIR" ]]; then
  echo "→  Removing stale ledger at $LEDGER_DIR…"
  rm -rf "$LEDGER_DIR"
fi

# ── Configure CLI for localnet ────────────────────────────────────────────────
solana config set --url http://127.0.0.1:8899 --commitment confirmed

# ── Start validator ───────────────────────────────────────────────────────────
echo "→  Starting solana-test-validator…"
solana-test-validator \
  --ledger "$LEDGER_DIR" \
  --rpc-port 8899 \
  --faucet-port 9900 \
  --reset \
  --quiet \
  --log \
  >"$LOG_FILE" 2>&1 &

VALIDATOR_PID=$!
echo "   PID: $VALIDATOR_PID  |  logs: $LOG_FILE"

# ── Wait for RPC to be ready ──────────────────────────────────────────────────
echo "→  Waiting for RPC…"
for i in $(seq 1 30); do
  if solana cluster-version &>/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo "✗  Validator did not start in 30 s. Check $LOG_FILE"
    exit 1
  fi
done

# ── Airdrop to default keypair ────────────────────────────────────────────────
echo "→  Airdropping 10 SOL to default keypair…"
solana airdrop 10 || true

echo ""
echo "✓  Validator is live!"
echo ""
echo "   RPC  : http://127.0.0.1:8899"
echo "   WSS  : ws://127.0.0.1:8900"
echo "   Logs : tail -f $LOG_FILE"
echo ""
echo "   Next:"
echo "   1.  pnpm deploy:localnet   — build + deploy the program"
echo "   2.  pnpm dev               — start the Next.js dashboard"
echo ""

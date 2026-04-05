#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Push VULTR_* secrets to GitHub for the "Deploy Vultr" workflow — from YOUR Mac,
# after YOU log in to GitHub CLI once. No copy-paste of keys into the browser.
#
# Prereqs (one-time):
#   brew install gh
#   gh auth login     # choose GitHub.com, HTTPS, login in browser
#
# Usage (from repo root):
#   export VULTR_HOST=139.84.154.78
#   bash scripts/setup-github-vultr-secrets.sh
#
# Optional:
#   VULTR_SSH_KEY_PATH=$HOME/.ssh/id_ed25519   # default if file exists
#   VULTR_SSH_KEY_PATH=$HOME/.ssh/id_rsa
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI first, then log in:"
  echo "  brew install gh"
  echo "  gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Run this first and complete browser login:"
  echo "  gh auth login"
  exit 1
fi

HOST="${VULTR_HOST:-}"
if [[ -z "$HOST" ]]; then
  read -r -p "Vultr server IP (e.g. 139.84.154.78): " HOST
fi
if [[ -z "$HOST" ]]; then
  echo "VULTR_HOST is required." >&2
  exit 1
fi

KEY_PATH="${VULTR_SSH_KEY_PATH:-}"
if [[ -z "$KEY_PATH" ]]; then
  if [[ -f "$HOME/.ssh/id_ed25519" ]]; then
    KEY_PATH="$HOME/.ssh/id_ed25519"
  elif [[ -f "$HOME/.ssh/id_rsa" ]]; then
    KEY_PATH="$HOME/.ssh/id_rsa"
  fi
fi
if [[ -z "$KEY_PATH" || ! -f "$KEY_PATH" ]]; then
  echo "No private key found. Set VULTR_SSH_KEY_PATH or create a key, e.g.:"
  echo "  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N \"\""
  echo "Then add ~/.ssh/id_ed25519.pub to the server's /root/.ssh/authorized_keys"
  exit 1
fi

echo "Repository: $(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo '(run from NexusOps clone)')"
echo "Setting secret VULTR_HOST=$HOST"
echo "$HOST" | gh secret set VULTR_HOST

echo "Setting secret VULTR_SSH_PRIVATE_KEY from $KEY_PATH (not printed)"
gh secret set VULTR_SSH_PRIVATE_KEY < "$KEY_PATH"

echo ""
echo "Done. Next: GitHub → Actions → Deploy Vultr → Run workflow (image tag: latest)."

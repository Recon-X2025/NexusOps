#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Run once on the Vultr VPS as root — UFW defaults + SSH/HTTP/HTTPS only.
# Does NOT open PostgreSQL (5432) to the WAN — DB stays loopback-only in compose.
#
#   sudo bash scripts/harden-vultr-firewall.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)" >&2; exit 1; }

if ! command -v ufw >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq ufw
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
# API is often reached directly during QA; remove this line if you only proxy via nginx:80
ufw allow 3001/tcp

echo "y" | ufw enable || true
ufw status verbose

echo "OK — review rules; tighten port 3001 if nginx fronts everything."

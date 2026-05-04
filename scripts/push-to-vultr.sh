#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CoheronConnect → Vultr — rsync + deploy (pull from GHCR by default).
#
# Env (laptop):
#   VULTR_HOST              required — server IP or hostname (no default)
#   VULTR_USER              default root
#   DEPLOY_MODE             pull | build   (default: pull)
#   NEXUSOPS_IMAGE_REPO     default ghcr.io/recon-x2025/coheronconnect  (lowercase)
#   NEXUSOPS_IMAGE_TAG      default latest  (use short SHA from CI when pinning)
#   NEXUSOPS_WEB_IMAGE      optional full override
#   NEXUSOPS_API_IMAGE      optional full override
#   NO_CACHE=1              only when DEPLOY_MODE=build — docker build --no-cache
#
# On the VPS, for private GHCR images set in .env.production:
#   GHCR_USERNAME=your-github-username
#   GHCR_TOKEN=ghp_…   (read:packages), or run `docker login ghcr.io` once as root.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_IP="${VULTR_HOST:-}"
SERVER="${VULTR_USER:-root}@${SERVER_IP}"
SOCK="/tmp/coheronconnect-deploy-$$"

DEPLOY_MODE="${DEPLOY_MODE:-pull}"
IMG_REPO="${NEXUSOPS_IMAGE_REPO:-ghcr.io/recon-x2025/nexusops}"
IMG_TAG="${NEXUSOPS_IMAGE_TAG:-latest}"
WEB_IMAGE="${NEXUSOPS_WEB_IMAGE:-${IMG_REPO}/web:${IMG_TAG}}"
API_IMAGE="${NEXUSOPS_API_IMAGE:-${IMG_REPO}/api:${IMG_TAG}}"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RED='\033[0;31m'; RESET='\033[0m'
info() { echo -e "${CYAN}▶ $*${RESET}"; }
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }
die()  { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }

SSH_BASE=(ssh -o BatchMode=no -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)

if [[ -z "$SERVER_IP" ]]; then
  die "Set VULTR_HOST to your VPS IP or hostname (example: export VULTR_HOST=203.0.113.10)"
fi

echo ""
echo -e "${BOLD}CoheronConnect → Vultr${RESET}"
echo -e "Server: ${SERVER}"
echo -e "Mode:   ${DEPLOY_MODE}"
if [[ "$DEPLOY_MODE" == "pull" ]]; then
  echo -e "Images: ${WEB_IMAGE}"
  echo -e "        ${API_IMAGE}"
fi
echo -e "Source: ${ROOT}"
echo ""

info "Testing SSH (BatchMode)…"
"${SSH_BASE[@]}" "$SERVER" "echo connected" >/dev/null || die "SSH failed — add a key for ${SERVER} or use ssh-agent."

info "Opening SSH control socket…"
ssh -M -S "$SOCK" -o BatchMode=no -o StrictHostKeyChecking=accept-new -o ControlPersist=600 -f -N "$SERVER"
ok "Connected"

info "Syncing project (excluding secrets & build artifacts)…"
rsync -az \
  -e "ssh -S $SOCK -o BatchMode=yes" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.next' \
  --exclude='dist' \
  --exclude='.turbo' \
  --exclude='*.pdf' \
  --exclude='.pnpm-store' \
  --exclude='.env.production' \
  --exclude='.env.local' \
  --exclude='test-results' \
  --exclude='playwright-report' \
  "${ROOT}/" "${SERVER}:/opt/coheronconnect/"
ok "Files synced"

info "Remote: scripts/vultr-remote-deploy.sh (${DEPLOY_MODE})…"
# Optional: GHCR_READ_TOKEN + GHCR_USERNAME (e.g. github.token + github.actor from Actions) for private ghcr.io pulls on the VPS.
GHCR_EXPORT=""
if [[ -n "${GHCR_READ_TOKEN:-}" ]]; then
  GHCR_EXPORT="GHCR_TOKEN=$(printf '%q' "$GHCR_READ_TOKEN") GHCR_USERNAME=$(printf '%q' "${GHCR_USERNAME:-oauth2}") "
fi
# shellcheck disable=SC2029
ssh -S "$SOCK" -o BatchMode=yes "$SERVER" \
  "${GHCR_EXPORT}DEPLOY_MODE=$(printf '%q' "$DEPLOY_MODE") \
   NO_CACHE=$(printf '%q' "${NO_CACHE:-}") \
   NEXUSOPS_WEB_IMAGE=$(printf '%q' "$WEB_IMAGE") \
   NEXUSOPS_API_IMAGE=$(printf '%q' "$API_IMAGE") \
   bash /opt/coheronconnect/scripts/vultr-remote-deploy.sh"

ssh -S "$SOCK" -O exit "$SERVER" 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   CoheronConnect deployed on Vultr                ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Web:${RESET}   http://${SERVER_IP}"
echo -e "  ${BOLD}API:${RESET}   http://${SERVER_IP}:3001/health"
echo ""

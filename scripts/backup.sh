#!/usr/bin/env bash
# CoheronConnect Off-Site Database Backup
# Infra A-2 — pg_dump + rsync to off-site location
# Run via cron: 0 2 * * * /opt/coheronconnect/scripts/backup.sh >> /var/log/coheronconnect-backup.log 2>&1

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/coheronconnect/backups"
BACKUP_FILE="${BACKUP_DIR}/coheronconnect_${TIMESTAMP}.sql.gz"
RETAIN_DAYS=7

# ── Configuration (override via environment or .env.production) ────────────
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-coheronconnect-postgres-1}"
POSTGRES_DB="${POSTGRES_DB:-coheronconnect}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

# Off-site rsync target — set BACKUP_REMOTE to enable off-site sync
# Example: BACKUP_REMOTE="user@backup-server.example.com:/backups/coheronconnect"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Create backup directory ────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

# ── Dump database ──────────────────────────────────────────────────────────
log "Starting database backup → ${BACKUP_FILE}"

docker exec "$POSTGRES_CONTAINER" \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
log "Backup complete: ${BACKUP_SIZE}"

# ── Verify backup integrity ────────────────────────────────────────────────
if gzip -t "$BACKUP_FILE" 2>/dev/null; then
  log "Integrity check: PASSED"
else
  log "ERROR: Integrity check FAILED for ${BACKUP_FILE}"
  exit 1
fi

# ── Off-site sync (rsync) ──────────────────────────────────────────────────
if [[ -n "$BACKUP_REMOTE" ]]; then
  log "Syncing to off-site: ${BACKUP_REMOTE}"
  rsync -az --progress "${BACKUP_FILE}" "${BACKUP_REMOTE}/" \
    && log "Off-site sync: DONE" \
    || log "WARNING: Off-site sync failed (backup retained locally)"
else
  log "Off-site sync: SKIPPED (BACKUP_REMOTE not configured)"
fi

# ── Rotate old backups (keep last N days) ─────────────────────────────────
log "Rotating backups older than ${RETAIN_DAYS} days"
find "$BACKUP_DIR" -name "coheronconnect_*.sql.gz" -mtime +${RETAIN_DAYS} -delete
REMAINING=$(find "$BACKUP_DIR" -name "coheronconnect_*.sql.gz" | wc -l | tr -d ' ')
log "Retained ${REMAINING} backup(s) in ${BACKUP_DIR}"

log "Backup job finished successfully"

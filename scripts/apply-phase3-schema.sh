#!/usr/bin/env bash
# Apply Recruitment + Secretarial DDL to PostgreSQL (production or local Docker).
# Usage:
#   ./scripts/apply-phase3-schema.sh
#   POSTGRES_CONTAINER=nexusops-postgres-1 POSTGRES_USER=nexusops POSTGRES_DB=nexusops ./scripts/apply-phase3-schema.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/packages/db/drizzle/0004_recruitment_secretarial.sql"
CONTAINER="${POSTGRES_CONTAINER:-nexusops-postgres-1}"
USER="${POSTGRES_USER:-nexusops}"
DB="${POSTGRES_DB:-nexusops}"

if [[ ! -f "$SQL" ]]; then
  echo "Missing migration file: $SQL" >&2
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Applying via docker exec $CONTAINER ..."
  docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" < "$SQL"
else
  echo "Container '$CONTAINER' not running. Apply manually:" >&2
  echo "  psql \"\$DATABASE_URL\" -f $SQL" >&2
  exit 2
fi

echo "Done. Restart API if it was running: docker restart nexusops-api-1"

#!/bin/bash
# ── CoheronConnect System Configuration Exporter ──────────────────────────────
# This script gathers core schema and configuration files for backup/review.

EXPORT_DIR="./system_export_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$EXPORT_DIR/schema"
mkdir -p "$EXPORT_DIR/config"
mkdir -p "$EXPORT_DIR/scripts"

echo "📦 Exporting system configuration to $EXPORT_DIR..."

# 1. Export Database Schemas
echo "  ↳ Gathering database schemas..."
cp packages/db/src/schema/*.ts "$EXPORT_DIR/schema/"

# 2. Export Infrastructure Config
echo "  ↳ Gathering infrastructure config..."
cp docker-compose*.yml "$EXPORT_DIR/config/"
cp .env.example "$EXPORT_DIR/config/" 2>/dev/null || echo "    (No .env.example found)"
cp package.json "$EXPORT_DIR/config/"
cp pnpm-workspace.yaml "$EXPORT_DIR/config/"

# 3. Export Deployment Scripts
echo "  ↳ Gathering deployment scripts..."
cp scripts/*.sh "$EXPORT_DIR/scripts/"

# 4. Create a summary file
cat > "$EXPORT_DIR/README.md" <<EOF
# CoheronConnect System Export
Exported on: $(date)

## Contents
- **/schema**: Drizzle DB schema definitions (TypeScript)
- **/config**: Docker compose and project configuration files
- **/scripts**: Deployment and management shell scripts
EOF

echo "✅ Export complete! Your files are in: $EXPORT_DIR"
echo "You can zip this folder using: tar -czf system_config.tar.gz $EXPORT_DIR"

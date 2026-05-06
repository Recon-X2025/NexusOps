# CoheronConnect Sync Script for Windows
# Run this from the root of the project to sync changes to Vultr

$SERVER_IP = "65.20.86.128"
$REMOTE_USER = "root"
$REMOTE_PATH = "/opt/coheronconnect"

Write-Host "🚀 Syncing changes to $SERVER_IP..." -ForegroundColor Cyan

# Sync specific files that were modified
$filesToSync = @(
    "apps/web/src/app/app/tickets/[id]/page.tsx",
    "apps/web/src/app/app/admin/page.tsx",
    "scripts/deploy-vultr.sh",
    "Caddyfile",
    "docker-compose.vultr-test.yml"
)

foreach ($file in $filesToSync) {
    Write-Host "  -> Syncing $file..."
    scp $file "${REMOTE_USER}@${SERVER_IP}:${REMOTE_PATH}/$file"
}

Write-Host "`n✅ Sync complete!" -ForegroundColor Green
Write-Host "Now run the following command on your server to apply changes:" -ForegroundColor Yellow
Write-Host "ssh ${REMOTE_USER}@${SERVER_IP} 'cd ${REMOTE_PATH} && docker compose -f docker-compose.vultr-test.yml up -d --build'" -ForegroundColor White

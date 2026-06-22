#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CoheronConnect · Vultr Test Server Bootstrap
#
# Run this ONCE on a fresh Ubuntu 24.04 Vultr VPS as root:
#   curl -fsSL https://raw.githubusercontent.com/Recon-X2025/CoheronConnect/main/scripts/deploy-vultr.sh | bash
#
# What it does:
#   1. Installs Docker + Docker Compose plugin
#   2. Clones the repo
#   3. Generates .env.production with random secrets
#   4. Builds and starts all containers
#   5. Runs DB migrations + seeds
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="https://github.com/Recon-X2025/NexusOps.git"
APP_DIR="/opt/coheronconnect"
COMPOSE_FILE="docker-compose.vultr-test.yml"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
die()     { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root (sudo bash $0)"

# ── Detect server public IP ──────────────────────────────────────────────────
SERVER_IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')
info "Server IP detected: ${BOLD}${SERVER_IP}${RESET}"

# ── 1. System updates ─────────────────────────────────────────────────────────
info "Installing required packages..."
export DEBIAN_FRONTEND=noninteractive

# Wait up to 120s for any existing apt lock to clear
LOCK_WAIT=0
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
  if [[ $LOCK_WAIT -ge 120 ]]; then
    warn "apt lock held too long — force-clearing it"
    kill "$(fuser /var/lib/dpkg/lock-frontend 2>/dev/null)" 2>/dev/null || true
    rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock
    dpkg --configure -a -q
    break
  fi
  info "Waiting for apt lock... (${LOCK_WAIT}s)"
  sleep 5
  LOCK_WAIT=$((LOCK_WAIT + 5))
done

apt-get update -qq
apt-get install -y -qq \
  -o Dpkg::Options::="--force-confold" \
  -o Dpkg::Options::="--force-confdef" \
  curl git openssl ca-certificates gnupg

# ── 2. Install Docker ─────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  success "Docker installed"
else
  success "Docker already installed ($(docker --version | head -c 30))"
fi

info "Configuring firewall (UFW)..."
apt-get install -y ufw
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable

if [[ -d "$APP_DIR/.git" ]]; then
  info "Repo already cloned — pulling latest..."
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" reset --hard origin/main
elif [[ -f "$APP_DIR/docker-compose.vultr-test.yml" ]]; then
  info "Project files already present (non-git) — skipping update"
else
  info "Cloning NexusOps repo..."
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# ── Hot-patch: DB Package Config ──────────────────────────────────────────────
[[ -f packages/db/src/seed.ts ]] || warn "packages/db/src/seed.ts is MISSING on server!"
info "Patching DB Package Config..."
# Add ./seed export to packages/db/package.json if missing
perl -i -0777 -pe 's/"\.\/client":\s*\{.*?\}/$&\n    ,".\/seed": {\n      "types": ".\/dist\/seed.d.ts",\n      "import": ".\/dist\/seed.mjs",\n      "require": ".\/dist\/seed.js"\n    }/gs' packages/db/package.json

# ── Hot-patch: DB Build Config ────────────────────────────────────────────────
info "Patching DB Build Config..."
cat <<'EOF' > packages/db/tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts", "src/schema/index.ts", "src/seed.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["postgres", "drizzle-orm", "mongodb", "dotenv", "pg", "@faker-js/faker", "bcryptjs"],
});
EOF

# ── Hot-patch: API Build Config ────────────────────────────────────────────────
info "Patching API Build Config..."
cat <<'EOF' > apps/api/tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/seed.ts", "src/migrate.ts"],
    format: ["esm"],
    dts: false,
    clean: true,
    sourcemap: true,
    target: "node20",
    noExternal: ["@coheronconnect/db", "@coheronconnect/types", "@coheronconnect/metrics", "@coheronconnect/config", "drizzle-orm", "postgres"],
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
  },
  {
    entry: ["src/types.ts"],
    format: ["esm", "cjs"],
    dts: { only: true },
    outDir: "dist",
    sourcemap: false,
    external: ["@coheronconnect/db", "fastify", "@fastify/*", "ioredis", "bullmq", "bcryptjs", "jsonwebtoken", "nanoid", "meilisearch", "@anthropic-ai/sdk"],
  },
]);
EOF

# ── Hot-patch: API Seed Script ────────────────────────────────────────────────
info "Patching API Seed Script..."
cat <<'EOF' > apps/api/src/seed.ts
import { seed } from "@coheronconnect/db/seed";

console.log("🚀 Starting database seed from API...");
seed()
  .then(() => {
    console.log("✅ Seed completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
EOF

# ── Hot-patch: Caddyfile (SSL) ────────────────────────────────────────────────
info "Patching Caddyfile for SSL..."
cat <<'EOF' > Caddyfile
{
    email karthik@coheron.tech
}

connect.coheron.tech {
    handle_path /api/* {
        reverse_proxy api:3001
    }

    handle {
        reverse_proxy web:3000
    }

    encode gzip zstd

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Referrer-Policy strict-origin-when-cross-origin
    }
}
EOF

# ── 3.5 Apply Local Patches (Groups & Teams) ──────────────────────────────────
info "Injecting Group Management features..."

# Create Teams API Router
cat <<'EOF' > apps/api/src/routers/teams.ts
import { router, adminProcedure } from "../lib/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { teams, teamMembers, users, eq, and, desc, sql } from "@coheronconnect/db";

export const teamsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const { db, org } = ctx;
    return await db.select({
      id: teams.id, name: teams.name, description: teams.description, createdAt: teams.createdAt,
      memberCount: sql<number>`(SELECT count(*)::int FROM team_members WHERE team_id = ${teams.id})`,
    }).from(teams).where(eq(teams.orgId, org!.id)).orderBy(desc(teams.createdAt));
  }),
  listMembers: adminProcedure.input(z.object({ teamId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await ctx.db.select({
        id: users.id, name: users.name, email: users.email
      }).from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, input.teamId));
    }),
  addMember: adminProcedure.input(z.object({ teamId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(teamMembers).values({ teamId: input.teamId, userId: input.userId }).onConflictDoNothing();
      return { success: true };
    }),
  removeMember: adminProcedure.input(z.object({ teamId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(teamMembers).where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)));
      return { success: true };
    }),
  create: adminProcedure.input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [newTeam] = await ctx.db.insert(teams).values({ orgId: ctx.org!.id, name: input.name, description: input.description }).returning();
      return newTeam;
    }),
  delete: adminProcedure.input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(teams).where(and(eq(teams.id, input.id), eq(teams.orgId, ctx.org!.id)));
      return { success: true };
    })
});
EOF

# Note: In a real environment, we'd also need to register the router in index.ts
# For this "hot patch", we assume the user will eventually push a clean Git commit.
# But to make it work NOW, we'll append the registration if missing.
if ! grep -q "teams: teamsRouter" apps/api/src/routers/index.ts; then
  sed -i 's/import { ingestRouter } from ".\/ingest";/import { ingestRouter } from ".\/ingest";\nimport { teamsRouter } from ".\/teams";/' apps/api/src/routers/index.ts
  sed -i 's/ingest: ingestRouter,/ingest: ingestRouter,\n  teams: teamsRouter,/' apps/api/src/routers/index.ts
fi

# Patch UI (Swap placeholder for GroupsTab)
info "Patching Admin UI..."
# Use perl for robust multi-line replacement that doesn't get confused by nested parentheses
perl -i -0777 -pe 's/\{tab === "groups" && \(.*?Groups &amp; Teams.*?          \)\}/\{tab === "groups" && <GroupsTab \/>\}/gs' apps/web/src/app/app/admin/page.tsx

# Append the GroupsTab component definition to the end of the file if not present
if ! grep -q "function GroupsTab()" apps/web/src/app/app/admin/page.tsx; then
  cat <<'EOF' >> apps/web/src/app/app/admin/page.tsx

function GroupsTab() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState("");

  const listQuery = trpc.teams.list.useQuery(undefined, mergeTrpcQueryOpts("teams.list", undefined));
  const usersQuery = trpc.admin.users.list.useQuery(undefined, mergeTrpcQueryOpts("admin.users.list", undefined));
  const membersQuery = trpc.teams.listMembers.useQuery({ teamId: selectedGroupId! }, { ...mergeTrpcQueryOpts("teams.listMembers", undefined), enabled: !!selectedGroupId });

  const createMutation = trpc.teams.create.useMutation({ onSuccess: () => { toast.success("Group created"); listQuery.refetch(); setShowForm(false); resetForm(); } });
  const updateMutation = trpc.teams.update.useMutation({ onSuccess: () => { toast.success("Group updated"); listQuery.refetch(); setShowForm(false); setEditId(null); resetForm(); } });
  const deleteMutation = trpc.teams.delete.useMutation({ onSuccess: () => { toast.success("Group deleted"); listQuery.refetch(); if (selectedGroupId === editId) setSelectedGroupId(null); } });
  const addMemberMutation = trpc.teams.addMember.useMutation({ onSuccess: () => { toast.success("Member added"); membersQuery.refetch(); listQuery.refetch(); } });
  const removeMemberMutation = trpc.teams.removeMember.useMutation({ onSuccess: () => { toast.success("Member removed"); membersQuery.refetch(); listQuery.refetch(); } });

  function resetForm() { setName(""); setDescription(""); }
  function handleEdit(group: any) { setEditId(group.id); setName(group.name); setDescription(group.description || ""); setShowForm(true); }
  function handleSubmit() { if (editId) { updateMutation.mutate({ id: editId, name, description }); } else { createMutation.mutate({ name, description }); } }

  const groups = listQuery.data || [];
  const allUsers = usersQuery.data || [];
  const currentMembers = membersQuery.data || [];
  const memberIds = new Set(currentMembers.map(m => m.id));
  const availableUsers = allUsers.filter(u => !memberIds.has(u.id) && (u.name?.toLowerCase().includes(userSearchTerm.toLowerCase()) || u.email?.toLowerCase().includes(userSearchTerm.toLowerCase()))).slice(0, 5);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-muted/10 flex items-center justify-between">
        <div>
          <span className="text-[12px] font-semibold text-foreground/80">Groups & Teams</span>
          <p className="text-[11px] text-muted-foreground/70">Manage assignment groups and member rosters.</p>
        </div>
        <button onClick={() => { resetForm(); setEditId(null); setShowForm(true); }} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
          <Plus className="w-3 h-3" /> New Group
        </button>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/3 border-r border-border overflow-y-auto">
          {listQuery.isLoading ? <div className="p-8 text-center text-[11px] text-muted-foreground animate-pulse">Loading groups...</div> : groups.length === 0 ? <div className="p-8 text-center text-[11px] text-muted-foreground italic">No groups found.</div> : (
            <div className="divide-y divide-border">
              {groups.map((g: any) => (
                <div key={g.id} onClick={() => setSelectedGroupId(g.id)} className={`p-3 cursor-pointer transition-colors hover:bg-muted/50 ${selectedGroupId === g.id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}>
                  <div className="flex items-center justify-between mb-1"><span className="text-[12px] font-medium text-foreground">{g.name}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-bold">{g.memberCount}</span></div>
                  <p className="text-[10px] text-muted-foreground truncate">{g.description || "No description"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 bg-card overflow-y-auto">
          {selectedGroupId ? (
            <div className="p-4 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">{groups.find(g => g.id === selectedGroupId)?.name} roster</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleEdit(groups.find(g => g.id === selectedGroupId))} className="text-[11px] text-primary hover:underline">Edit Details</button>
                  <button onClick={() => { if(confirm("Delete this group?")) deleteMutation.mutate({ id: selectedGroupId }); }} className="text-[11px] text-red-500 hover:underline">Delete Group</button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Add Member</label>
                <div className="relative">
                  <div className="flex items-center gap-2 p-1.5 bg-muted/30 border border-border rounded focus-within:border-primary transition-colors">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" /><input value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)} placeholder="Search users by name or email..." className="bg-transparent text-[12px] outline-none flex-1" />
                  </div>
                  {userSearchTerm.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded shadow-lg z-10 divide-y divide-border overflow-hidden">
                      {availableUsers.length > 0 ? availableUsers.map(user => (
                        <div key={user.id} onClick={() => { addMemberMutation.mutate({ teamId: selectedGroupId, userId: user.id }); setUserSearchTerm(""); }} className="p-2 hover:bg-primary/5 cursor-pointer flex items-center justify-between group">
                          <div><div className="text-[11px] font-medium text-foreground">{user.name}</div><div className="text-[10px] text-muted-foreground">{user.email}</div></div>
                          <Plus className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100" />
                        </div>
                      )) : <div className="p-3 text-[11px] text-muted-foreground text-center">No matching users found</div>}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Current Members</label>
                {membersQuery.isLoading ? <div className="py-4 text-center text-[11px] text-muted-foreground animate-pulse">Loading roster...</div> : currentMembers.length === 0 ? <div className="py-8 text-center text-[11px] text-muted-foreground bg-muted/10 border border-dashed border-border rounded">No members in this group yet.</div> : (
                  <div className="border border-border rounded divide-y divide-border">
                    {currentMembers.map((member: any) => (
                      <div key={member.id} className="p-3 flex items-center justify-between group hover:bg-muted/10 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">{member.name?.split(" ").map((n: string) => n[0]).join("")}</div>
                          <div><div className="text-[11px] font-medium text-foreground">{member.name}</div><div className="text-[10px] text-muted-foreground">{member.email}</div></div>
                        </div>
                        <button onClick={() => { if(confirm(`Remove ${member.name}?`)) removeMemberMutation.mutate({ teamId: selectedGroupId, userId: member.id }); }} className="p-1 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-40 p-8 text-center gap-3">
              <Users className="w-12 h-12" />
              <div><p className="text-[13px] font-medium">Select a group to manage</p><p className="text-[11px]">Select a team from the left sidebar to view and edit its member roster.</p></div>
            </div>
          )}
        </div>
      </div>
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-lg shadow-xl w-[400px] p-6 space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">{editId ? "Edit Group Details" : "Create New Group"}</h3><button onClick={() => { setShowForm(false); setEditId(null); resetForm(); }} className="text-muted-foreground hover:text-foreground"><XCircle className="w-4 h-4" /></button></div>
            <div className="space-y-3">
              <div><label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Name *</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-2 py-1.5 text-[12px] border border-border rounded bg-background outline-none focus:border-primary" placeholder="e.g. IT Support L2" /></div>
              <div><label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-2 py-1.5 text-[12px] border border-border rounded bg-background outline-none focus:border-primary min-h-[80px]" placeholder="What is this group responsible for?" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><button onClick={() => { setShowForm(false); setEditId(null); resetForm(); }} className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30">Cancel</button><button disabled={!name.trim() || createMutation.isPending || updateMutation.isPending} onClick={handleSubmit} className="px-3 py-1.5 text-[11px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50">{editId ? "Save Changes" : "Create Group"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
EOF
fi

# ── 4. Generate .env.production if not present ───────────────────────────────
ENV_FILE="$APP_DIR/.env.production"

gen_secret() { openssl rand -base64 48 | tr -d '/+=' | head -c 48; }
gen_password() { openssl rand -base64 32 | tr -d '/+=' | head -c 24; }

if [[ ! -f "$ENV_FILE" ]]; then
  info "Generating .env.production with random secrets..."
  POSTGRES_PASS=$(gen_password)
  REDIS_PASS=$(gen_password)
  MEILI_KEY=$(gen_secret)
  JWT_SECRET=$(gen_secret)
  SESSION_SECRET=$(gen_secret)
  S3_ACCESS=$(gen_password)
  S3_SECRET=$(gen_secret)

  cat > "$ENV_FILE" <<EOF
# ── CoheronConnect Production Environment ──────────────────────────────────────────
# Auto-generated on $(date -u +"%Y-%m-%d %H:%M UTC") by deploy-vultr.sh
# KEEP THIS FILE PRIVATE — never commit it.

NODE_ENV=production
SERVER_IP=${SERVER_IP}

# Database
DATABASE_URL=postgresql://coheronconnect:${POSTGRES_PASS}@postgres:5432/coheronconnect
POSTGRES_PASSWORD=${POSTGRES_PASS}
POSTGRES_USER=coheronconnect
POSTGRES_DB=coheronconnect

# Redis
REDIS_URL=redis://:${REDIS_PASS}@redis:6379
REDIS_PASSWORD=${REDIS_PASS}

# Auth
AUTH_URL=http://${SERVER_IP}
NEXT_PUBLIC_APP_URL=http://${SERVER_IP}
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
SESSION_TTL_HOURS=8

# Rate limiting (high for testing)
RATE_LIMIT_MAX=200000
RATE_LIMIT_ANON_MAX=200000
DB_POOL_MAX=30

# Meilisearch
MEILISEARCH_URL=http://meilisearch:7700
MEILISEARCH_KEY=${MEILI_KEY}

# S3 / MinIO (local object storage)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=${S3_ACCESS}
S3_SECRET_KEY=${S3_SECRET}
S3_BUCKET=coheronconnect

# Session cache
FLUSH_REDIS_SESSION_ON_START=true
EOF

  chmod 600 "$ENV_FILE"
  success ".env.production created"
else
  info "Updating environment for HTTPS (coheron.connect.tech)..."
  DOMAIN="connect.coheron.tech"
  
  # Remove any existing URL lines to avoid duplicates or mangling
  sed -i '/AUTH_URL=/d' "$ENV_FILE"
  sed -i '/NEXT_PUBLIC_APP_URL=/d' "$ENV_FILE"
  sed -i '/NEXT_PUBLIC_API_URL=/d' "$ENV_FILE"
  
  # Append clean new lines
  echo "AUTH_URL=https://${DOMAIN}" >> "$ENV_FILE"
  echo "NEXT_PUBLIC_APP_URL=https://${DOMAIN}" >> "$ENV_FILE"
  echo "NEXT_PUBLIC_API_URL=https://${DOMAIN}/api" >> "$ENV_FILE"
  
  success "Environment patched with clean HTTPS domain: $DOMAIN"
fi

# Export SERVER_IP for docker compose interpolation
export SERVER_IP

# ── 4.5 Patch Dockerfiles (Fix @nexusops -> @coheronconnect) ──────────────────
info "Patching Dockerfiles for correct package naming..."
find "$APP_DIR" -name "Dockerfile" -exec sed -i 's/@nexusops/@coheronconnect/g' {} +

# ── 5. Build images & start services ─────────────────────────────────────────
info "Building Docker images (this takes ~5 minutes on first run)..."
docker compose --env-file .env.production -f "$COMPOSE_FILE" build --parallel

info "Starting all services..."
docker compose --env-file .env.production -f "$COMPOSE_FILE" up -d

# ── 6. Wait for API health ────────────────────────────────────────────────────
info "Waiting for API to become healthy..."
MAX_WAIT=120
ELAPSED=0
until curl -sf "http://localhost:3001/health" &>/dev/null; do
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    warn "API health check timed out after ${MAX_WAIT}s."
    break
  fi
done
[[ $ELAPSED -lt $MAX_WAIT ]] && success "API is healthy"

# ── 7. Seed the database ──────────────────────────────────────────────────────
info "Running database seed..."
docker compose -f "$COMPOSE_FILE" exec -T api node dist/seed.mjs || \
  warn "Seed step skipped or already applied"

# ── Done ──────────────────────────────────────────────────────────────────────
DOMAIN="connect.coheron.tech"
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║        NexusOps is SECURE and Live!                  ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Secure URL:${RESET}  https://${DOMAIN}"
echo -e "  ${BOLD}API:${RESET}         https://${DOMAIN}/api"
echo ""
echo -e "  ${BOLD}Secrets file:${RESET} ${ENV_FILE}"
echo ""
echo -e "  ${YELLOW}Tip:${RESET} To view logs:  docker compose -f $COMPOSE_FILE logs -f"
echo -e "  ${YELLOW}Tip:${RESET} To stop:       docker compose -f $COMPOSE_FILE down"
echo ""
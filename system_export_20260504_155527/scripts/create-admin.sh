#!/bin/bash
cd /opt/coheronconnect
# Create Org
docker compose --env-file .env.production -f docker-compose.vultr-test.yml exec -T postgres psql -U coheronconnect -c "INSERT INTO organizations (name, slug, plan, primary_color) VALUES ('CoheronConnect HQ', 'coheron-demo', 'professional', '#00BCFF') ON CONFLICT DO NOTHING;"

# Create User
docker compose --env-file .env.production -f docker-compose.vultr-test.yml exec -T api node -e "
  const bcrypt = require('bcryptjs');
  const { Client } = require('pg');
  (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const hash = await bcrypt.hash('demo1234!', 12);
    const orgRes = await client.query(\"SELECT id FROM organizations WHERE slug='coheron-demo' LIMIT 1\");
    const orgId = orgRes.rows[0].id;
    await client.query(\"INSERT INTO users (email, name, role, status, password_hash, org_id) VALUES ('admin@coheron.com', 'Administrator', 'owner', 'active', \$1, \$2) ON CONFLICT (email) DO UPDATE SET password_hash = \$1, status = 'active'\", [hash, orgId]);
    console.log('Admin user created');
    await client.end();
  })().catch(console.error);
"

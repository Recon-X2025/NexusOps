import { Client } from 'pg';

async function main() {
  const client = new Client({ connectionString: 'postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect' });
  await client.connect();
  console.log("Connected to DB");
  await client.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;');
  await client.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department" text;');
  await client.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "job_title" text;');
  await client.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location" text;');
  await client.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text;');
  console.log('Columns added successfully');
  await client.end();
}

main().catch(console.error);

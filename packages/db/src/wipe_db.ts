import postgres from 'postgres';

const sql = postgres('postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect');

async function main() {
  try {
    console.log("Dropping schemas...");
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE;`;
    await sql`DROP SCHEMA IF EXISTS public CASCADE;`;
    await sql`CREATE SCHEMA public;`;
    console.log("Schemas dropped and recreated successfully.");
  } catch (e) {
    console.error(e);
  } finally {
    await sql.end();
  }
}

main();

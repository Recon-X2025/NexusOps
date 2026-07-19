import postgres from 'postgres';

const sql = postgres('postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect');

async function main() {
  try {
    const result = await sql`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'gstin_registry';
    `;
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await sql.end();
  }
}

main();

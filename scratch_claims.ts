import 'dotenv/config';
import { db } from './packages/db/src/index';
import { expenseClaims } from './packages/db/src/schema/hr';

async function main() {
  const claims = await db.select().from(expenseClaims);
  console.log(JSON.stringify(claims, null, 2));
  process.exit(0);
}

main();

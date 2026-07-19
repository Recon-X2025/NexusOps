const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect' });
client.connect().then(() => {
  return client.query("SELECT * FROM organizations WHERE name = 'testorg2' LIMIT 1");
}).then(res => {
  console.log(res.rows[0]);
  client.end();
}).catch(console.error);

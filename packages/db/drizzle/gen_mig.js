const fs = require('fs');
const oldFile = fs.readFileSync('0052_odd_forgotten_wall.sql', 'utf8');
const newFile = oldFile.replace(/USING \(\(current_setting\('app\.org_id', true\) IS NULL OR current_setting\('app\.org_id', true\) = '' OR org_id = current_setting\('app\.org_id', true\)::uuid\)\)/g, "USING ((org_id = current_setting('app.org_id', true)::uuid))");
fs.writeFileSync('0053_rls_fail_closed.sql', newFile);
console.log('0053 migration created.');

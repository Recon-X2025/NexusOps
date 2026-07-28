const fs = require('fs');
const file = fs.readFileSync('payroll.ts', 'utf8');
const newFile = file.replace(/permissionProcedure\("hr", /g, 'permissionProcedure("payroll", ');
fs.writeFileSync('payroll.ts', newFile);

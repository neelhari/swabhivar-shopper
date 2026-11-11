const fs = require('fs');
let code = fs.readFileSync('routes/admin.js', 'utf8');
code = code.replace("module.exports = router;\n\\n\n// GET /api/admin/payouts", "// GET /api/admin/payouts");
code = code.replace("module.exports = router;\n\\n\n\n// GET /api/admin/payouts", "// GET /api/admin/payouts");
code = code.replace("module.exports = router;\n\n// GET /api/admin/payouts", "// GET /api/admin/payouts");

if (!code.endsWith("module.exports = router;")) {
   code += "\nmodule.exports = router;\n";
}

fs.writeFileSync('routes/admin.js', code);
console.log('Fixed admin.js');

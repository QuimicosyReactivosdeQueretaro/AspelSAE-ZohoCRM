const saeDb = require("./src/config/database");
async function run() {
    // 1. Ver qué da REPLACE(..., '  ', ' ')
    const res = await saeDb.query(`
        SELECT TRIM(CVE_ART) as ORIGINAL, 
        REPLACE(TRIM(CVE_ART), '  ', ' ') as LIMPIADO 
        FROM INVE15 
        WHERE TRIM(CVE_ART) LIKE '%MIND%105-005917%'
    `);
    console.table(res);
    process.exit(0);
}
run().catch(console.error);

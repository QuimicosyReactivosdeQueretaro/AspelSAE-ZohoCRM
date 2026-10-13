const db = require("./src/config/database");
async function run() {
    const cots = await db.query(`SELECT CVE_DOC, STATUS, ENLAZADO, CVE_BITA, FECHAELAB FROM FACTC15 WHERE CVE_DOC IN ('C-HT-001498', 'C-XA-005686', 'C-QR-027095')`);
    console.log("=== COTIZACIONES DE ORIGEN ===");
    console.table(cots);
    process.exit(0);
}
run().catch(console.error);

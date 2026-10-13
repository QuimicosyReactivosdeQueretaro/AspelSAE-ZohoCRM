const db = require("./src/config/database");
async function run() {
    // 1. Ver la cotización en SAE
    const coti = await db.query(`
        SELECT TRIM(CVE_DOC) AS DOC, TRIM(CONDICION) AS CONDICION, STATUS
        FROM FACTC15 
        WHERE TRIM(CVE_DOC) = 'C-QR-027444'
    `);
    console.log("=== COTIZACION C-QR-027444 EN SAE ===");
    console.table(coti);

    // 2. Ver el pedido en SAE
    const ped = await db.query(`
        SELECT TRIM(CVE_DOC) AS DOC, TRIM(CONDICION) AS CONDICION, STATUS
        FROM FACTP15 
        WHERE TRIM(CVE_DOC) = 'P-QR-034909'
    `);
    console.log("\n=== PEDIDO P-QR-034909 EN SAE ===");
    console.table(ped);

    process.exit(0);
}
run().catch(console.error);

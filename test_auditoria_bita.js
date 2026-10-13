const db = require("./src/config/database");
async function run() {
    // 1. Revisar la Cotización
    const coti = await db.query(`
        SELECT CVE_DOC, STATUS, CVE_BITA, FECHAELAB 
        FROM FACTC15 
        WHERE TRIM(CVE_DOC) = 'C-QR-027175'
    `);
    console.log("=== COTIZACION ===");
    console.table(coti);

    // 2. Revisar el Pedido
    const ped = await db.query(`
        SELECT CVE_DOC, STATUS, CVE_BITA, FECHAELAB 
        FROM FACTP15 
        WHERE TRIM(CVE_DOC) = 'P-QR-034642'
    `);
    console.log("\n=== PEDIDO ===");
    console.table(ped);

    // 3. Buscar esos CVE_BITA en la tabla BITA15
    const bitaVals = [];
    if (coti.length > 0 && coti[0].CVE_BITA > 0) bitaVals.push(coti[0].CVE_BITA);
    if (ped.length > 0 && ped[0].CVE_BITA > 0) bitaVals.push(ped[0].CVE_BITA);

    if (bitaVals.length > 0) {
        const placeholders = bitaVals.map(() => '?').join(',');
        const bitas = await db.query(`
            SELECT CVE_BITA, CVE_CLIE, CVE_ACTIVIDAD, OBSERVACIONES, NOM_USUARIO 
            FROM BITA15 
            WHERE CVE_BITA IN (${placeholders})
        `, bitaVals);
        console.log("\n=== REGISTROS EN BITA15 ===");
        console.table(bitas);
    } else {
        console.log("\n=== NINGUNO TIENE CVE_BITA ASIGNADO ===");
    }

    process.exit(0);
}
run().catch(console.error);

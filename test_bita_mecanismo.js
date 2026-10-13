const db = require("./src/config/database");
async function run() {
    // 1. Ver el rango de CVE_BITA en todos los documentos para entender si es un contador global
    const rangos = await db.query(`
        SELECT 'COTIZACION' AS TIPO, MIN(CVE_BITA) AS MINIMO, MAX(CVE_BITA) AS MAXIMO FROM FACTC15 WHERE CVE_BITA > 0
        UNION ALL
        SELECT 'PEDIDO', MIN(CVE_BITA), MAX(CVE_BITA) FROM FACTP15 WHERE CVE_BITA > 0
        UNION ALL
        SELECT 'REMISION', MIN(CVE_BITA), MAX(CVE_BITA) FROM FACTR15 WHERE CVE_BITA > 0
        UNION ALL
        SELECT 'FACTURA', MIN(CVE_BITA), MAX(CVE_BITA) FROM FACTF15 WHERE CVE_BITA > 0
    `);
    console.log("=== RANGOS DE CVE_BITA POR TIPO DE DOCUMENTO ===");
    console.table(rangos);
    
    // 2. Ver si hay alguna tabla de control para CVE_BITA (como TBLCONTROL15)
    const control = await db.query(`SELECT * FROM TBLCONTROL15 ORDER BY ID_TABLA`);
    console.log("\n=== TABLA DE CONTROL (TBLCONTROL15) ===");
    console.table(control);

    process.exit(0);
}
run().catch(console.error);

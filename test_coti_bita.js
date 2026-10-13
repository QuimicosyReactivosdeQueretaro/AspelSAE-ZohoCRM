const db = require("./src/config/database");
async function run() {
    const stats = await db.query(`
        SELECT 
            COUNT(*) AS TOTAL_COTIZACIONES,
            SUM(CASE WHEN CVE_BITA > 0 THEN 1 ELSE 0 END) AS CON_BITACORA,
            SUM(CASE WHEN CVE_BITA = 0 OR CVE_BITA IS NULL THEN 1 ELSE 0 END) AS SIN_BITACORA
        FROM FACTC15
    `);
    
    console.log("=== ESTADÍSTICA DE BITÁCORA EN COTIZACIONES (FACTC15) ===");
    console.table(stats);
    
    const muestra = await db.query(`
        SELECT FIRST 5 TRIM(CVE_DOC) AS COTIZACION, STATUS, CVE_BITA 
        FROM FACTC15 
        ORDER BY FECHAELAB DESC
    `);
    console.log("\n=== MUESTRA DE LAS ÚLTIMAS 5 COTIZACIONES ===");
    console.table(muestra);

    process.exit(0);
}
run().catch(console.error);

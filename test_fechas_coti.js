const db = require("./src/config/database");
async function run() {
    const rango = await db.query(`
        SELECT 
            MIN(CAST(FECHAELAB AS DATE)) AS PRIMERA_FECHA,
            MAX(CAST(FECHAELAB AS DATE)) AS ULTIMA_FECHA,
            COUNT(*) AS TOTAL
        FROM FACTC15
        WHERE CVE_BITA = 0 OR CVE_BITA IS NULL
    `);
    console.log("=== RANGO DE FECHAS (COTIZACIONES SIN BITACORA) ===");
    console.table(rango);
    
    const porMes = await db.query(`
        SELECT 
            EXTRACT(YEAR FROM FECHAELAB) AS ANIO,
            EXTRACT(MONTH FROM FECHAELAB) AS MES,
            COUNT(*) AS CANTIDAD
        FROM FACTC15
        WHERE CVE_BITA = 0 OR CVE_BITA IS NULL
        GROUP BY 1, 2
        ORDER BY 1, 2
    `);
    console.log("\n=== DESGLOSE POR MES ===");
    console.table(porMes);

    process.exit(0);
}
run().catch(console.error);

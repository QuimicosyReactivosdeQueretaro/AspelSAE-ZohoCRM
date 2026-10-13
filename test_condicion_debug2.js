const db = require("./src/config/database");
async function run() {
    // 1. Ver si ALGUNA cotización reciente tiene condición (desde que implementamos el cambio el 18 sept)
    const recientes = await db.query(`
        SELECT TRIM(CVE_DOC) AS DOC, TRIM(CONDICION) AS CONDICION, CAST(FECHAELAB AS DATE) AS FECHA
        FROM FACTC15 
        WHERE FECHAELAB >= '2026-09-18'
        ORDER BY FECHAELAB DESC
    `);
    console.log("=== COTIZACIONES DESDE EL 18 SEPT (CUANDO SE IMPLEMENTÓ) ===");
    console.log("Total:", recientes.length);
    recientes.forEach(r => {
        console.log("  " + r.DOC + " | Condición: " + JSON.stringify(r.CONDICION) + " | Fecha: " + r.FECHA);
    });

    process.exit(0);
}
run().catch(console.error);

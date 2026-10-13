const db = require("./src/config/database");
async function run() {
    // Buscar excepciones: Status = 'O' pero que sí tienen bitácora
    const exceptions = await db.query(`
        SELECT FIRST 10 CVE_DOC, STATUS, CVE_BITA, FECHAELAB 
        FROM FACTP15 
        WHERE STATUS = 'O' AND CVE_BITA > 0
    `);
    console.log("=== PEDIDOS CON STATUS 'O' PERO QUE SÍ TIENEN BITACORA ===");
    console.table(exceptions.length > 0 ? exceptions : [{ resultado: "NINGUNO ENCONTRADO" }]);
    
    // Estadísticas generales para ver la correlación exacta
    const stats = await db.query(`
        SELECT 
            STATUS, 
            CASE WHEN CVE_BITA > 0 THEN 'SI_BITACORA' ELSE 'NO_BITACORA' END AS TIENE_BITACORA, 
            COUNT(*) AS TOTAL 
        FROM FACTP15 
        GROUP BY 1, 2
        ORDER BY 1, 2
    `);
    console.log("\n=== ESTADISTICA GENERAL EN TODA LA BASE DE DATOS ===");
    console.table(stats);

    process.exit(0);
}
run().catch(console.error);

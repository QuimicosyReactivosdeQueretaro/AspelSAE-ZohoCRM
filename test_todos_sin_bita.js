const db = require("./src/config/database");
async function run() {
    const pedidos = await db.query(`
        SELECT TRIM(CVE_DOC) AS PEDIDO, STATUS, CAST(FECHAELAB AS DATE) AS FECHA
        FROM FACTP15 
        WHERE CVE_BITA IS NULL OR CVE_BITA = 0
        ORDER BY FECHAELAB DESC
    `);
    
    console.log(`=== TOTAL DE PEDIDOS SIN BITÁCORA EN LA HISTORIA: ${pedidos.length} ===`);
    
    // Mostrar los 30 más recientes como muestra
    console.log("\n=== LOS 30 MÁS RECIENTES (MUESTRA PARA QUE REVISES) ===");
    console.table(pedidos.slice(0, 30));
    
    process.exit(0);
}
run().catch(console.error);

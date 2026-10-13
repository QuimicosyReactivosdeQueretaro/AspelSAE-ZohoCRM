const db = require("./src/config/database");
async function run() {
    const pedidos = await db.query(`
        SELECT TRIM(CVE_DOC) AS PEDIDO, CAST(FECHAELAB AS DATE) AS FECHA
        FROM FACTP15 
        WHERE STATUS = 'E' AND (CVE_BITA IS NULL OR CVE_BITA = 0)
        ORDER BY FECHAELAB DESC
    `);
    
    console.log(`=== LISTA DE PEDIDOS CON STATUS 'E' Y SIN BITÁCORA (${pedidos.length} TOTAL) ===`);
    // Agruparlos en formato de texto fácil de copiar/leer
    const folios = pedidos.map(p => p.PEDIDO);
    
    // Mostrar en grupos de 5 para que sea más legible
    for (let i = 0; i < folios.length; i += 5) {
        console.log(folios.slice(i, i + 5).join(', '));
    }
    
    process.exit(0);
}
run().catch(console.error);

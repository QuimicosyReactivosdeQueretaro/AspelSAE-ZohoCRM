const db = require("./src/config/database");
async function run() {
    // Contar cuántos clientes en total no tienen vendedor
    const total = await db.query(`
        SELECT COUNT(*) AS TOTAL 
        FROM CLIE15 
        WHERE CVE_VEND IS NULL OR TRIM(CVE_VEND) = ''
    `);
    
    console.log("=== TOTAL DE CLIENTES SIN VENDEDOR EN SAE ===");
    console.log(total[0].TOTAL);
    
    // Traer los 15 más recientes (usando la CLAVE como indicador de antigüedad)
    const recientes = await db.query(`
        SELECT FIRST 15 TRIM(CLAVE) AS CLAVE, TRIM(NOMBRE) AS NOMBRE 
        FROM CLIE15 
        WHERE CVE_VEND IS NULL OR TRIM(CVE_VEND) = ''
        ORDER BY CLAVE DESC
    `);
    
    console.log("\n=== ÚLTIMOS 15 CLIENTES AGREGADOS QUE NO TIENEN VENDEDOR ===");
    console.table(recientes);
    process.exit(0);
}
run().catch(console.error);

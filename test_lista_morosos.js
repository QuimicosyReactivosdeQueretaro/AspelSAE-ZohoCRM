const db = require("./src/config/database");
async function run() {
    const morosos = await db.query(`
        SELECT 
            TRIM(CLAVE) AS CLAVE, 
            TRIM(NOMBRE) AS NOMBRE, 
            TRIM(RFC) AS RFC, 
            SALDO 
        FROM CLIE15 
        WHERE STATUS = 'M'
        ORDER BY CLAVE
    `);
    console.log("=== LISTA DE 32 CLIENTES MOROSOS (ESTATUS 'M') ===");
    console.table(morosos);
    process.exit(0);
}
run().catch(console.error);

const db = require("./src/config/database");
async function run() {
    // 1. Verificar el estatus ACTUAL del cliente 1487
    const cliente = await db.query(`
        SELECT TRIM(CLAVE) AS CLAVE, TRIM(NOMBRE) AS NOMBRE, STATUS 
        FROM CLIE15 
        WHERE TRIM(CLAVE) = '1487'
    `);
    console.log("=== ESTATUS ACTUAL DEL CLIENTE 1487 ===");
    console.table(cliente);

    // 2. Ver los detalles del pedido P-QR-034908
    const pedido = await db.query(`
        SELECT TRIM(CVE_DOC) AS PEDIDO, TRIM(CVE_CLPV) AS CLIENTE, STATUS, FECHAELAB 
        FROM FACTP15 
        WHERE TRIM(CVE_DOC) = 'P-QR-034908'
    `);
    console.log("\n=== DETALLES DEL PEDIDO P-QR-034908 ===");
    console.table(pedido);

    // 3. Revisar cómo está almacenada la clave del cliente en la cotización/pedido vs en CLIE15
    if (pedido.length > 0) {
        const claveEnPedido = pedido[0].CLIENTE;
        console.log("\nClave del cliente en el pedido (raw):", JSON.stringify(claveEnPedido));
        console.log("Clave del cliente en CLIE15 (raw):", JSON.stringify(cliente[0].CLAVE));
        
        // Verificar si hay diferencia de padding
        const clieRaw = await db.query(`
            SELECT CLAVE, STATUS FROM CLIE15 WHERE CLAVE = ?
        `, [claveEnPedido]);
        console.log("\nBúsqueda directa con la clave del pedido:");
        console.table(clieRaw);
    }

    process.exit(0);
}
run().catch(console.error);

const db = require("./src/config/database");
async function run() {
    // 1. Productos con saltos de línea, tabulaciones o caracteres invisibles
    const conSaltoLinea = await db.query(`
        SELECT TRIM(CVE_ART) AS CVE_ART, TRIM(DESCR) AS DESCRIPCION
        FROM INVE15 
        WHERE CVE_ART CONTAINING ASCII_CHAR(10)
        OR CVE_ART CONTAINING ASCII_CHAR(13)
        OR CVE_ART CONTAINING ASCII_CHAR(9)
    `);
    console.log("=== PRODUCTOS CON SALTOS DE LINEA O TABULACIONES ===");
    console.log("Total:", conSaltoLinea.length);
    if (conSaltoLinea.length > 0) console.table(conSaltoLinea);

    // 2. Productos con dobles espacios internos (no al inicio/final)
    const conDobleEspacio = await db.query(`
        SELECT TRIM(CVE_ART) AS CVE_ART, TRIM(DESCR) AS DESCRIPCION
        FROM INVE15 
        WHERE TRIM(CVE_ART) LIKE '%  %'
    `);
    console.log("\n=== PRODUCTOS CON DOBLE ESPACIO INTERNO ===");
    console.log("Total:", conDobleEspacio.length);
    if (conDobleEspacio.length > 0) console.table(conDobleEspacio);

    process.exit(0);
}
run().catch(console.error);

const db = require("./src/config/database");
async function run() {
    // 1. Buscar los productos EXACTOS que reportó el error
    const prod1 = await db.query(`
        SELECT TRIM(CVE_ART) AS CVE_ART, TRIM(DESCR) AS DESCRIPCION, STATUS
        FROM INVE15 
        WHERE TRIM(CVE_ART) = 'MAGL 130601034M'
    `);
    console.log("=== Búsqueda exacta: 'MAGL 130601034M' ===");
    console.log(prod1.length > 0 ? "ENCONTRADO" : "NO ENCONTRADO");
    if (prod1.length > 0) console.table(prod1);

    const prod2 = await db.query(`
        SELECT TRIM(CVE_ART) AS CVE_ART, TRIM(DESCR) AS DESCRIPCION, STATUS
        FROM INVE15 
        WHERE TRIM(CVE_ART) = 'MIND 105-005917'
    `);
    console.log("\n=== Búsqueda exacta: 'MIND 105-005917' ===");
    console.log(prod2.length > 0 ? "ENCONTRADO" : "NO ENCONTRADO");
    if (prod2.length > 0) console.table(prod2);

    // 2. Buscar con LIKE por si hay diferencia de espacios o caracteres
    const like1 = await db.query(`
        SELECT TRIM(CVE_ART) AS CVE_ART, TRIM(DESCR) AS DESCRIPCION, STATUS
        FROM INVE15 
        WHERE TRIM(CVE_ART) LIKE '%MAGL%130601034%'
    `);
    console.log("\n=== Búsqueda parcial MAGL...130601034 ===");
    if (like1.length > 0) console.table(like1); else console.log("NO ENCONTRADO");

    const like2 = await db.query(`
        SELECT TRIM(CVE_ART) AS CVE_ART, TRIM(DESCR) AS DESCRIPCION, STATUS
        FROM INVE15 
        WHERE TRIM(CVE_ART) LIKE '%MIND%105%005917%'
    `);
    console.log("\n=== Búsqueda parcial MIND...105...005917 ===");
    if (like2.length > 0) console.table(like2); else console.log("NO ENCONTRADO");

    // 3. Buscar solo por la parte numérica
    const num1 = await db.query(`
        SELECT TRIM(CVE_ART) AS CVE_ART, TRIM(DESCR) AS DESCRIPCION
        FROM INVE15 
        WHERE TRIM(CVE_ART) LIKE '%130601034%'
    `);
    console.log("\n=== Búsqueda por numero 130601034 ===");
    if (num1.length > 0) console.table(num1); else console.log("NO ENCONTRADO");

    const num2 = await db.query(`
        SELECT TRIM(CVE_ART) AS CVE_ART, TRIM(DESCR) AS DESCRIPCION
        FROM INVE15 
        WHERE TRIM(CVE_ART) LIKE '%005917%'
    `);
    console.log("\n=== Búsqueda por numero 005917 ===");
    if (num2.length > 0) console.table(num2); else console.log("NO ENCONTRADO");

    process.exit(0);
}
run().catch(console.error);

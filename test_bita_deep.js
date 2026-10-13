const db = require("./src/config/database");
async function run() {
    // 1. Estructura completa de BITA15
    const colsBita = await db.query(`SELECT TRIM(RDB$FIELD_NAME) AS CAMPO FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'BITA15' ORDER BY RDB$FIELD_POSITION`);
    console.log("=== COLUMNAS DE BITA15 ===");
    colsBita.forEach(c => console.log("  -", c.CAMPO));
    
    // 2. Muestra de datos de BITA15 (las ultimas 10 entradas)
    const muestraBita = await db.query(`SELECT FIRST 10 * FROM BITA15 ORDER BY CVE_BITA DESC`);
    console.log("\n=== ULTIMAS 10 ENTRADAS DE BITA15 ===");
    console.table(muestraBita);
    
    // 3. Estructura de ACTIVI15
    const colsActivi = await db.query(`SELECT TRIM(RDB$FIELD_NAME) AS CAMPO FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'ACTIVI15' ORDER BY RDB$FIELD_POSITION`);
    console.log("\n=== COLUMNAS DE ACTIVI15 ===");
    colsActivi.forEach(c => console.log("  -", c.CAMPO));
    
    // 4. Datos de ACTIVI15 (catálogo de actividades)
    const activi = await db.query(`SELECT * FROM ACTIVI15`);
    console.log("\n=== CONTENIDO COMPLETO DE ACTIVI15 ===");
    console.table(activi);
    
    process.exit(0);
}
run().catch(console.error);

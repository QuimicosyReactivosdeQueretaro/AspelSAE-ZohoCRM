const db = require("./src/config/database");
async function run() {
    // Buscar cualquier tabla que tenga columnas llamadas COMPUTADORA, MODULO, OPCION o NIVEL
    const cols = await db.query(`
        SELECT TRIM(r.RDB$RELATION_NAME) AS TABLA, TRIM(r.RDB$FIELD_NAME) AS CAMPO
        FROM RDB$RELATION_FIELDS r
        WHERE r.RDB$SYSTEM_FLAG = 0
        AND (
            r.RDB$FIELD_NAME LIKE '%COMPUTADORA%' OR 
            r.RDB$FIELD_NAME LIKE '%MODULO%' OR 
            r.RDB$FIELD_NAME LIKE '%OPCION%' OR 
            r.RDB$FIELD_NAME LIKE '%NIVEL%' OR
            r.RDB$FIELD_NAME LIKE '%VALOR%'
        )
        ORDER BY r.RDB$RELATION_NAME
    `);
    
    console.log("=== COLUMNAS SOSPECHOSAS EN LA BD ACTUAL ===");
    if(cols.length === 0) {
        console.log("No se encontró ninguna tabla con la estructura de la Bitácora del Sistema.");
    } else {
        console.table(cols);
    }
    process.exit(0);
}
run().catch(console.error);

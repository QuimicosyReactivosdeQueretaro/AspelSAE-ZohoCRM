const db = require("./src/config/database");
async function run() {
    // Revisamos la estructura y estatus de los clientes
    const statuses = await db.query(`
        SELECT STATUS, COUNT(*) AS TOTAL 
        FROM CLIE15 
        GROUP BY STATUS
    `);
    console.log("=== ESTADOS DE LOS CLIENTES (CLIE15) ===");
    console.table(statuses);

    // Revisamos campos relacionados a crédito / morosidad
    const cols = await db.query(`
        SELECT TRIM(RDB$FIELD_NAME) AS CAMPO 
        FROM RDB$RELATION_FIELDS 
        WHERE RDB$RELATION_NAME = 'CLIE15' 
        AND (RDB$FIELD_NAME LIKE '%STATUS%' OR RDB$FIELD_NAME LIKE '%MOROSO%' OR RDB$FIELD_NAME LIKE '%SUSPEN%' OR RDB$FIELD_NAME LIKE '%CRED%')
    `);
    console.log("\nCampos sospechosos en CLIE15:", cols.map(c => c.CAMPO).join(", "));

    process.exit(0);
}
run().catch(console.error);

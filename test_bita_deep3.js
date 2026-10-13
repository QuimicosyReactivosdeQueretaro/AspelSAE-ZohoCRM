const db = require("./src/config/database");
async function run() {
    // Ver el tamaño del campo NOM_USUARIO en BITA15
    const fieldInfo = await db.query(`
        SELECT f.RDB$FIELD_NAME, 
               t.RDB$FIELD_LENGTH AS LARGO,
               t.RDB$FIELD_TYPE AS TIPO
        FROM RDB$RELATION_FIELDS f
        JOIN RDB$FIELDS t ON f.RDB$FIELD_SOURCE = t.RDB$FIELD_NAME
        WHERE f.RDB$RELATION_NAME = 'BITA15'
        AND TRIM(f.RDB$FIELD_NAME) IN ('NOM_USUARIO', 'OBSERVACIONES', 'CVE_CAMPANIA', 'CVE_ACTIVIDAD', 'CVE_CLIE')
    `);
    console.log("=== TAMAÑOS DE CAMPOS EN BITA15 ===");
    fieldInfo.forEach(f => {
        console.log(`  ${f.RDB$FIELD_NAME.trim()}: ${f.LARGO} bytes, tipo ${f.TIPO}`);
    });
    
    // Ver algunos nombres de usuario existentes para ver el formato
    const nombres = await db.query(`SELECT DISTINCT NOM_USUARIO FROM BITA15 ORDER BY NOM_USUARIO`);
    console.log("\n=== TODOS LOS NOM_USUARIO DISTINTOS EN BITA15 ===");
    nombres.forEach(n => console.log("  -", JSON.stringify(n.NOM_USUARIO)));
    
    process.exit(0);
}
run().catch(console.error);

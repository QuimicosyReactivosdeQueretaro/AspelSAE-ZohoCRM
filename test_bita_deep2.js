const db = require("./src/config/database");
async function run() {
    // 1. Tabla CAMP15 (campañas) - de donde viene CVE_CAMPANIA
    const colsCamp = await db.query(`SELECT TRIM(RDB$FIELD_NAME) AS CAMPO FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CAMP15' ORDER BY RDB$FIELD_POSITION`);
    console.log("=== COLUMNAS DE CAMP15 ===");
    colsCamp.forEach(c => console.log("  -", c.CAMPO));
    
    const campSae = await db.query(`SELECT * FROM CAMP15 WHERE CVE_CAMPANIA = '_SAE_'`);
    console.log("\nCampaña _SAE_:");
    console.table(campSae);
    
    // 2. Buscar tabla de usuarios de SAE (SUC_USUARIO15)
    const colsUsr = await db.query(`SELECT TRIM(RDB$FIELD_NAME) AS CAMPO FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'SUC_USUARIO15' ORDER BY RDB$FIELD_POSITION`);
    console.log("\n=== COLUMNAS DE SUC_USUARIO15 ===");
    colsUsr.forEach(c => console.log("  -", c.CAMPO));
    
    const usuarios = await db.query(`SELECT FIRST 10 * FROM SUC_USUARIO15 ORDER BY CVE_USUARIO DESC`);
    console.log("\nÚltimos 10 usuarios:");
    console.table(usuarios);
    
    // 3. Ver qué CVE_BITA tiene el máximo actual y comparar con TBLCONTROL15
    const maxBita = await db.query(`SELECT MAX(CVE_BITA) AS MAX_BITA FROM BITA15`);
    const controlBita = await db.query(`SELECT ULT_CVE FROM TBLCONTROL15 WHERE ID_TABLA = 62`);
    console.log("\n=== COMPARAR CONTADORES ===");
    console.log("MAX CVE_BITA en BITA15:", maxBita[0].MAX_BITA);
    console.log("ULT_CVE en TBLCONTROL15 (ID_TABLA=62):", controlBita[0].ULT_CVE);
    
    process.exit(0);
}
run().catch(console.error);

const db = require("./src/config/database");
async function run() {
    // Revisar CNSEST15 - suena a "Consultas del Sistema" 
    const colsCNS = await db.query(`SELECT TRIM(RDB$FIELD_NAME) AS CAMPO FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CNSEST15' ORDER BY RDB$FIELD_POSITION`);
    console.log("Columnas de CNSEST15:", colsCNS.map(c=>c.CAMPO).join(", "));
    const muestraCNS = await db.query(`SELECT FIRST 3 * FROM CNSEST15`);
    if (muestraCNS.length > 0) { console.log("Muestra CNSEST15:"); console.table(muestraCNS); }
    else console.log("CNSEST15 esta vacia");
    
    // Revisar CONS_PER15 - suena a "Consultas Periódicas"
    const colsCON = await db.query(`SELECT TRIM(RDB$FIELD_NAME) AS CAMPO FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CONS_PER15' ORDER BY RDB$FIELD_POSITION`);
    console.log("\nColumnas de CONS_PER15:", colsCON.map(c=>c.CAMPO).join(", "));
    
    // Revisar CTRLBLOQUEO15
    const colsCTRL = await db.query(`SELECT TRIM(RDB$FIELD_NAME) AS CAMPO FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CTRLBLOQUEO15' ORDER BY RDB$FIELD_POSITION`);
    console.log("\nColumnas de CTRLBLOQUEO15:", colsCTRL.map(c=>c.CAMPO).join(", "));
    const muestraCTRL = await db.query(`SELECT FIRST 3 * FROM CTRLBLOQUEO15`);
    if (muestraCTRL.length > 0) { console.log("Muestra CTRLBLOQUEO15:"); console.table(muestraCTRL); }
    else console.log("CTRLBLOQUEO15 esta vacia");
    
    process.exit(0);
}
run().catch(console.error);

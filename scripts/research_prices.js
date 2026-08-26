const db = require('../src/config/database');

async function test() {
    try {
        console.log("=== BÚSQUEDA DE TABLAS DE PRECIOS ===");
        const tables = await db.query('SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG=0');
        const priceTables = tables.map(t => t['RDB$RELATION_NAME'].trim()).filter(t => t.includes('PREC') || t.includes('LIST'));
        console.log("Tablas encontradas:", priceTables);

        console.log("\n=== ESTRUCTURA DE CLIE16 ===");
        const clieCols = await db.query("SELECT FIRST 1 * FROM CLIE16");
        console.log(Object.keys(clieCols[0]).filter(k => k.includes('LIST') || k.includes('PREC')));
        
        console.log("\n=== ESTRUCTURA DE PRECIO_X_PROD16 ===");
        const precCols = await db.query("SELECT FIRST 1 * FROM PRECIO_X_PROD16");
        console.log(Object.keys(precCols[0]));
        
        if (priceTables.includes('PRECIOS16')) {
            console.log("\n=== CONTENIDO DE PRECIOS16 ===");
            const listas = await db.query("SELECT * FROM PRECIOS16");
            console.log(listas);
        }
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();

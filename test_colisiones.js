const db = require("./src/config/database");
async function run() {
    // Verificar si al limpiar caracteres invisibles y normalizar espacios
    // dos productos diferentes terminarian con la misma clave
    const todos = await db.query(`
        SELECT TRIM(CVE_ART) AS CVE_ART FROM INVE15
    `);
    
    // Función que limpia una clave (quita \t \n \r y colapsa dobles espacios)
    function limpiar(clave) {
        return clave.replace(/[\t\n\r]/g, '').trim().replace(/\s+/g, ' ');
    }
    
    // Agrupar por clave limpia
    const mapa = {};
    todos.forEach(p => {
        const original = p.CVE_ART;
        const limpia = limpiar(original);
        if (!mapa[limpia]) mapa[limpia] = [];
        mapa[limpia].push(original);
    });
    
    // Buscar colisiones (donde 2 productos diferentes tengan la misma clave limpia)
    const colisiones = Object.entries(mapa).filter(([k, v]) => v.length > 1);
    
    console.log("=== ANALISIS DE COLISIONES ===");
    console.log("Total de productos en SAE:", todos.length);
    console.log("Colisiones encontradas:", colisiones.length);
    
    if (colisiones.length > 0) {
        console.log("\n=== PRODUCTOS QUE COLISIONARIAN ===");
        colisiones.forEach(([claveLimpia, originales]) => {
            console.log("Clave limpia: '" + claveLimpia + "'");
            originales.forEach(o => console.log("  -> Original: '" + o + "'"));
        });
    } else {
        console.log("\nNO HAY COLISIONES. Es 100% seguro hacer la búsqueda flexible.");
    }

    process.exit(0);
}
run().catch(console.error);

require('dotenv').config();
const db = require('../src/config/database');

async function investigar() {
    try {
        console.log("1. Extrayendo columnas de INVE15 (Productos)...");
        const inve = await db.query("SELECT FIRST 1 * FROM INVE15");
        if (inve.length > 0) {
            console.log("Columnas de INVE15:", Object.keys(inve[0]));
        }

        console.log("\n2. Buscando tablas relacionadas con Lineas (CLIN) o Marcas...");
        const tablas = await db.query(`
            SELECT TRIM(RDB$RELATION_NAME) AS TABLA 
            FROM RDB$RELATIONS 
            WHERE RDB$SYSTEM_FLAG = 0 
            AND (RDB$RELATION_NAME LIKE '%LIN%' OR RDB$RELATION_NAME LIKE '%MARC%' OR RDB$RELATION_NAME LIKE '%CVLI%' OR RDB$RELATION_NAME LIKE '%CAMP%')
        `);
        console.log("Tablas encontradas:", tablas.map(t => t.TABLA));

        console.log("\n3. Si existe CLIN15, extraer un registro...");
        try {
            const clin = await db.query("SELECT FIRST 1 * FROM CLIN15");
            if (clin.length > 0) {
                console.log("Columnas de CLIN15:", Object.keys(clin[0]));
                console.log("Ejemplo de CLIN15:", clin[0]);
            }
        } catch(e) {
            console.log("La tabla CLIN15 no existe o falló.");
        }

        console.log("\n4. Si existe CVLI15 (Campos Libres Inventario), extraer un registro...");
        try {
            const cvli = await db.query("SELECT FIRST 1 * FROM CVLI15");
            if (cvli.length > 0) {
                console.log("Columnas de CVLI15:", Object.keys(cvli[0]));
                console.log("Ejemplo de CVLI15:", cvli[0]);
            }
        } catch(e) {
            console.log("La tabla CVLI15 no existe o falló.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

investigar();

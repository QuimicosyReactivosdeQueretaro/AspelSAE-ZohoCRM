require('dotenv').config();
const db = require('../src/config/database');

async function investigarAlmacenes() {
    try {
        console.log("1. Buscando catálogo de almacenes (ALMACENES15 / ALMA15)...");
        let catAlma = [];
        try {
            catAlma = await db.query("SELECT * FROM ALMACENES15");
        } catch(e) {
            try {
                catAlma = await db.query("SELECT * FROM ALMA15");
            } catch(e2) {
                console.log("No se encontró tabla ALMACENES15 ni ALMA15.");
            }
        }
        console.log("Almacenes:", catAlma);

        console.log("\n2. Buscando tabla de multi-almacén (MULT15)...");
        try {
            const mult = await db.query("SELECT FIRST 5 * FROM MULT15");
            console.log("Columnas MULT15:", Object.keys(mult[0]));
            console.log("Ejemplo MULT15:", mult[0]);
        } catch(e) {
            console.log("No se encontró tabla MULT15.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

investigarAlmacenes();

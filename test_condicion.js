const db = require("./src/config/database");
const fs = require('fs');

async function run() {
    // 1. Ver estructura del campo CONDICION
    const fieldInfo = await db.query(`
        SELECT TRIM(f.RDB$FIELD_NAME) AS CAMPO, t.RDB$FIELD_LENGTH AS LARGO
        FROM RDB$RELATION_FIELDS f
        JOIN RDB$FIELDS t ON f.RDB$FIELD_SOURCE = t.RDB$FIELD_NAME
        WHERE f.RDB$RELATION_NAME = 'FACTC15' AND TRIM(f.RDB$FIELD_NAME) = 'CONDICION'
    `);
    console.log("=== ESTRUCTURA DEL CAMPO CONDICION EN SAE ===");
    console.table(fieldInfo);

    // 2. Ver cómo lo usan los vendedores actualmente
    const uso = await db.query(`
        SELECT TRIM(CONDICION) AS CONDICION_TEXTO, COUNT(*) AS VECES_USADO
        FROM FACTC15
        WHERE CONDICION IS NOT NULL AND TRIM(CONDICION) <> ''
        GROUP BY 1
        ORDER BY 2 DESC
    `);
    console.log("\n=== TOP 10 USOS REALES DE 'CONDICION' EN COTIZACIONES ===");
    console.table(uso.slice(0,10));

    // 3. Revisar si el middleware ya lo inserta con algo por defecto
    const codigo = fs.readFileSync('C:/zoho-sae-middleware/src/services/saeWrite.js', 'utf8');
    const lineas = codigo.split('\n');
    console.log("\n=== CÓDIGO ACTUAL EN SAEWRITE PARA CONDICION ===");
    lineas.forEach(l => {
        if (l.includes('CONDICION') && l.includes('INSERT')) {
            console.log(l.trim());
        }
    });

    process.exit(0);
}
run().catch(console.error);

const db = require('./src/config/database');

async function run() {
    try {
        const query = `
            SELECT 
                TRIM(CVE_ART) as CVE_ART, 
                MIN(FCHCADUC) as MIN_FCHCADUC,
                SUM(CANTIDAD) as TOTAL_CANTIDAD
            FROM LTPD15 
            WHERE CANTIDAD > 0 AND STATUS = 'A'
            GROUP BY CVE_ART
            ROWS 1 TO 10
        `;
        const rows = await db.query(query);
        console.log("Muestra de caducidades:", rows);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit();
    }
}
run();

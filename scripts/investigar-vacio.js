require('dotenv').config();
const db = require('../src/config/database');

async function investigarVacio() {
    try {
        const query = `
            SELECT 
                TRIM(i.CVE_ART) as CVE_ART,
                TRIM(i.DESCR) as DESCR,
                TRIM(i.LIN_PROD) as LIN_PROD,
                TRIM(c.DESC_LIN) as DESC_LIN
            FROM INVE15 i
            LEFT JOIN CLIN15 c ON i.LIN_PROD = c.CVE_LIN
            WHERE TRIM(i.CVE_ART) IN ('LIFO L26A000', 'KWIK 0365P', 'ADVA Z672548')
        `;
        const result = await db.query(query);
        console.log(result);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

investigarVacio();

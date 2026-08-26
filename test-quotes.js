const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function testQuery() {
    try {
        const fact = await db.query(`SELECT FIRST 2 CVE_DOC, RFC, DAT_ENVIO, CVE_CLPV FROM FACTC16 ORDER BY FECHA_DOC DESC, CVE_DOC DESC`);
        console.log("Latest Quotes in FACTC16:", fact);
        
        const envios = await db.query(`SELECT * FROM ENVIOS16 WHERE TRIM(CVE_INFO) = '271'`);
        console.log("Envios for 271:", envios);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

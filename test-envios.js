const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function testQuery() {
    try {
        const envio = await db.query(`SELECT * FROM INFENVIO16 WHERE CVE_INFO = 72732`);
        console.log("Envio 72732:", envio);
        
        // Also let's check how many envios client 271 has
        const enviosClie = await db.query(`SELECT CVE_INFO, CVE_CONS FROM INFENVIO16 WHERE TRIM(CVE_CONS) = '271'`);
        console.log("Envios for 271:", enviosClie);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

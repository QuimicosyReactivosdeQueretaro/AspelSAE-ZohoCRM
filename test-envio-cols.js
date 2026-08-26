const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function testQuery() {
    try {
        const envio = await db.query(`SELECT FIRST 1 * FROM INFENVIO16 WHERE CVE_INFO = 72732`);
        console.log("Keys in INFENVIO16:", Object.keys(envio[0]));
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

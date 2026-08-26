const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function testQuery() {
    try {
        const fact = await db.query(`SELECT CVE_DOC, RFC, DAT_ENVIO, CVE_CLPV, NUM_ALMA, CVE_VEND FROM FACTC16 WHERE CVE_DOC IN ('C-QR-025242', 'C-QR-025196')`);
        console.log("Quotes comparison:", fact);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function testQuery() {
    try {
        const native = await db.query(`SELECT * FROM FACTC16 WHERE CVE_DOC = 'C-QR-025196'`);
        const zoho = await db.query(`SELECT * FROM FACTC16 WHERE CVE_DOC = 'C-QR-025245'`);
        
        console.log("Native:", native[0]);
        console.log("Zoho:", zoho[0]);
        
        for (let key of Object.keys(native[0])) {
            if (String(native[0][key]).trim() !== String(zoho[0][key]).trim()) {
                console.log(`Diff on ${key}: Native='${native[0][key]}' vs Zoho='${zoho[0][key]}'`);
            }
        }
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

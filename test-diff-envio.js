const db = require('./src/config/database');

async function testQuery() {
    try {
        const zoho = await db.query(`SELECT * FROM INFENVIO16 WHERE CVE_INFO = 73092`);
        const native = await db.query(`SELECT * FROM INFENVIO16 WHERE CVE_INFO = 72732`);
        
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

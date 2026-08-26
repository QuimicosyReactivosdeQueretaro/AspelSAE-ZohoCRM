const db = require('./src/config/database');

async function testQuery() {
    try {
        const fact = await db.query(`SELECT CVE_DOC, RFC, CHAR_LENGTH(RFC) as len FROM FACTC16 WHERE CVE_DOC IN ('C-QR-025247', 'C-QR-025244')`);
        console.log("Lengths:", fact);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

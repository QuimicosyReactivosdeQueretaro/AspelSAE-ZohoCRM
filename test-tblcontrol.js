const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function testQuery() {
    try {
        const tbl = await db.query(`SELECT * FROM TBLCONTROL16 WHERE ULT_CVE IN (73088, 155538)`);
        console.log("TBLCONTROL16 Matches:", tbl);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

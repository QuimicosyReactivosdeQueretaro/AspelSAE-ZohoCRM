const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function testQuery() {
    try {
        const fact = await db.query(`SELECT CVE_DOC, RFC, DAT_ENVIO, CVE_CLPV, NUM_ALMA, CVE_VEND, UUID FROM FACTC16 WHERE CVE_DOC IN ('C-QR-025242', 'C-QR-025243')`);
        console.log("Quotes comparison:", fact);
        
        // Find tables related to shipping
        const tables = await db.query(`SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0 AND RDB$RELATION_NAME LIKE '%ENVIO%' OR RDB$RELATION_NAME LIKE '%DIR%'`);
        console.log("Tables:", tables.map(t => t.RDB$RELATION_NAME.trim()));
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

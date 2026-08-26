const db = require('./src/config/database');

async function testQuery() {
    try {
        const alma = await db.query(`SELECT * FROM ALMACENES16 WHERE CVE_ALM = 1`);
        console.log("Almacen 1:", alma);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

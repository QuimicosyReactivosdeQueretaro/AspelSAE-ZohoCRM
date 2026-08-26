const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function testQuery() {
    try {
        const maxEnv = await db.query(`SELECT MAX(CVE_INFO) as MAX_ID FROM INFENVIO16`);
        console.log("Max CVE_INFO:", maxEnv);
        
        const folios = await db.query(`SELECT * FROM TBLCONTROL16 WHERE ID_TABLA IN (71, 72, 73, 74, 45, 23)`); 
        console.log("TBLCONTROL16 IDs:", folios);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

const db = require('./src/config/database');
async function run() {
    const query = "SELECT CVE_ART, DESCR, LIN_PROD FROM INVE15 WHERE DESCR LIKE '%ANALIZADOR%'";
    const result = await db.query(query);
    console.log(result.slice(0, 50));
}
run().catch(console.error).finally(()=>process.exit(0));

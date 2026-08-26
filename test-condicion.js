const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function testQuery() {
    try {
        const fact = await db.query(`SELECT CONDICION, NUM_PAGOS, METODODEPAGO, FORMAENVIO, ENLAZADO, TIP_DOC_E, UUID, FORMADEPAGOSAT, USO_CFDI FROM FACTC16 WHERE CVE_DOC = 'C-QR-025247'`);
        const native = await db.query(`SELECT CONDICION, NUM_PAGOS, METODODEPAGO, FORMAENVIO, ENLAZADO, TIP_DOC_E, UUID, FORMADEPAGOSAT, USO_CFDI FROM FACTC16 WHERE CVE_DOC = 'C-QR-025196'`);
        
        console.log("New Quote 025247:", fact[0]);
        console.log("Native 025196:", native[0]);
        
        for (let key of Object.keys(native[0])) {
            if (String(native[0][key]).trim() !== String(fact[0][key]).trim()) {
                console.log(`Diff on ${key}: Native='${native[0][key]}' vs Zoho='${fact[0][key]}'`);
            }
        }
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

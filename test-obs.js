const db = require('./src/config/database');
const logger = require('./src/utils/logger');

async function testQuery() {
    try {
        const rows = await db.query(`SELECT FIRST 5 CVE_OBS, CAST(STR_OBS AS VARCHAR(255)) as STR_OBS FROM OBS_DOCF16 ORDER BY CVE_OBS DESC`);
        console.log("OBS_DOCF16:", rows);
        
        const folios = await db.query(`SELECT * FROM TBLCONTROL16 WHERE ID_TABLA IN (45, 46, 47, 48)`); 
        console.log("TBLCONTROL16:", folios);
        
        const client = await db.query(`SELECT CLAVE, NOMBRE, RFC FROM CLIE16 WHERE TRIM(CLAVE) = '271'`);
        console.log("Client 271:", client);
        
        const fact = await db.query(`SELECT FIRST 1 CVE_DOC, DAT_ENVIO FROM FACTC16 ORDER BY FECHA_DOC DESC`);
        console.log("FACTC16 fields DAT_ENVIO:", fact);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

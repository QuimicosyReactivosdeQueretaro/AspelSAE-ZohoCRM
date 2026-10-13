const saeRead = require("./src/services/saeRead");
const db = require("./src/config/database");

async function run() {
    const cveArtLimpia = "MIND 105-005917".trim().replace(/\s+/g, ' ');
    const queryFlexible = `
        SELECT TRIM(i.CVE_ART) as CVE_ART
        FROM INVE15 i 
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(TRIM(i.CVE_ART), ASCII_CHAR(9), ''), ASCII_CHAR(10), ''), ASCII_CHAR(13), ''), '  ', ' ') = ?`;
    const rowsFlex = await db.query(queryFlexible, [cveArtLimpia]);
    console.table(rowsFlex);
    process.exit(0);
}
run().catch(console.error);

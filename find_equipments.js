const db = require('./src/config/database');
async function run() {
    const query = "SELECT CVE_ART, DESCR FROM INVE15 WHERE DESCR LIKE '%ANALIZADOR%' OR DESCR LIKE '%SISTEMA%' OR DESCR LIKE '%EQUIPO%'";
    const result = await db.query(query);
    const words = {};
    for (let row of result) {
        const firstWord = row.DESCR.split(' ')[0].trim();
        if (firstWord.length > 2) {
            words[firstWord] = (words[firstWord] || 0) + 1;
        }
    }
    console.log("Palabras más repetidas en nombres de equipos:", Object.entries(words).sort((a,b)=>b[1]-a[1]).slice(0, 15));
    
    // Y probemos sacando algunas líneas de productos comunes
    const queryLines = "SELECT DISTINCT LIN_PROD FROM INVE15";
    const lines = await db.query(queryLines);
    console.log("Total líneas de producto:", lines.length);
}
run().catch(console.error).finally(()=>process.exit(0));

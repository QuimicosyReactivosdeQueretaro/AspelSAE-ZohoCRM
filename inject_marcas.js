const db = require('./src/config/database');
const zohoApi = require('./src/services/zohoApi');

async function syncBrands() {
    try {
        console.log("Extrayendo productos de SAE con existencias...");
        const query = `
            SELECT TRIM(i.CVE_ART) as CVE, TRIM(c.CAMPLIB1) as MARCA 
            FROM INVE15 i 
            JOIN INVE_CLIB15 c ON i.CVE_ART = c.CVE_PROD 
            WHERE i.STATUS='A' AND i.EXIST > 0 
            AND c.CAMPLIB1 IS NOT NULL AND TRIM(c.CAMPLIB1) <> ''
        `;
        const rows = await db.query(query);
        console.log(`Encontrados ${rows.length} productos con marca en SAE.`);

        if (rows.length === 0) return;

        const allProducts = rows.map(r => ({
            Product_Code: r.CVE,
            Marca: r.MARCA
        }));

        // Zoho permite hasta 100 registros por petición
        const BATCH_SIZE = 100;
        let totalUpdated = 0;
        let totalAdded = 0;
        let totalErrors = 0;

        for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
            const batch = allProducts.slice(i, i + BATCH_SIZE);
            console.log(`Procesando lote ${i / BATCH_SIZE + 1} de ${Math.ceil(allProducts.length / BATCH_SIZE)}...`);
            
            const response = await zohoApi.upsertProducts(batch);
            
            if (response && response.data) {
                response.data.forEach(item => {
                    if (item.status === 'success') {
                        if (item.action === 'update') totalUpdated++;
                        if (item.action === 'insert') totalAdded++;
                    } else {
                        totalErrors++;
                        console.error("Error en un producto:", item.details);
                    }
                });
            }
            
            // Pausa breve para no saturar el API de Zoho
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log("=========================================");
        console.log("INYECCIÓN COMPLETADA");
        console.log(`Actualizados: ${totalUpdated}`);
        console.log(`Nuevos (duplicados accidentalmente): ${totalAdded}`);
        console.log(`Errores: ${totalErrors}`);
        console.log("=========================================");

    } catch (e) {
        console.error("Error crítico:", e.message);
    }
    process.exit(0);
}
syncBrands();

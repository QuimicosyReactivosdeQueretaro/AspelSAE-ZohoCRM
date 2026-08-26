require('dotenv').config({ path: '../.env' });
const saeRead = require('../src/services/saeRead');
const zohoApi = require('../src/services/zohoApi');
const logger = require('../src/utils/logger');

async function run() {
    try {
        logger.info('Iniciando sincronización inicial de caducidades...');
        
        // 1. Obtener todos los productos y sus caducidades usando el extractor principal
        const productosSae = await saeRead.getProductosDeltaSync();
        
        // 2. Filtrar solo los productos que SI tienen lote y SI tienen una caducidad próxima
        const productosConLote = productosSae.filter(p => p.CON_LOTE === 'S' && p.MIN_FCHCADUC);
        
        logger.info(`Se encontraron ${productosConLote.length} productos con lote activo y fecha de caducidad válida.`);
        
        if (productosConLote.length === 0) {
            logger.info('No hay productos que actualizar.');
            process.exit(0);
        }

        // 3. Enviarlos a Zoho en lotes de 100
        const limit = 100;
        let offset = 0;
        
        while (offset < productosConLote.length) {
            const batch = productosConLote.slice(offset, offset + limit);
            
            const zohoProducts = batch.map(p => ({
                Product_Code: p.CVE_ART, 
                Codigo_SAE: p.CVE_ART,   
                Con_lote: 'Sí',
                Fecha_de_caducidad: new Date(p.MIN_FCHCADUC).toISOString().split('T')[0]
            }));

            logger.info(`Enviando lote de ${zohoProducts.length} caducidades a Zoho...`);
            const response = await zohoApi.upsertProducts(zohoProducts);
            
            if (response && response.data) {
                const successCount = response.data.filter(r => r.status === 'success').length;
                logger.info(`Lote completado. Éxitos: ${successCount}`);
            }
            
            offset += limit;
            if (offset < productosConLote.length) {
                // Pausa para no saturar la API
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        logger.info('¡Sincronización inicial de caducidades terminada exitosamente!');
    } catch (e) {
        logger.error(`Error en inyección de caducidades: ${e.message}`);
    } finally {
        process.exit();
    }
}

run();

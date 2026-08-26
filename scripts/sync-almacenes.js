require('dotenv').config();
const saeRead = require('../src/services/saeRead');
const zohoApi = require('../src/services/zohoApi');
const logger = require('../src/utils/logger');

/**
 * ============================================================================
 * ARCHIVO: sync-almacenes.js
 * ============================================================================
 * Script de inyección masiva para poblar los almacenes individuales en Zoho.
 * Recorre TODOS los productos en SAE e inyecta las cantidades de los almacenes:
 * 1 (Qro), 2 (Xal), 3 (SLP), 4 (Hua) y 14 (CDMX).
 * ============================================================================
 */

async function main() {
    logger.info('=== INICIANDO EXTRACCIÓN MASIVA DE MULTIALMACENES ===');
    try {
        let totalProcessed = 0;
        let totalSent = 0;
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            logger.info(`Extrayendo productos de SAE (Offset: ${offset})...`);
            
            const productosSae = await saeRead.getProductosSync(limit, offset);
            
            if (!productosSae || productosSae.length === 0) {
                hasMore = false;
                break;
            }

            logger.info(`Empaquetando ${productosSae.length} productos para Zoho...`);
            
            const zohoProducts = productosSae.map(p => ({
                Product_Name: p.DESCR || 'Sin Descripción',
                Product_Code: p.CVE_ART, 
                Codigo_SAE: p.CVE_ART,
                
                // Nuevos campos de almacenes individuales
                Quer_taro: p.ALM_QRO || 0,
                Xalapa: p.ALM_XAL || 0,
                San_Luis_Potosi: p.ALM_SLP || 0,
                Huasteca: p.ALM_HUA || 0,
                Ciudad_de_M_xico: p.ALM_CDMX || 0
            }));

            const response = await zohoApi.upsertProducts(zohoProducts);
            if (response && response.data) {
                const successCount = response.data.filter(r => r.status === 'success').length;
                logger.info(`Lote enviado a Zoho. Éxitos: ${successCount}`);
                totalSent += successCount;
            }
            
            // Pausa de 1.5 segundos para no ahogar a Zoho
            await new Promise(resolve => setTimeout(resolve, 1500));

            totalProcessed += productosSae.length;
            offset += limit;
        }

        logger.info('====================================================');
        logger.info('INYECCIÓN MASIVA FINALIZADA');
        logger.info(`Total de productos revisados en SAE: ${totalProcessed}`);
        logger.info(`Total de productos actualizados en Zoho: ${totalSent}`);
        logger.info('====================================================');
        
        process.exit(0);

    } catch (error) {
        logger.error(`Error en inyección masiva de almacenes: ${error.message}`);
        process.exit(1);
    }
}

main();

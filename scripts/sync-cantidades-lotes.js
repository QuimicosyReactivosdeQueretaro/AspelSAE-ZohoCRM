require('dotenv').config();
const saeRead = require('../src/services/saeRead');
const zohoApi = require('../src/services/zohoApi');
const logger = require('../src/utils/logger');

/**
 * ============================================================================
 * ARCHIVO: sync-cantidades-lotes.js
 * ============================================================================
 * Script de inyección masiva para poblar las CANTIDADES de los lotes en Zoho.
 * Recorre TODOS los productos en SAE e inyecta: Lote_1, Lote_2 y Lote_3
 * ============================================================================
 */

async function main() {
    logger.info('=== INICIANDO EXTRACCIÓN MASIVA DE CANTIDADES DE LOTES ===');
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
                
                // Cantidades de los lotes
                Lote_1: p.CANTIDAD_LOTE_1 || 0,
                Lote_2: p.CANTIDAD_LOTE_2 || 0,
                Lote_3: p.CANTIDAD_LOTE_3 || 0
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
        logger.info('INYECCIÓN MASIVA FINALIZADA (CANTIDADES LOTES)');
        logger.info(`Total de productos revisados en SAE: ${totalProcessed}`);
        logger.info(`Total de productos actualizados en Zoho: ${totalSent}`);
        logger.info('====================================================');
        
        process.exit(0);

    } catch (error) {
        logger.error(`Error en inyección masiva de lotes: ${error.message}`);
        process.exit(1);
    }
}

main();

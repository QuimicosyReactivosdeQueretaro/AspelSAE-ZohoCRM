require('dotenv').config();
const saeRead = require('../src/services/saeRead');
const zohoApi = require('../src/services/zohoApi');
const logger = require('../src/utils/logger');

/**
 * ============================================================================
 * ARCHIVO: sync-3-caducidades.js
 * ============================================================================
 * ¿Para qué sirve?
 * Este es un script de inyección masiva de una sola ejecución.
 * Recorre todos los productos en SAE, filtra los que tienen lote, extrae
 * las 3 caducidades más próximas a partir de la fecha de ejecución (CURRENT_DATE)
 * y las inyecta a los campos personalizados de Zoho CRM.
 * ============================================================================
 */

async function main() {
    logger.info('=== INICIANDO EXTRACCIÓN MASIVA DE 3 CADUCIDADES ===');
    try {
        let totalProcessed = 0;
        let totalSent = 0;
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            logger.info(`Extrayendo productos de SAE (Offset: ${offset})...`);
            
            // Usamos la nueva versión de getProductosSync que ya junta las fechas internamente
            const productosSae = await saeRead.getProductosSync(limit, offset);
            
            if (!productosSae || productosSae.length === 0) {
                hasMore = false;
                break;
            }

            // Filtrar solo los productos que manejan lote
            const lotProducts = productosSae.filter(p => p.CON_LOTE === 'S');
            
            if (lotProducts.length > 0) {
                logger.info(`Empaquetando ${lotProducts.length} productos con lote para Zoho...`);
                
                const zohoProducts = lotProducts.map(p => ({
                    Product_Name: p.DESCR || 'Sin Descripción',
                    Product_Code: p.CVE_ART, 
                    Codigo_SAE: p.CVE_ART,
                    // No enviamos existencia ni precios para no sobreescribir,
                    // aunque Zoho upsert con duplicate_check_fields solo actualiza lo que mandas.
                    Fecha_de_caducidad: p.FCHCADUC_1 ? new Date(p.FCHCADUC_1).toISOString().split('T')[0] : null,
                    Fecha_de_caducidad_2: p.FCHCADUC_2 ? new Date(p.FCHCADUC_2).toISOString().split('T')[0] : null,
                    Fecha_de_caducidad_3: p.FCHCADUC_3 ? new Date(p.FCHCADUC_3).toISOString().split('T')[0] : null
                }));

                const response = await zohoApi.upsertProducts(zohoProducts);
                if (response && response.data) {
                    const successCount = response.data.filter(r => r.status === 'success').length;
                    logger.info(`Lote enviado a Zoho. Éxitos: ${successCount}`);
                    totalSent += successCount;
                }
                
                // Pausa para no ahogar a Zoho
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            totalProcessed += productosSae.length;
            offset += limit;
        }

        logger.info('====================================================');
        logger.info('INYECCIÓN MASIVA FINALIZADA');
        logger.info(`Total de productos revisados en SAE: ${totalProcessed}`);
        logger.info(`Total de productos con lotes inyectados a Zoho: ${totalSent}`);
        logger.info('====================================================');
        
        // Salir forzosamente para liberar consola
        process.exit(0);

    } catch (error) {
        logger.error(`Error en inyección masiva: ${error.message}`);
        process.exit(1);
    }
}

main();

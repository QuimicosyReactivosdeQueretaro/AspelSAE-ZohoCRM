const zohoApi = require('../services/zohoApi');
const db = require('../config/database');
const logger = require('../utils/logger');

class SyncFacturas {
    
    async run() {
        logger.info('Iniciando sincronización de facturas (Zoho -> SAE)...');
        
        try {
            // 1. Obtener cotizaciones con pedido de SAE y Facturado vacío
            const response = await zohoApi._request('GET', '/Quotes/search?criteria=(Folio_de_Pedido_Sae:starts_with:P)');
            const quotes = response.data || [];
            
            // Filtramos localmente los que aún no tienen el campo Facturado lleno
            const quotesPendientes = quotes.filter(q => q.Facturado === null || q.Facturado === '');
            logger.info(`Se encontraron ${quotesPendientes.length} pedidos en Zoho pendientes de facturar.`);
            
            let actualizados = 0;

            for (const quote of quotesPendientes) {
                const folioPedido = quote.Folio_de_Pedido_Sae;
                
                try {
                    let folioFactura = null;

                    // 2. Buscar si el pedido se convirtió en remisión
                    const remRows = await db.query(
                        `SELECT CVE_DOC FROM FACTR15 WHERE DOC_ANT = ?`, 
                        [folioPedido]
                    );

                    if (remRows.length > 0) {
                        const folioRemision = remRows[0].CVE_DOC;
                        // 3. Buscar si la remisión se convirtió en factura
                        const factRows = await db.query(
                            `SELECT CVE_DOC FROM FACTF15 WHERE DOC_ANT = ?`,
                            [folioRemision]
                        );
                        if (factRows.length > 0) {
                            folioFactura = factRows[0].CVE_DOC;
                        }
                    } else {
                        // 4. Búsqueda alternativa: ¿se facturó el pedido directamente sin remisión?
                        const factDirectRows = await db.query(
                            `SELECT CVE_DOC FROM FACTF15 WHERE DOC_ANT = ?`,
                            [folioPedido]
                        );
                        if (factDirectRows.length > 0) {
                            folioFactura = factDirectRows[0].CVE_DOC;
                        }
                    }

                    // 5. Si encontramos factura, actualizar en Zoho
                    if (folioFactura) {
                        const updatePayload = {
                            data: [
                                {
                                    id: quote.id,
                                    Facturado: folioFactura.trim()
                                }
                            ]
                        };
                        
                        await zohoApi._request('PUT', '/Quotes', updatePayload);
                        logger.info(`Zoho actualizado: Cotización ID ${quote.id} facturada con folio ${folioFactura.trim()}`);
                        actualizados++;
                    }
                    
                } catch (error) {
                    logger.error(`Error procesando pedido ${folioPedido}: ${error.message}`);
                }
            }
            
            logger.info(`Sincronización finalizada. Se actualizaron ${actualizados} pedidos.`);
            
        } catch (error) {
            logger.error(`Error en la sincronización general: ${error.message}`);
        }
    }
}

module.exports = new SyncFacturas();

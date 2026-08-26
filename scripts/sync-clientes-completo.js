require('dotenv').config();
const db = require('../src/config/database');
const zohoApi = require('../src/services/zohoApi');
const saeRead = require('../src/services/saeRead');
const logger = require('../src/utils/logger');

/**
 * ============================================================================
 * ARCHIVO: sync-clientes-completo.js
 * ============================================================================
 * Script de inyección masiva para poblar TODOS los clientes desde SAE a Zoho CRM.
 * Incluye cruce del catálogo de Precios (Price Books).
 * ============================================================================
 */

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncClientesCompleto() {
    try {
        logger.info("=== INICIANDO INYECCIÓN MASIVA COMPLETA DE CLIENTES ===");

        // 1. Obtener los Price Books de Zoho para tener sus IDs
        logger.info("1. Obteniendo Catálogos de Precios desde Zoho...");
        let zohoPriceBooks = [];
        try {
            const pbRes = await zohoApi._request('GET', '/Price_Books?fields=id,Price_Book_Name');
            zohoPriceBooks = pbRes.data || [];
        } catch (e) {
            if (!e.message.includes('NO_CONTENT')) throw e;
        }

        // 2. Obtener nombres de listas desde SAE (Empresa 15) para cruzar
        logger.info("2. Consultando nombres de listas en SAE (PRECIOS15)...");
        const precios15 = await db.query("SELECT CVE_PRECIO, DESCRIPCION FROM PRECIOS15");
        
        const listIdToZohoPbId = {};
        for (const lista of precios15) {
            const nombre = lista.DESCRIPCION ? lista.DESCRIPCION.trim() : `Lista ${lista.CVE_PRECIO}`;
            const matchedPb = zohoPriceBooks.find(pb => pb.Price_Book_Name.trim() === nombre);
            if (matchedPb) {
                listIdToZohoPbId[lista.CVE_PRECIO] = matchedPb.id;
            }
        }
        
        // Obtener la lista pública (Lista 1)
        const listaPublicaId = listIdToZohoPbId[1];
        if (!listaPublicaId) {
            logger.warn("CUIDADO: No se encontró la Lista 1 (Público) en Zoho.");
        }

        // 3. Obtener Clientes de SAE completos (usando nuestro extractor saeRead)
        logger.info("3. Obteniendo clientes completos desde SAE...");
        const clientesSae = await saeRead.getClientesSync(10000, 0); // Traemos hasta 10000
        logger.info(`Se encontraron ${clientesSae.length} clientes activos en SAE.`);

        // 4. Armar el payload para Zoho
        logger.info("4. Vinculando clientes en Zoho con TODOS sus datos...");
        const zohoContacts = [];
        for (const c of clientesSae) {
            let pbId = null;
            if (c.LISTA_PREC && listIdToZohoPbId[c.LISTA_PREC]) {
                pbId = listIdToZohoPbId[c.LISTA_PREC];
            } else {
                pbId = listaPublicaId; 
            }

            let cleanedPhone = c.TELEFONO ? c.TELEFONO.replace(/[^0-9+\-\s()]/g, '').substring(0, 30).trim() : '';
            if (!/\d/.test(cleanedPhone)) cleanedPhone = '';

            // Mapeo completo
            const contactPayload = {
                Last_Name: c.NOMBRE || 'Sin Nombre',
                Clave_Sae: c.CLAVE.trim(),
                RFC_Sae: c.RFC || '',
                Phone: cleanedPhone,
                Email: (c.EMAILPRED && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(c.EMAILPRED.trim())) ? c.EMAILPRED.trim() : '',
                R_gimen_Fiscal_Sae: c.REG_FISC || '',
                Vendedor_Sae: c.CVE_VEND || '',
                Mailing_Street: [c.CALLE, c.NUMEXT, c.NUMINT].filter(Boolean).join(' '),
                Mailing_City: c.MUNICIPIO || '',
                Mailing_State: c.ESTADO || '',
                Mailing_Zip: c.CODIGO || ''
            };

            // Solo enviar la lista de precios si se encontró el ID en Zoho
            if (pbId) {
                contactPayload.Lista_De_Precios_Sae = pbId;
            }

            zohoContacts.push(contactPayload);
        }

        // 5. Enviar a Zoho en lotes de 100
        logger.info("5. Iniciando envío a Zoho CRM...");
        const CHUNK_SIZE = 100;
        let successCount = 0;
        for (let i = 0; i < zohoContacts.length; i += CHUNK_SIZE) {
            const chunk = zohoContacts.slice(i, i + CHUNK_SIZE);
            const payload = {
                data: chunk,
                duplicate_check_fields: ["Clave_Sae"]
            };
            
            try {
                const response = await zohoApi._request('POST', '/Contacts/upsert', payload);
                if (response && response.data) {
                    const oks = response.data.filter(r => r.status === 'success').length;
                    successCount += oks;
                    
                    const errors = response.data.filter(r => r.status === 'error');
                    if (errors.length > 0) {
                        logger.warn(`  -> Hubo errores en lote. Ejemplo: ${JSON.stringify(errors[0])}`);
                    }
                }
                logger.info(`  -> Lote ${i/CHUNK_SIZE + 1} enviado. Éxitos en este lote: ${chunk.length}`);
            } catch (e) {
                logger.error(`  -> Error enviando lote ${i/CHUNK_SIZE + 1}: ${e.message}`);
            }
            
            await sleep(1000);
        }

        logger.info('====================================================');
        logger.info(`=== INYECCIÓN COMPLETA. Total actualizados: ${successCount} ===`);
        logger.info('====================================================');
    } catch (error) {
        logger.error("Error crítico en inyección masiva:", error);
    } finally {
        process.exit();
    }
}

syncClientesCompleto();

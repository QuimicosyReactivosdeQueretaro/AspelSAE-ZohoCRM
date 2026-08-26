require('dotenv').config();
const db = require('../src/config/database');
const zohoApi = require('../src/services/zohoApi');
const logger = require('../src/utils/logger');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncCustomersPriceBooks() {
    try {
        logger.info("=== INICIANDO VINCULACIÓN DE CLIENTES CON LISTAS DE PRECIOS ===");

        // 1. Obtener los Price Books de Zoho para tener sus IDs
        logger.info("1. Obteniendo Catálogos de Precios desde Zoho...");
        let zohoPriceBooks = [];
        try {
            const pbRes = await zohoApi._request('GET', '/Price_Books?fields=id,Price_Book_Name');
            zohoPriceBooks = pbRes.data || [];
        } catch (e) {
            if (!e.message.includes('NO_CONTENT')) throw e;
        }

        // 2. Obtener nombres de listas desde SAE para cruzar
        logger.info("2. Consultando nombres de listas en SAE...");
        const precios16 = await db.query("SELECT CVE_PRECIO, DESCRIPCION FROM PRECIOS16");
        
        const listIdToZohoPbId = {};
        for (const lista of precios16) {
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

        // 3. Obtener Clientes de SAE con su lista de precios asignada
        logger.info("3. Obteniendo clientes desde SAE...");
        const clientesSae = await db.query("SELECT CLAVE, NOMBRE, LISTA_PREC FROM CLIE16");
        logger.info(`Se encontraron ${clientesSae.length} clientes en SAE.`);

        // 4. Armar el payload para Zoho
        logger.info("4. Vinculando clientes en Zoho...");
        const zohoContacts = [];
        for (const c of clientesSae) {
            let pbId = null;
            if (c.LISTA_PREC && listIdToZohoPbId[c.LISTA_PREC]) {
                pbId = listIdToZohoPbId[c.LISTA_PREC];
            } else {
                pbId = listaPublicaId; // Si no tiene, se le asigna la pública
            }

            if (pbId) {
                zohoContacts.push({
                    Clave_Sae: c.CLAVE.trim(),
                    Last_Name: c.NOMBRE || 'Sin Nombre', // Last_Name es obligatorio en Zoho
                    Lista_De_Precios_Sae: pbId // El nombre del campo en Zoho (con D mayúscula)
                });
            }
        }

        // 5. Enviar a Zoho en lotes de 100
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
                logger.info(`  -> Lote ${i/CHUNK_SIZE + 1} enviado. Éxitos: ${successCount}`);
            } catch (e) {
                logger.error(`  -> Error en lote ${i/CHUNK_SIZE + 1}: ${e.message}`);
            }
            
            await sleep(500);
        }

        logger.info(`=== VINCULACIÓN COMPLETADA. Total actualizados: ${successCount} ===`);
    } catch (error) {
        logger.error("Error crítico:", error);
    } finally {
        process.exit();
    }
}

syncCustomersPriceBooks();

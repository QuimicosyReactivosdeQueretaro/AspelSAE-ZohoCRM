const saeRead = require('../src/services/saeRead');
const zohoApi = require('../src/services/zohoApi');
const logger = require('../src/utils/logger');
const db = require('../src/config/database');

async function syncContacts() {
    logger.info('Iniciando sincronización de Clientes (Contacts)...');
    try {
        // 1. Obtener los Price Books de Zoho
        let zohoPriceBooks = [];
        try {
            const pbRes = await zohoApi._request('GET', '/Price_Books?fields=id,Price_Book_Name');
            zohoPriceBooks = pbRes.data || [];
        } catch (e) {
            if (!e.message.includes('NO_CONTENT')) throw e;
        }

        // 2. Obtener nombres de listas desde SAE
        const precios16 = await db.query("SELECT CVE_PRECIO, DESCRIPCION FROM PRECIOS16");
        const listIdToZohoPbId = {};
        for (const lista of precios16) {
            const nombre = lista.DESCRIPCION ? lista.DESCRIPCION.trim() : `Lista ${lista.CVE_PRECIO}`;
            const matchedPb = zohoPriceBooks.find(pb => pb.Price_Book_Name.trim() === nombre);
            if (matchedPb) {
                listIdToZohoPbId[lista.CVE_PRECIO] = matchedPb.id;
            }
        }
        const listaPublicaId = listIdToZohoPbId[1];

        const limit = 100; // Zoho API v6 permite máximo 100 registros por lote
        let offset = 0;
        let hasMore = true;
        let totalSynced = 0;

        while (hasMore) {
            const clientesSae = await saeRead.getClientesSync(limit, offset);
            
            if (clientesSae.length === 0) {
                hasMore = false;
                break;
            }

            // Mapeo SAE -> Zoho Contacts
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            
            const zohoContacts = clientesSae.map(c => {
                // Limpiar email
                let email = c.EMAILPRED ? c.EMAILPRED.trim() : "";
                if (email && !emailRegex.test(email)) {
                    email = ""; // Si no es válido, no lo enviamos para que Zoho no lo rechace
                }
                
                // Limpiar teléfono (solo enviar si tiene sentido, Zoho no es tan estricto con el teléfono pero por si acaso)
                let phone = c.TELEFONO ? c.TELEFONO.trim() : "";

                // Mapear Lista de Precios
                let pbId = null;
                if (c.LISTA_PREC && listIdToZohoPbId[c.LISTA_PREC]) {
                    pbId = listIdToZohoPbId[c.LISTA_PREC];
                } else {
                    pbId = listaPublicaId; // Si no tiene, se le asigna la pública
                }

                return {
                    // Last_Name es obligatorio en Zoho Contacts
                    Last_Name: c.NOMBRE || 'Sin Nombre',
                    Clave_Sae: c.CLAVE,
                    RFC_Sae: c.RFC,
                    R_gimen_Fiscal_Sae: c.REG_FISC,
                    Vendedor_Sae: c.CVE_VEND,
                    Mailing_Street: `${c.CALLE || ''} ${c.NUMEXT || ''}`.trim(),
                    Mailing_City: c.MUNICIPIO,
                    Mailing_State: c.ESTADO,
                    Mailing_Zip: c.CODIGO,
                    Phone: phone || null,
                    Email: email || null,
                    Lista_De_Precios_Sae: pbId
                };
            });

            // Enviar a Zoho
            const response = await zohoApi.upsertContacts(zohoContacts);
            
            // Analizar respuesta
            if (response && response.data) {
                const successCount = response.data.filter(r => r.status === 'success').length;
                totalSynced += successCount;
                logger.info(`Lote enviado: ${zohoContacts.length} clientes. Éxitos: ${successCount}. Progreso: ${totalSynced} sincronizados.`);
                
                // Mostrar errores si hubo alguno
                const errors = response.data.filter(r => r.status === 'error');
                if (errors.length > 0) {
                    logger.warn(`Hubo ${errors.length} errores en el lote. Ejemplo: ${errors[0].message}`);
                }
            }

            offset += limit;
            
            // Pausa de 1 segundo para no saturar los límites de la API de Zoho
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        logger.info(`Sincronización de Clientes finalizada. Total exitosos: ${totalSynced}`);
    } catch (error) {
        logger.error(`Error crítico en syncContacts: ${error.message}`);
    }
}

async function syncProducts() {
    logger.info('Iniciando sincronización de Productos (Products)...');
    try {
        const limit = 100;
        let offset = 0;
        let hasMore = true;
        let totalSynced = 0;

        while (hasMore) {
            const productosSae = await saeRead.getProductosSync(limit, offset);
            
            if (productosSae.length === 0) {
                hasMore = false;
                break;
            }

            // Mapeo SAE -> Zoho Products
            const zohoProducts = productosSae.map(p => ({
                // Product_Name es obligatorio
                Product_Name: p.DESCR || 'Sin Descripción',
                Product_Code: p.CVE_ART, // Campo estándar de Zoho
                Codigo_SAE: p.CVE_ART,   // Tu campo personalizado
                Clave_Esquema_Sae: p.CVE_ESQIMPU,
                Unidad_Venta_Sae: p.UNI_MED,
                Unit_Price: p.PRECIO_1 ? parseFloat(p.PRECIO_1).toFixed(2) : 0, 
                Precio_SAE: p.PRECIO_1 ? parseFloat(p.PRECIO_1).toFixed(2) : 0, 
                Qty_in_Stock: p.EXIST || 0, 
                Existencia_SAE: p.EXIST || 0, // Custom field
                Con_lote: (p.CON_LOTE === 'S') ? 'Sí' : 'No' // Mapeo a valores probables del Dropdown
            }));

            // Enviar a Zoho
            const response = await zohoApi.upsertProducts(zohoProducts);
            
            // Analizar respuesta
            if (response && response.data) {
                const successCount = response.data.filter(r => r.status === 'success').length;
                totalSynced += successCount;
                logger.info(`Lote enviado: ${zohoProducts.length} productos. Éxitos: ${successCount}. Progreso: ${totalSynced} sincronizados.`);
                
                const errors = response.data.filter(r => r.status === 'error');
                if (errors.length > 0) {
                    logger.warn(`Hubo ${errors.length} errores en el lote. Ejemplo: ${errors[0].message}`);
                }
            }

            offset += limit;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        logger.info(`Sincronización de Productos finalizada. Total exitosos: ${totalSynced}`);
    } catch (error) {
        logger.error(`Error crítico en syncProducts: ${error.message}`);
    }
}

async function run() {
    logger.info('--- INICIANDO SINCRONIZACIÓN SAE -> ZOHO ---');
    await syncContacts();
    // await syncProducts();
    logger.info('--- SINCRONIZACIÓN FINALIZADA ---');
    
    // Forzar el cierre para terminar el script en consola
    setTimeout(() => process.exit(0), 1000);
}

run();

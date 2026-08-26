require('dotenv').config();
const fs = require('fs');
const path = require('path');
const saeRead = require('../src/services/saeRead');
const zohoApi = require('../src/services/zohoApi');
const logger = require('../src/utils/logger');

/**
 * ============================================================================
 * ARCHIVO: sync-daemon.js (EL CEREBRO DEL SISTEMA)
 * ============================================================================
 * ¿Para qué sirve?
 * Este es el "Bot Vigilante". Su trabajo es quedarse prendido todo el tiempo
 * y revisar el inventario de Aspel SAE cada 60 segundos. Si detecta que un 
 * producto cambió de precio o de existencias, lo empaqueta y lo envía a Zoho CRM.
 * ============================================================================
 */

// Archivo donde guardamos la "memoria" del bot para saber qué cambió
const CACHE_FILE = path.join(__dirname, '..', 'data', 'sync-cache.json');
const SYNC_INTERVAL_MS = 60 * 1000; // El bot despierta cada 60 segundos (1 minuto)

// Asegurar que la carpeta de datos exista para que no marque error al iniciar
const dataDir = path.dirname(CACHE_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Función que lee la memoria (caché) del bot de la vez anterior que revisó el inventario.
 */
function loadCache() {
    if (fs.existsSync(CACHE_FILE)) {
        try {
            const rawData = fs.readFileSync(CACHE_FILE, 'utf8');
            return JSON.parse(rawData);
        } catch (e) {
            logger.warn('Error leyendo caché, se creará uno nuevo.');
            return {};
        }
    }
    return {};
}

/**
 * Función que guarda la memoria nueva después de una revisión exitosa.
 */
function saveCache(cacheData) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
}

/**
 * EL CORAZÓN DEL BOT: Esta función es el ciclo que se repite infinitamente.
 */
async function runSyncCycle() {
    try {
        logger.info('[DAEMON] Iniciando ciclo de revisión de inventario...');
        
        // 1. Ir a SAE y pedir todos los productos (Usa el brazo izquierdo: saeRead)
        const productosSae = await saeRead.getProductosDeltaSync();
        
        // 2. Cargar la memoria de lo que había hace 1 minuto
        let cache = loadCache();
        // Migración de caché antiguo (si no tiene .products)
        if (!cache.products && !cache.clients) {
            cache = { products: cache, clients: {} };
        }
        const changedProducts = [];
        const newCache = { products: {}, clients: {} };

        // 3. Revisar producto por producto para ver si algo cambió
        for (const p of productosSae) {
            const clave = p.CVE_ART;
            // Formatear las fechas para que sean seguras (YYYY-MM-DD)
            const fch1 = p.FCHCADUC_1 ? new Date(p.FCHCADUC_1).toISOString().split('T')[0] : '';
            const fch2 = p.FCHCADUC_2 ? new Date(p.FCHCADUC_2).toISOString().split('T')[0] : '';
            const fch3 = p.FCHCADUC_3 ? new Date(p.FCHCADUC_3).toISOString().split('T')[0] : '';
            
            // Creamos una "firma" única combinando existencias, precio, caducidades y ubicaciones
            const currentHash = `${p.EXIST}_${p.PRECIO_1}_${fch1}_${fch2}_${fch3}_${p.UBICACION_LOTE_1}_${p.UBICACION_LOTE_2}_${p.UBICACION_LOTE_3}`;
            newCache.products[clave] = currentHash;

            // Si la firma actual no es igual a la que teníamos en memoria, significa que algo cambió
            if (cache.products[clave] !== currentHash) {
                changedProducts.push(p);
            }
        }

        // 4. Si encontramos cambios, hay que mandarlos a Zoho CRM
        if (changedProducts.length > 0) {
            logger.info(`[DAEMON] Se detectaron cambios en ${changedProducts.length} productos. Sincronizando con Zoho...`);
            
            // Zoho solo permite recibir 100 productos a la vez, así que los partimos en pedacitos (lotes)
            const limit = 100;
            let offset = 0;
            
            while (offset < changedProducts.length) {
                const batch = changedProducts.slice(offset, offset + limit);
                
                // Formateamos los datos para que Zoho los entienda
                const zohoProducts = batch.map(p => ({
                    Product_Name: p.DESCR || 'Sin Descripción',
                    Product_Code: p.CVE_ART, 
                    Codigo_SAE: p.CVE_ART,   
                    Clave_Esquema_Sae: p.CVE_ESQIMPU,
                    Unidad_Venta_Sae: p.UNI_MED,
                    Unit_Price: p.PRECIO_1 ? parseFloat(p.PRECIO_1).toFixed(2) : 0, 
                    Precio_SAE: p.PRECIO_1 ? parseFloat(p.PRECIO_1).toFixed(2) : 0, 
                    Qty_in_Stock: p.EXIST || 0, 
                    Existencia_SAE: p.EXIST || 0, 
                    Con_lote: (p.CON_LOTE === 'S') ? 'Sí' : 'No',
                    L_nea_de_Producto: p.DESC_LIN || 'SIN LINEA',
                    Fecha_de_caducidad: (p.CON_LOTE === 'S' && p.FCHCADUC_1) ? new Date(p.FCHCADUC_1).toISOString().split('T')[0] : null,
                    Fecha_de_caducidad_2: (p.CON_LOTE === 'S' && p.FCHCADUC_2) ? new Date(p.FCHCADUC_2).toISOString().split('T')[0] : null,
                    Fecha_de_caducidad_3: (p.CON_LOTE === 'S' && p.FCHCADUC_3) ? new Date(p.FCHCADUC_3).toISOString().split('T')[0] : null,
                    Quer_taro: p.ALM_QRO || 0,
                    Xalapa: p.ALM_XAL || 0,
                    San_Luis_Potosi: p.ALM_SLP || 0,
                    Huasteca: p.ALM_HUA || 0,
                    Ciudad_de_M_xico: p.ALM_CDMX || 0,
                    Lote_1: p.CANTIDAD_LOTE_1 || 0,
                    Lote_2: p.CANTIDAD_LOTE_2 || 0,
                    Lote_3: p.CANTIDAD_LOTE_3 || 0,
                    Ubicaci_n_1: p.UBICACION_LOTE_1 || '',
                    Ubicaci_n_2: p.UBICACION_LOTE_2 || '',
                    Ubicaci_n_3: p.UBICACION_LOTE_3 || ''
                }));

                // 5. Enviamos el lote a Zoho (Usa el brazo derecho: zohoApi)
                const response = await zohoApi.upsertProducts(zohoProducts);
                if (response && response.data) {
                    const successCount = response.data.filter(r => r.status === 'success').length;
                    logger.info(`[DAEMON] Lote enviado. Éxitos: ${successCount}`);
                }
                
                offset += limit;
                // Pequeña pausa de 1 segundo entre envíos para no saturar a Zoho
                if (offset < changedProducts.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } else {
            logger.info('[DAEMON] No hay cambios en el inventario. Descansando...');
        }

        // ==========================================
        // SINCRONIZACIÓN DE CLIENTES
        // ==========================================
        logger.info('[DAEMON] Revisando catálogo de clientes...');
        const clientesSae = await saeRead.getClientesSync(10000, 0);
        const changedClients = [];
        
        for (const c of clientesSae) {
            const clave = c.CLAVE.trim();
            // Creamos firma con campos clave del cliente
            const currentHash = `${c.NOMBRE}_${c.RFC}_${c.TELEFONO}_${c.EMAILPRED}_${c.CALLE}_${c.NUMEXT}_${c.NUMINT}_${c.MUNICIPIO}_${c.ESTADO}_${c.CODIGO}_${c.REG_FISC}_${c.CVE_VEND}`;
            newCache.clients[clave] = currentHash;
            
            if (cache.clients[clave] !== currentHash) {
                changedClients.push(c);
            }
        }
        
        if (changedClients.length > 0) {
            logger.info(`[DAEMON] Se detectaron cambios en ${changedClients.length} clientes. Sincronizando con Zoho...`);
            const limit = 100;
            let offset = 0;
            
            while (offset < changedClients.length) {
                const batch = changedClients.slice(offset, offset + limit);
                
                const zohoContacts = batch.map(c => {
                    let cleanedPhone = c.TELEFONO ? c.TELEFONO.replace(/[^0-9+\-]/g, '').substring(0, 30).trim() : '';
                    if (!/\d/.test(cleanedPhone)) cleanedPhone = '';
                    return {
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
                });
                
                const response = await zohoApi._request('POST', '/Contacts/upsert', {
                    data: zohoContacts,
                    duplicate_check_fields: ["Clave_Sae"]
                });
                
                if (response && response.data) {
                    const successCount = response.data.filter(r => r.status === 'success').length;
                    logger.info(`[DAEMON] Lote de clientes enviado. Éxitos: ${successCount}`);
                }
                
                offset += limit;
                if (offset < changedClients.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } else {
            logger.info('[DAEMON] No hay cambios en clientes.');
        }

        // 6. Si todo salió bien, guardamos la nueva memoria
        saveCache(newCache);
        logger.info('[DAEMON] Ciclo finalizado y caché actualizado exitosamente.');

    } catch (error) {
        logger.error(`[DAEMON] Error en el ciclo de sincronización: ${error.message}`);
    }
}

// ==========================================
// ARRANQUE DEL BOT
// ==========================================
logger.info('=== INICIANDO SYNC DAEMON DE ALTA FRECUENCIA ===');
logger.info(`Ciclo configurado para ejecutarse cada ${SYNC_INTERVAL_MS / 1000} segundos.`);

// Ejecutar la primera revisión inmediatamente al encenderlo
runSyncCycle();

// Dejar el bot programado para que trabaje solo cada 60 segundos por siempre
setInterval(runSyncCycle, SYNC_INTERVAL_MS);

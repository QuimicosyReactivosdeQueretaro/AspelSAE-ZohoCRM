const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * ============================================================================
 * ARCHIVO: src/services/saeRead.js (EL BRAZO IZQUIERDO / EXTRACTOR)
 * ============================================================================
 * ¿Para qué sirve?
 * Este archivo es el único autorizado para extraer información de Aspel SAE.
 * Contiene todas las consultas en lenguaje de base de datos (SQL) puro para 
 * leer catálogos de clientes, inventarios y precios.
 * ============================================================================
 */

class SaeReadService {
    
    /**
     * Obtiene un cliente de SAE por su clave
     * @param {string} clave Clave del cliente
     * @returns {Promise<Object|null>}
     */
    static async getCliente(clave) {
        try {
            // SAE guarda las claves de cliente en un campo de 10 caracteres alineado a la derecha
            const paddedClave = clave.padStart(10, ' ');
            const query = `
                SELECT 
                    TRIM(CLAVE) as CLAVE, 
                    TRIM(NOMBRE) as NOMBRE, 
                    TRIM(RFC) as RFC, 
                    TRIM(REG_FISC) as REG_FISC,
                    TRIM(CVE_VEND) as CVE_VEND,
                    TRIM(CALLE) as CALLE,
                    TRIM(NUMEXT) as NUMEXT,
                    TRIM(NUMINT) as NUMINT,
                    TRIM(COLONIA) as COLONIA,
                    TRIM(CODIGO) as CODIGO,
                    TRIM(MUNICIPIO) as MUNICIPIO,
                    TRIM(ESTADO) as ESTADO,
                    TRIM(PAIS) as PAIS
                FROM CLIE15 
                WHERE CLAVE = ?`;
            const rows = await db.query(query, [paddedClave]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error(`Error obteniendo cliente ${clave}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene todos los clientes (para sincronización inicial)
     * @param {number} limit Límite de registros
     * @param {number} offset Desplazamiento
     * @returns {Promise<Array>}
     */
    static async getClientesSync(limit = 100, offset = 0) {
        try {
            const query = `
                SELECT FIRST ? SKIP ?
                    TRIM(CLAVE) as CLAVE, 
                    TRIM(NOMBRE) as NOMBRE, 
                    TRIM(RFC) as RFC, 
                    TRIM(REG_FISC) as REG_FISC,
                    TRIM(CVE_VEND) as CVE_VEND,
                    TRIM(CALLE) as CALLE,
                    TRIM(NUMINT) as NUMINT,
                    LISTA_PREC,
                    TRIM(NUMEXT) as NUMEXT,
                    TRIM(COLONIA) as COLONIA,
                    TRIM(CODIGO) as CODIGO,
                    TRIM(MUNICIPIO) as MUNICIPIO,
                    TRIM(ESTADO) as ESTADO,
                    TRIM(TELEFONO) as TELEFONO,
                    TRIM(EMAILPRED) as EMAILPRED
                FROM CLIE15
                WHERE STATUS = 'A'`; // A=Activo
            return await db.query(query, [limit, offset]);
        } catch (error) {
            logger.error(`Error obteniendo clientes para sync: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene un producto por su clave
     * @param {string} cveArt Clave del artículo
     * @returns {Promise<Object|null>}
     */
    static async getProducto(cveArt) {
        try {
            const query = `
                SELECT 
                    TRIM(i.CVE_ART) as CVE_ART,
                    TRIM(i.DESCR) as DESCR,
                    i.ULT_COSTO, 
                    TRIM(i.UNI_MED) as UNI_MED, 
                    TRIM(i.CVE_PRODSERV) as CVE_PRODSERV, 
                    TRIM(i.CVE_UNIDAD) as CVE_UNIDAD,
                    TRIM(i.TIPO_ELE) as TIPO_ELE,
                    i.CVE_ESQIMPU,
                    COALESCE((SELECT PRECIO FROM PRECIO_X_PROD15 WHERE CVE_ART = i.CVE_ART AND CVE_PRECIO = 1), 0) AS PRECIO_1,
                    (SELECT IMPUESTO4 FROM IMPU15 WHERE CVE_ESQIMPU = i.CVE_ESQIMPU) AS TASA_IVA
                FROM INVE15 i 
                WHERE i.CVE_ART = ? OR TRIM(i.CVE_ART) = ?`;
            const rows = await db.query(query, [cveArt, cveArt.trim()]);
            
            // Si lo encontró con búsqueda exacta, retornar
            if (rows.length > 0) return rows[0];

            // Búsqueda flexible: limpiar caracteres invisibles y normalizar espacios
            const cveArtLimpia = cveArt.trim().replace(/\s+/g, ' ');
            const queryFlexible = `
                SELECT 
                    TRIM(i.CVE_ART) as CVE_ART,
                    TRIM(i.DESCR) as DESCR,
                    i.ULT_COSTO, 
                    TRIM(i.UNI_MED) as UNI_MED, 
                    TRIM(i.CVE_PRODSERV) as CVE_PRODSERV, 
                    TRIM(i.CVE_UNIDAD) as CVE_UNIDAD,
                    TRIM(i.TIPO_ELE) as TIPO_ELE,
                    i.CVE_ESQIMPU,
                    COALESCE((SELECT PRECIO FROM PRECIO_X_PROD15 WHERE CVE_ART = i.CVE_ART AND CVE_PRECIO = 1), 0) AS PRECIO_1,
                    (SELECT IMPUESTO4 FROM IMPU15 WHERE CVE_ESQIMPU = i.CVE_ESQIMPU) AS TASA_IVA
                FROM INVE15 i 
                WHERE REPLACE(REPLACE(REPLACE(TRIM(i.CVE_ART), ASCII_CHAR(9), ''), ASCII_CHAR(10), ''), ASCII_CHAR(13), '') = ?`;
            const rowsFlex = await db.query(queryFlexible, [cveArtLimpia]);

            if (rowsFlex.length > 0) {
                logger.info(`[saeRead] Producto '${cveArt}' encontrado con búsqueda flexible como '${rowsFlex[0].CVE_ART}'`);
                return rowsFlex[0];
            }

            return null;
        } catch (error) {
            logger.error(`Error obteniendo producto ${cveArt}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene todos los productos activos (para sincronización inicial)
     * @param {number} limit Límite de registros
     * @param {number} offset Desplazamiento
     * @returns {Promise<Array>}
     */
    static async getProductosSync(limit = 100, offset = 0) {
        try {
            const queryProductos = `
                SELECT FIRST ? SKIP ?
                    TRIM(i.CVE_ART) as CVE_ART,
                    TRIM(i.DESCR) as DESCR,
                    TRIM(i.UNI_MED) as UNI_MED, 
                    TRIM(i.CVE_PRODSERV) as CVE_PRODSERV, 
                    TRIM(i.CVE_UNIDAD) as CVE_UNIDAD,
                    i.CVE_ESQIMPU,
                    i.EXIST,
                    TRIM(i.CON_LOTE) as CON_LOTE,
                    TRIM(c.DESC_LIN) as DESC_LIN,
                    COALESCE((SELECT PRECIO FROM PRECIO_X_PROD15 WHERE CVE_ART = i.CVE_ART AND CVE_PRECIO = 1), 0) AS PRECIO_1
                FROM INVE15 i
                LEFT JOIN CLIN15 c ON i.LIN_PROD = c.CVE_LIN
                WHERE i.STATUS = 'A'`;
            const productos = await db.query(queryProductos, [limit, offset]);
            
            if (productos.length === 0) return productos;

            const queryLotes = `
                SELECT TRIM(CVE_ART) as CVE_ART, FCHCADUC, CANTIDAD, CVE_ALM 
                FROM LTPD15 
                WHERE CANTIDAD > 0 AND STATUS = 'A' AND FCHCADUC >= CURRENT_DATE
                ORDER BY CVE_ART ASC, FCHCADUC ASC`;
            const lotes = await db.query(queryLotes);

            const ALMACEN_MAP = {
                1: 'Querétaro',
                2: 'Xalapa',
                3: 'San Luis Potosí',
                4: 'Huasteca',
                14: 'Ciudad de México'
            };

            const lotesPorProducto = {};
            for (const lote of lotes) {
                if (!lotesPorProducto[lote.CVE_ART]) {
                    lotesPorProducto[lote.CVE_ART] = [];
                }
                lotesPorProducto[lote.CVE_ART].push({
                    fecha: lote.FCHCADUC,
                    cantidad: lote.CANTIDAD,
                    ubicacion: ALMACEN_MAP[lote.CVE_ALM] || `Almacén ${lote.CVE_ALM}`
                });
            }

            // EXTRAER ALMACENES (1, 2, 3, 4, 14)
            const queryAlmacenes = `
                SELECT TRIM(CVE_ART) as CVE_ART, CVE_ALM, EXIST 
                FROM MULT15 
                WHERE CVE_ALM IN (1, 2, 3, 4, 14)`;
            const almacenes = await db.query(queryAlmacenes);
            
            const stockPorAlmacen = {};
            for (const row of almacenes) {
                if (!stockPorAlmacen[row.CVE_ART]) {
                    stockPorAlmacen[row.CVE_ART] = {};
                }
                stockPorAlmacen[row.CVE_ART][row.CVE_ALM] = row.EXIST;
            }

            return productos.map(p => {
                const cads = lotesPorProducto[p.CVE_ART] || [];
                const stock = stockPorAlmacen[p.CVE_ART] || {};
                const existComercial = (stock[1] || 0) + (stock[2] || 0) + (stock[3] || 0) + (stock[4] || 0) + (stock[14] || 0);
                return {
                    ...p,
                    EXIST: existComercial,
                    FCHCADUC_1: cads[0] ? cads[0].fecha : null,
                    FCHCADUC_2: cads[1] ? cads[1].fecha : null,
                    FCHCADUC_3: cads[2] ? cads[2].fecha : null,
                    CANTIDAD_LOTE_1: cads[0] ? cads[0].cantidad : 0,
                    CANTIDAD_LOTE_2: cads[1] ? cads[1].cantidad : 0,
                    CANTIDAD_LOTE_3: cads[2] ? cads[2].cantidad : 0,
                    UBICACION_LOTE_1: cads[0] ? cads[0].ubicacion : '',
                    UBICACION_LOTE_2: cads[1] ? cads[1].ubicacion : '',
                    UBICACION_LOTE_3: cads[2] ? cads[2].ubicacion : '',
                    ALM_QRO: stock[1] || 0,
                    ALM_XAL: stock[2] || 0,
                    ALM_SLP: stock[3] || 0,
                    ALM_HUA: stock[4] || 0,
                    ALM_CDMX: stock[14] || 0
                };
            });
        } catch (error) {
            logger.error(`Error obteniendo productos para sync: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene solo existencias y precios para sincronización rápida (Daemon)
     * Extrae todos los registros activos en una sola consulta ligera
     * @returns {Promise<Array>}
     */
    static async getProductosDeltaSync() {
        try {
            const queryProductos = `
                SELECT 
                    TRIM(i.CVE_ART) as CVE_ART,
                    TRIM(i.DESCR) as DESCR,
                    TRIM(i.UNI_MED) as UNI_MED,
                    i.CVE_ESQIMPU,
                    i.EXIST,
                    TRIM(i.CON_LOTE) as CON_LOTE,
                    TRIM(c.DESC_LIN) as DESC_LIN,
                    COALESCE((SELECT PRECIO FROM PRECIO_X_PROD15 WHERE CVE_ART = i.CVE_ART AND CVE_PRECIO = 1), 0) AS PRECIO_1
                FROM INVE15 i
                LEFT JOIN CLIN15 c ON i.LIN_PROD = c.CVE_LIN
                WHERE i.STATUS = 'A'`;
            const productos = await db.query(queryProductos);
            
            if (productos.length === 0) return productos;

            const queryLotes = `
                SELECT TRIM(CVE_ART) as CVE_ART, FCHCADUC, CANTIDAD, CVE_ALM 
                FROM LTPD15 
                WHERE CANTIDAD > 0 AND STATUS = 'A' AND FCHCADUC >= CURRENT_DATE
                ORDER BY CVE_ART ASC, FCHCADUC ASC`;
            const lotes = await db.query(queryLotes);

            const ALMACEN_MAP = {
                1: 'Querétaro',
                2: 'Xalapa',
                3: 'San Luis Potosí',
                4: 'Huasteca',
                14: 'Ciudad de México'
            };

            const lotesPorProducto = {};
            for (const lote of lotes) {
                if (!lotesPorProducto[lote.CVE_ART]) {
                    lotesPorProducto[lote.CVE_ART] = [];
                }
                lotesPorProducto[lote.CVE_ART].push({
                    fecha: lote.FCHCADUC,
                    cantidad: lote.CANTIDAD,
                    ubicacion: ALMACEN_MAP[lote.CVE_ALM] || `Almacén ${lote.CVE_ALM}`
                });
            }

            // EXTRAER ALMACENES (1, 2, 3, 4, 14)
            const queryAlmacenes = `
                SELECT TRIM(CVE_ART) as CVE_ART, CVE_ALM, EXIST 
                FROM MULT15 
                WHERE CVE_ALM IN (1, 2, 3, 4, 14)`;
            const almacenes = await db.query(queryAlmacenes);
            
            const stockPorAlmacen = {};
            for (const row of almacenes) {
                if (!stockPorAlmacen[row.CVE_ART]) {
                    stockPorAlmacen[row.CVE_ART] = {};
                }
                stockPorAlmacen[row.CVE_ART][row.CVE_ALM] = row.EXIST;
            }

            return productos.map(p => {
                const cads = lotesPorProducto[p.CVE_ART] || [];
                const stock = stockPorAlmacen[p.CVE_ART] || {};
                const existComercial = (stock[1] || 0) + (stock[2] || 0) + (stock[3] || 0) + (stock[4] || 0) + (stock[14] || 0);
                return {
                    ...p,
                    EXIST: existComercial,
                    FCHCADUC_1: cads[0] ? cads[0].fecha : null,
                    FCHCADUC_2: cads[1] ? cads[1].fecha : null,
                    FCHCADUC_3: cads[2] ? cads[2].fecha : null,
                    CANTIDAD_LOTE_1: cads[0] ? cads[0].cantidad : 0,
                    CANTIDAD_LOTE_2: cads[1] ? cads[1].cantidad : 0,
                    CANTIDAD_LOTE_3: cads[2] ? cads[2].cantidad : 0,
                    UBICACION_LOTE_1: cads[0] ? cads[0].ubicacion : '',
                    UBICACION_LOTE_2: cads[1] ? cads[1].ubicacion : '',
                    UBICACION_LOTE_3: cads[2] ? cads[2].ubicacion : '',
                    ALM_QRO: stock[1] || 0,
                    ALM_XAL: stock[2] || 0,
                    ALM_SLP: stock[3] || 0,
                    ALM_HUA: stock[4] || 0,
                    ALM_CDMX: stock[14] || 0
                };
            });
        } catch (error) {
            logger.error(`Error obteniendo productos para delta sync: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene los vendedores activos
     * @returns {Promise<Array>}
     */
    static async getVendedores() {
        try {
            const query = `
                SELECT TRIM(CVE_VEND) as CVE_VEND, TRIM(NOMBRE) as NOMBRE 
                FROM VEND15
                WHERE STATUS = 'A'`;
            return await db.query(query, []);
        } catch (error) {
            logger.error(`Error obteniendo vendedores: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene los componentes de un KIT
     * @param {string} cveArt Clave del artículo KIT
     * @returns {Promise<Array>}
     */
    static async getKitComponents(cveArt) {
        try {
            const query = `
                SELECT 
                    TRIM(CVE_ART) as CVE_ART,
                    TRIM(CVE_PROD) as CVE_PROD,
                    PORCEN,
                    CANTIDAD
                FROM KITS15
                WHERE TRIM(CVE_ART) = ?`;
            return await db.query(query, [cveArt.trim()]);
        } catch (error) {
            logger.error(`Error obteniendo componentes de kit ${cveArt}: ${error.message}`);
            throw error;
        }
    }
}

module.exports = SaeReadService;

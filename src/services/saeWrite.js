const db = require('../config/database');
const logger = require('../utils/logger');
const Firebird = require('node-firebird');
const { v4: uuidv4 } = require('uuid');

/**
 * ============================================================================
 * ARCHIVO: src/services/saeWrite.js (EL INYECTOR DE COTIZACIONES)
 * ============================================================================
 * ¿Para qué sirve?
 * ¡Esta es la obra maestra de la Vía de Bajada! 
 * Es el único archivo con permisos y conocimiento para escribir/insertar datos 
 * nuevos directamente en las tablas maestras de Aspel SAE. Es el encargado de
 * generar folios, calcular impuestos de SAE e insertar las cotizaciones.
 * ============================================================================
 */
const saeRead = require('./saeRead');

class SaeWriteService {
    
    static async getNextFolio(serie = 'C-QR-') {
        const query = `SELECT ULT_DOC FROM FOLIOSF15 WHERE TIP_DOC = 'C' AND SERIE = ?`;
        const rows = await db.query(query, [serie]);
        
        if (rows.length === 0) {
            throw new Error(`No se encontró la serie de folios '${serie}' para cotizaciones (TIP_DOC='C').`);
        }

        const currentFolioNum = parseInt(rows[0].ULT_DOC, 10);
        const nextFolioNum = currentFolioNum + 1;
        const nextFolioStr = nextFolioNum.toString();
        const paddedNum = nextFolioStr.padStart(6, '0');
        const fullFolio = `${serie}${paddedNum}`;

        return { nextFolioNum, fullFolio };
    }

    static async insertCotizacion(cotizacion) {
        const { serie = 'C-QR-', clienteClave, vendedorClave, partidas, subtotal, iva, total } = cotizacion;
        
        const { nextFolioNum, fullFolio } = await this.getNextFolio(serie);
        const paddedClave = clienteClave.padStart(10, ' ');
        
        const sucursalToAlmacen = {
            'Querétaro': 1,
            'Xalapa': 2,
            'San Luis Potosí': 3,
            'SLP': 3,
            'Huasteca': 4
        };
        const numAlma = sucursalToAlmacen[cotizacion.sucursal] || 1;

        // Obtener datos del cliente para RFC y REG_FISC
        const client = await saeRead.getCliente(clienteClave);
        if (!client) {
            throw new Error(`El cliente con clave ${clienteClave} no existe en SAE.`);
        }

        // Obtener datos de productos y validar
        const partidasEnriquecidas = [];
        for (let i = 0; i < partidas.length; i++) {
            const p = partidas[i];
            const prod = await saeRead.getProducto(p.cveArt);
            if (!prod) {
                throw new Error(`El producto ${p.cveArt} no existe en SAE.`);
            }
            partidasEnriquecidas.push({
                ...p,
                uniMed: prod.UNI_MED,
                cveProdServ: prod.CVE_PRODSERV,
                cveUnidad: prod.CVE_UNIDAD,
                costo: prod.ULT_COSTO || 0,
                tipoEle: prod.TIPO_ELE || 'P',
                tipoElemInterno: 'N',
                cveEsqImpu: prod.CVE_ESQIMPU || 1,
                tasaIva: prod.TASA_IVA !== null && prod.TASA_IVA !== undefined ? parseFloat(prod.TASA_IVA) : p.tasaIva
            });
            
            // Explosión de Kits
            if (prod.TIPO_ELE === 'K') {
                const componentes = await saeRead.getKitComponents(p.cveArt);
                for (const comp of componentes) {
                    const compProd = await saeRead.getProducto(comp.CVE_PROD);
                    if (!compProd) continue;

                    partidasEnriquecidas.push({
                        cveArt: comp.CVE_PROD,
                        cantidad: p.cantidad * comp.CANTIDAD,
                        precio: p.precio * comp.PORCEN,
                        tasaIva: p.tasaIva,
                        descuento: (parseFloat(p.descuento) || 0) * comp.PORCEN,
                        comentario: '',
                        uniMed: compProd.UNI_MED,
                        cveProdServ: compProd.CVE_PRODSERV,
                        cveUnidad: compProd.CVE_UNIDAD,
                        costo: compProd.ULT_COSTO || 0,
                        tipoEle: compProd.TIPO_ELE || 'P',
                        tipoElemInterno: 'K',
                        cveEsqImpu: compProd.CVE_ESQIMPU || 1,
                        tasaIva: compProd.TASA_IVA !== null && compProd.TASA_IVA !== undefined ? parseFloat(compProd.TASA_IVA) : p.tasaIva
                    });
                }
            }
        }

        // ============================================================
        // CALCULAR IVA Y TOTAL DESDE LAS PARTIDAS (fuente de verdad: SAE)
        // Los campos Suma_IVA y Total_Coti de Zoho son fórmulas/agregados
        // que devuelven null cuando se leen por API. Por eso calculamos
        // aquí directamente desde los datos que ya tenemos de SAE.
        // ============================================================
        let ivaCalculado = 0;
        let subtotalCalculado = 0;
        for (const pe of partidasEnriquecidas) {
            if (pe.tipoElemInterno === 'K') continue; // los componentes del kit no suman al encabezado
            const precioNeto = parseFloat(pe.precio || 0) * parseFloat(pe.cantidad || 1);
            const descPartida = parseFloat(pe.descuento || 0);
            const precioConDesc = precioNeto - descPartida;
            const ivaPartida = precioConDesc * (parseFloat(pe.tasaIva || 0) / 100);
            subtotalCalculado += precioNeto;
            ivaCalculado += ivaPartida;
        }
        // Si Zoho mandó subtotal válido, respetarlo; si no, usar el calculado
        const subtotalFinal = parseFloat(cotizacion.subtotal) > 0 ? parseFloat(cotizacion.subtotal) : subtotalCalculado;
        const ivaFinal = ivaCalculado;
        const totalFinal = subtotalFinal + ivaFinal - parseFloat(cotizacion.descuentoTotal || 0);

        logger.info(`[saeWrite] Totales recalculados desde partidas → Subtotal: ${subtotalFinal}, IVA: ${ivaFinal}, Total: ${totalFinal}`);

        const headerUuid = uuidv4().toUpperCase();
        
        return new Promise((resolve, reject) => {
            db.getConnection().then((connection) => {
                connection.transaction(Firebird.ISOLATION_READ_COMMITTED, async (err, transaction) => {
                    if (err) {
                        connection.detach();
                        return reject(err);
                    }

                    try {
                        // 1. Generar ID de Envío (INFENVIO15)
                        const envioRows = await new Promise((res, rej) => transaction.query(
                            `SELECT ULT_CVE FROM TBLCONTROL15 WHERE ID_TABLA = 70`, [], (err, result) => err ? rej(err) : res(result)
                        ));
                        const nextCveInfo = parseInt(envioRows[0].ULT_CVE, 10) + 1;
                        await new Promise((res, rej) => transaction.query(
                            `UPDATE TBLCONTROL15 SET ULT_CVE = ? WHERE ID_TABLA = 70`, [nextCveInfo], (err) => err ? rej(err) : res()
                        ));

                        // Insertar en INFENVIO15
                        await new Promise((res, rej) => transaction.query(
                            `INSERT INTO INFENVIO15 (
                                CVE_INFO, CALLE, NUMEXT, NUMINT, COLONIA, CODIGO, MUNICIPIO, ESTADO, PAIS, FECHA_ENV,
                                REFERDIR, STRNOGUIA, STRMODOENV, NOMBRE_RECEP, NO_RECEP, PAQUETERIA, CVE_PED_TIEND,
                                R_FACTURA, R_EVIDENCIA, ID_GUIA, GUIA_ENV, REG_FISC, POB
                            ) VALUES (
                                ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP,
                                '', '', '', '', '', '', '', '', '', '', '', '', ''
                            )`,
                            [
                                nextCveInfo, client.CALLE || '', client.NUMEXT || '', client.NUMINT || '', 
                                client.COLONIA || '', client.CODIGO || '', client.MUNICIPIO || '', 
                                client.ESTADO || '', client.PAIS || 'México'
                            ],
                            (err) => err ? rej(err) : res()
                        ));

                        // 2. Actualizar Folio de Cotización
                        await new Promise((res, rej) => {
                            transaction.query(
                                `UPDATE FOLIOSF15 SET ULT_DOC = ?, FECH_ULT_DOC = CAST(CURRENT_DATE AS TIMESTAMP) WHERE TIP_DOC = 'C' AND SERIE = ?`,
                                [nextFolioNum, serie],
                                (err) => err ? rej(err) : res()
                            );
                        });

                        // 2. Insertar Encabezado (Usando el SQL exacto del POC)
                        const sqlFact = `
                            INSERT INTO FACTC15 (
                                TIP_DOC, CVE_DOC, CVE_CLPV, STATUS, FECHA_DOC, FECHA_ENT, FECHA_VEN,
                                IMP_TOT1, IMP_TOT2, IMP_TOT3, IMP_TOT4, IMP_TOT5, IMP_TOT6, IMP_TOT7, IMP_TOT8,
                                DES_FIN, COM_TOT, NUM_MONED, TIPCAMB, PRIMERPAGO, RFC, AUTORIZA, FOLIO, SERIE,
                                NUM_ALMA, ACT_CXC, ACT_COI, CAN_TOT, CVE_VEND, DES_TOT, CONDICION, NUM_PAGOS,
                                DAT_ENVIO, CONTADO, DAT_MOSTR, CVE_BITA, BLOQ, FECHAELAB, CTLPOL,
                                ENLAZADO, TIP_DOC_E, FORMAENVIO, DES_FIN_PORC, DES_TOT_PORC, IMPORTE, COM_TOT_PORC,
                                UUID, VERSION_SINC, FORMADEPAGOSAT, USO_CFDI, TIP_FAC, REG_FISC,
                                CVE_OBS, CVE_PEDI, AUTOANIO, ESCFD, METODODEPAGO, NUMCTAPAGO, TIP_DOC_ANT, DOC_ANT
                            ) VALUES (
                                'C', ?, ?, 'O', CAST(CURRENT_DATE AS TIMESTAMP), CAST(CURRENT_DATE AS TIMESTAMP), ${cotizacion.fechaVigencia ? `CAST('${cotizacion.fechaVigencia}' AS TIMESTAMP)` : `CAST(CURRENT_DATE + 15 AS TIMESTAMP)`},
                                0, 0, 0, ?, 0, 0, 0, 0,
                                0, ?, 1, 1.0, 0, ?, 0, ?, ?,
                                ?, 'S', 'N', ?, ?, ?, ?, 1,
                                ?, 'N', 0, 0, 'N', CURRENT_TIMESTAMP, 0,
                                'O', 'O', 'I', 0, 0, ?, ?,
                                ?, CURRENT_TIMESTAMP, '99', 'G03', 'C', ?,
                                ?, '', '', 'N', 'PPD', '', '', ''
                            )
                        `;
                        const cveVend = (cotizacion.vendedorClave || client.CVE_VEND || '1').toString().trim();
                        const paddedVendedor = cveVend.padStart(5, ' ');
                        
                        // Consultar la comisión configurada para este vendedor en SAE
                        const vendRows = await new Promise((res, rej) => transaction.query(
                            `SELECT COMI FROM VEND15 WHERE TRIM(CVE_VEND) = ?`, [cveVend], (err, result) => err ? rej(err) : res(result)
                        ));
                        const comisionPorc = vendRows && vendRows.length > 0 ? parseFloat(vendRows[0].COMI || 0) : 0;
                        const comisionMonto = (cotizacion.subtotal - (cotizacion.descuentoTotal || 0)) * (comisionPorc / 100);

                        // 2.5 Observaciones Generales de la Cotización
                        let cveObsGen = 0;
                        if (cotizacion.descripcion && cotizacion.descripcion.trim().length > 0) {
                            const obsRowsGen = await new Promise((res, rej) => transaction.query(
                                `SELECT ULT_CVE FROM TBLCONTROL15 WHERE ID_TABLA = 56`, [], (err, result) => err ? rej(err) : res(result)
                            ));
                            cveObsGen = parseInt(obsRowsGen[0].ULT_CVE, 10) + 1;
                            await new Promise((res, rej) => transaction.query(
                                `UPDATE TBLCONTROL15 SET ULT_CVE = ? WHERE ID_TABLA = 56`, [cveObsGen], (err) => err ? rej(err) : res()
                            ));
                            await new Promise((res, rej) => transaction.query(
                                `INSERT INTO OBS_DOCF15 (CVE_OBS, STR_OBS) VALUES (?, ?)`,
                                [cveObsGen, cotizacion.descripcion.trim().substring(0, 255)],
                                (err) => err ? rej(err) : res()
                            ));
                        }

                        const paramsFact = [
                            fullFolio, paddedClave, 
                            ivaFinal,
                            comisionMonto, client.RFC, nextFolioNum, serie,
                            numAlma, subtotalFinal, paddedVendedor, cotizacion.descuentoTotal || 0, (cotizacion.condicion || '').substring(0, 25),
                            nextCveInfo,
                            totalFinal, comisionPorc,
                            headerUuid, client.REG_FISC,
                            cveObsGen
                        ];

                        await new Promise((res, rej) => {
                            transaction.query(sqlFact, paramsFact, (err) => err ? rej(err) : res());
                        });

                        // 2.7 Registro en Bitácora (BITA15)
                        const bitaRows = await new Promise((res, rej) => transaction.query(
                            `SELECT ULT_CVE FROM TBLCONTROL15 WHERE ID_TABLA = 62`, [], (err, result) => err ? rej(err) : res(result)
                        ));
                        const nextBita = parseInt(bitaRows[0].ULT_CVE, 10) + 1;
                        await new Promise((res, rej) => transaction.query(
                            `UPDATE TBLCONTROL15 SET ULT_CVE = ? WHERE ID_TABLA = 62`, [nextBita], (err) => err ? rej(err) : res()
                        ));

                        const nomUsuarioBita = (cotizacion.propietario || 'ZOHO_CRM').substring(0, 15);
                        const obsBita = `No. [ ${fullFolio.trim()} ] $ ${totalFinal.toFixed(2)}`.substring(0, 55);

                        await new Promise((res, rej) => transaction.query(
                            `INSERT INTO BITA15 (CVE_BITA, CVE_CLIE, CVE_CAMPANIA, CVE_ACTIVIDAD, FECHAHORA, CVE_USUARIO, OBSERVACIONES, STATUS, NOM_USUARIO)
                             VALUES (?, ?, '_SAE_', '    5', CURRENT_TIMESTAMP, 0, ?, 'F', ?)`,
                            [nextBita, paddedClave, obsBita, nomUsuarioBita],
                            (err) => err ? rej(err) : res()
                        ));

                        // Actualizar CVE_BITA en el encabezado de la cotización
                        await new Promise((res, rej) => transaction.query(
                            `UPDATE FACTC15 SET CVE_BITA = ? WHERE CVE_DOC = ?`, [nextBita, fullFolio], (err) => err ? rej(err) : res()
                        ));

                        logger.info(`[saeWrite] Bitácora registrada → CVE_BITA: ${nextBita}, Usuario: ${nomUsuarioBita}`);

                        // 3. Insertar Partidas
                        const sqlPar = `
                            INSERT INTO PAR_FACTC15 (
                                CVE_DOC, NUM_PAR, CVE_ART, CANT, PXS, PREC, COST,
                                IMPU1, IMPU2, IMPU3, IMPU4, IMPU5, IMPU6, IMPU7, IMPU8,
                                IMP1APLA, IMP2APLA, IMP3APLA, IMP4APLA, IMP5APLA, IMP6APLA, IMP7APLA, IMP8APLA,
                                TOTIMP1, TOTIMP2, TOTIMP3, TOTIMP4, TOTIMP5, TOTIMP6, TOTIMP7, TOTIMP8,
                                DESC1, DESC2, DESC3, COMI, APAR, ACT_INV, NUM_ALM,
                                TIP_CAM, UNI_VENTA, TIPO_PROD, REG_SERIE, E_LTPD, TIPO_ELEM, NUM_MOV,
                                TOT_PARTIDA, IMPRIMIR, MAN_IEPS, APL_MAN_IMP, CUOTA_IEPS, APL_MAN_IEPS,
                                MTO_PORC, MTO_CUOTA, CVE_ESQ, UUID, VERSION_SINC,
                                CVE_PRODSERV, CVE_UNIDAD, CVE_OBS, POLIT_APLI, PRECCIMP
                            ) VALUES (
                                ?, ?, ?, ?, ?, ?, ?,
                                0, 0, 0, ?, 0, 0, 0, 0,
                                6, 6, 6, 0, 6, 6, 6, 6,
                                0, 0, 0, ?, 0, 0, 0, 0,
                                ?, 0, 0, ?, 0, 'N', ?,
                                1.0, ?, ?, 0, 0, ?, 0,
                                ?, 'S', 'N', 1, 0, 'C',
                                0, 0, ?, ?, CURRENT_TIMESTAMP,
                                ?, ?, ?, '', ?
                            )
                        `;

                        for (let i = 0; i < partidasEnriquecidas.length; i++) {
                            const p = partidasEnriquecidas[i];
                            const numPar = i + 1;
                            const descuentoMonto = parseFloat(p.descuento || 0);
                            const desc1Porc = (p.precio > 0) ? ((descuentoMonto / (p.precio * p.cantidad)) * 100).toFixed(4) : 0;
                            const subtotalNeto = (p.precio * p.cantidad) - descuentoMonto;
                            const totImp4 = subtotalNeto * (p.tasaIva / 100);
                            const totPartida = (p.precio * p.cantidad);
                            const precCimp = p.precio * (1 + (p.tasaIva / 100));
                            const lineUuid = uuidv4().toUpperCase();

                            let cveObs = 0;
                            if (p.comentario && p.comentario.trim().length > 0) {
                                const obsRows = await new Promise((res, rej) => transaction.query(
                                    `SELECT ULT_CVE FROM TBLCONTROL15 WHERE ID_TABLA = 56`, [], (err, result) => err ? rej(err) : res(result)
                                ));
                                cveObs = parseInt(obsRows[0].ULT_CVE, 10) + 1;
                                await new Promise((res, rej) => transaction.query(
                                    `UPDATE TBLCONTROL15 SET ULT_CVE = ? WHERE ID_TABLA = 56`, [cveObs], (err) => err ? rej(err) : res()
                                ));
                                await new Promise((res, rej) => transaction.query(
                                    `INSERT INTO OBS_DOCF15 (CVE_OBS, STR_OBS) VALUES (?, ?)`,
                                    [cveObs, p.comentario.trim().substring(0, 255)],
                                    (err) => err ? rej(err) : res()
                                ));
                            }

                            const paramsPar = [
                                fullFolio, numPar, p.cveArt, p.cantidad, p.cantidad, p.precio, p.costo,
                                p.tasaIva, totImp4, desc1Porc, comisionPorc, numAlma, p.uniMed, p.tipoEle, p.tipoElemInterno, totPartida, p.cveEsqImpu, lineUuid,
                                p.cveProdServ, p.cveUnidad, cveObs, precCimp
                            ];

                            await new Promise((res, rej) => {
                                transaction.query(sqlPar, paramsPar, (err) => err ? rej(err) : res());
                            });
                        }

                        // Commit
                        transaction.commit((err) => {
                            if (err) {
                                transaction.rollback();
                                connection.detach();
                                return reject(err);
                            }
                            connection.detach();
                            resolve(fullFolio);
                        });

                    } catch (error) {
                        transaction.rollback();
                        connection.detach();
                        reject(error);
                    }
                });
            }).catch(reject);
        });
    }

    /**
     * Convierte una Cotización a Pedido en Aspel SAE.
     * @param {string} cveCotizacion - Ej: 'C-QR-026433'
     * @param {string} seriePedido - Ej: 'P-QR-'
     * @returns {Promise<string>} - Folio del nuevo pedido generado.
     */
        /**
     * Actualiza una Cotizacion existente en Aspel SAE.
     * @param {string} folioSae - Ej: 'C-QR-026525'
     * @param {Object} cotizacion - Datos de la cotizacion
     * @returns {Promise<string>} - El mismo folio
     */
    static async updateCotizacion(folioSae, cotizacion) {
        return new Promise((resolve, reject) => {
            const fullFolio = folioSae.padEnd(20, ' ');
            db.getConnection().then((connection) => {
                connection.transaction(Firebird.ISOLATION_READ_COMMITTED, async (err, transaction) => {
                    if (err) {
                        connection.detach();
                        return reject(err);
                    }
                    try {
                        // 1. Validar existencia y status
                        const docRows = await new Promise((res, rej) => {
                            transaction.query(`SELECT ENLAZADO, STATUS FROM FACTC15 WHERE CVE_DOC = ?`, [fullFolio], (e, r) => e ? rej(e) : res(r));
                        });
                        
                        if (docRows.length === 0) {
                            throw new Error(`La cotización ${folioSae} no existe en SAE.`);
                        }
                        if (docRows[0].ENLAZADO !== 'O' || docRows[0].STATUS !== 'O') {
                            throw new Error(`Esta cotización ya es un pedido (o está cancelada), no se puede modificar.`);
                        }

                        const sucursalToAlmacen = {
                            'Querétaro': 1,
                            'Xalapa': 2,
                            'San Luis Potosí': 3,
                            'SLP': 3,
                            'Huasteca': 4
                        };
                        const numAlma = sucursalToAlmacen[cotizacion.sucursal] || 1;

                        // 2. Validar cliente
                        const cveClpvStr = cotizacion.clienteClave.toString().trim();
                        const paddedClave = cveClpvStr.padStart(10, ' ');
                        const clieRows = await new Promise((res, rej) => transaction.query(
                            `SELECT TRIM(RFC) as RFC, TRIM(REG_FISC) as REG_FISC FROM CLIE15 WHERE CLAVE = ?`, [paddedClave], (e, r) => e ? rej(e) : res(r)
                        ));
                        if (clieRows.length === 0) {
                            throw new Error(`El cliente ${cveClpvStr} no existe en SAE.`);
                        }
                        const client = clieRows[0];
                        const paddedVendedor = (cotizacion.vendedorClave || '1').toString().trim().padStart(5, ' ');

                        // 3. Enriquecer partidas
                        const SaeReadService = require('./saeRead');
                        const partidasEnriquecidas = [];
                        for (const p of cotizacion.partidas) {
                            const artSae = await SaeReadService.getProducto(p.cveArt);
                            if (!artSae) throw new Error(`El producto ${p.cveArt} no existe en SAE.`);
                            
                            partidasEnriquecidas.push({
                                ...p,
                                costo: artSae.ULT_COSTO || 0,
                                uniMed: artSae.UNI_MED || 'PZA',
                                cveProdServ: artSae.CVE_PRODSERV || '',
                                cveUnidad: artSae.CVE_UNIDAD || '',
                                tipoEle: artSae.TIPO_ELE || 'P',
                                tipoElemInterno: 'N',
                                cveEsqImpu: artSae.CVE_ESQIMPU || 1,
                                tasaIva: artSae.TASA_IVA !== null && artSae.TASA_IVA !== undefined ? parseFloat(artSae.TASA_IVA) : p.tasaIva
                            });
                            
                            // Explosión de Kits
                            if (artSae.TIPO_ELE === 'K') {
                                const componentes = await SaeReadService.getKitComponents(p.cveArt);
                                for (const comp of componentes) {
                                    const compProd = await SaeReadService.getProducto(comp.CVE_PROD);
                                    if (!compProd) continue;
                
                                    partidasEnriquecidas.push({
                                        cveArt: comp.CVE_PROD,
                                        cantidad: p.cantidad * comp.CANTIDAD,
                                        precio: p.precio * comp.PORCEN,
                                        tasaIva: p.tasaIva,
                                        descuento: (parseFloat(p.descuento) || 0) * comp.PORCEN,
                                        comentario: '',
                                        uniMed: compProd.UNI_MED || 'PZA',
                                        cveProdServ: compProd.CVE_PRODSERV || '',
                                        cveUnidad: compProd.CVE_UNIDAD || '',
                                        costo: compProd.ULT_COSTO || 0,
                                        tipoEle: compProd.TIPO_ELE || 'P',
                                        tipoElemInterno: 'K',
                                        cveEsqImpu: compProd.CVE_ESQIMPU || 1,
                                        tasaIva: compProd.TASA_IVA !== null && compProd.TASA_IVA !== undefined ? parseFloat(compProd.TASA_IVA) : p.tasaIva
                                    });
                                }
                            }
                        }

                        // ============================================================
                        // CALCULAR IVA Y TOTAL DESDE LAS PARTIDAS (fuente de verdad: SAE)
                        // ============================================================
                        let ivaUpdate = 0;
                        let subtotalUpdate = 0;
                        for (const pe of partidasEnriquecidas) {
                            if (pe.tipoElemInterno === 'K') continue;
                            const precioNeto = parseFloat(pe.precio || 0) * parseFloat(pe.cantidad || 1);
                            const descPartida = parseFloat(pe.descuento || 0);
                            const precioConDesc = precioNeto - descPartida;
                            const ivaPartida = precioConDesc * (parseFloat(pe.tasaIva || 0) / 100);
                            subtotalUpdate += precioNeto;
                            ivaUpdate += ivaPartida;
                        }
                        const subtotalUpdateFinal = parseFloat(cotizacion.subtotal) > 0 ? parseFloat(cotizacion.subtotal) : subtotalUpdate;
                        const ivaUpdateFinal = ivaUpdate;
                        const totalUpdateFinal = subtotalUpdateFinal + ivaUpdateFinal - parseFloat(cotizacion.descuentoTotal || 0);
                        logger.info(`[saeWrite.update] Totales recalculados → Subtotal: ${subtotalUpdateFinal}, IVA: ${ivaUpdateFinal}, Total: ${totalUpdateFinal}`);

                        // 4. Actualizar Encabezado
                        const sqlUpdate = `
                            UPDATE FACTC15 SET 
                                CVE_CLPV = ?, RFC = ?, CVE_VEND = ?, REG_FISC = ?,
                                IMP_TOT4 = ?, CAN_TOT = ?, DES_TOT = ?, IMPORTE = ?,
                                NUM_ALMA = ?,
                                FECHA_VEN = ${cotizacion.fechaVigencia ? `CAST('${cotizacion.fechaVigencia}' AS TIMESTAMP)` : `CAST(CURRENT_DATE + 15 AS TIMESTAMP)`}
                            WHERE CVE_DOC = ?
                        `;
                        const paramsUpdate = [
                            paddedClave, client.RFC, paddedVendedor, client.REG_FISC,
                            ivaUpdateFinal, totalUpdateFinal, cotizacion.descuentoTotal || 0, subtotalUpdateFinal,
                            numAlma, fullFolio
                        ];
                        await new Promise((res, rej) => transaction.query(sqlUpdate, paramsUpdate, (e) => e ? rej(e) : res()));

                        // 5. Eliminar partidas viejas
                        await new Promise((res, rej) => transaction.query(`DELETE FROM PAR_FACTC15 WHERE CVE_DOC = ?`, [fullFolio], (e) => e ? rej(e) : res()));

                        // 6. Insertar Partidas Nuevas
                        const sqlPar = `
                            INSERT INTO PAR_FACTC15 (
                                CVE_DOC, NUM_PAR, CVE_ART, CANT, PXS, PREC, COST,
                                IMPU1, IMPU2, IMPU3, IMPU4, IMPU5, IMPU6, IMPU7, IMPU8,
                                IMP1APLA, IMP2APLA, IMP3APLA, IMP4APLA, IMP5APLA, IMP6APLA, IMP7APLA, IMP8APLA,
                                TOTIMP1, TOTIMP2, TOTIMP3, TOTIMP4, TOTIMP5, TOTIMP6, TOTIMP7, TOTIMP8,
                                DESC1, DESC2, DESC3, COMI, APAR, ACT_INV, NUM_ALM,
                                TIP_CAM, UNI_VENTA, TIPO_PROD, REG_SERIE, E_LTPD, TIPO_ELEM, NUM_MOV,
                                TOT_PARTIDA, IMPRIMIR, MAN_IEPS, APL_MAN_IMP, CUOTA_IEPS, APL_MAN_IEPS,
                                MTO_PORC, MTO_CUOTA, CVE_ESQ, UUID, VERSION_SINC,
                                CVE_PRODSERV, CVE_UNIDAD, CVE_OBS, POLIT_APLI, PRECCIMP
                            ) VALUES (
                                ?, ?, ?, ?, ?, ?, ?,
                                0, 0, 0, ?, 0, 0, 0, 0,
                                6, 6, 6, 0, 6, 6, 6, 6,
                                0, 0, 0, ?, 0, 0, 0, 0,
                                ?, 0, 0, ?, 0, 'N', ?,
                                1.0, ?, ?, 0, 0, ?, 0,
                                ?, 'S', 'N', 1, 0, 'C',
                                0, 0, ?, ?, CURRENT_TIMESTAMP,
                                ?, ?, ?, '', ?
                            )
                        `;

                        const { v4: uuidv4 } = require('uuid');
                        
                        for (let i = 0; i < partidasEnriquecidas.length; i++) {
                            const p = partidasEnriquecidas[i];
                            const numPar = i + 1;
                            const descuentoMonto = parseFloat(p.descuento || 0);
                            const desc1Porc = (p.precio > 0) ? ((descuentoMonto / (p.precio * p.cantidad)) * 100).toFixed(4) : 0;
                            const subtotalNeto = (p.precio * p.cantidad) - descuentoMonto;
                            const totImp4 = subtotalNeto * (p.tasaIva / 100);
                            const totPartida = (p.precio * p.cantidad);
                            const precCimp = p.precio * (1 + (p.tasaIva / 100));
                            const lineUuid = uuidv4().toUpperCase();

                            let cveObs = 0;
                            if (p.comentario && p.comentario.trim().length > 0) {
                                const obsRows = await new Promise((res, rej) => transaction.query(
                                    `SELECT ULT_CVE FROM TBLCONTROL15 WHERE ID_TABLA = 56`, [], (err, result) => err ? rej(err) : res(result)
                                ));
                                cveObs = parseInt(obsRows[0].ULT_CVE, 10) + 1;
                                await new Promise((res, rej) => transaction.query(
                                    `UPDATE TBLCONTROL15 SET ULT_CVE = ? WHERE ID_TABLA = 56`, [cveObs], (err) => err ? rej(err) : res()
                                ));
                                await new Promise((res, rej) => transaction.query(
                                    `INSERT INTO OBS_DOCF15 (CVE_OBS, STR_OBS) VALUES (?, ?)`,
                                    [cveObs, p.comentario.trim().substring(0, 255)],
                                    (err) => err ? rej(err) : res()
                                ));
                            }

                            // Obtener comisión para la partida (en update no lo tenemos a la mano arriba, lo podemos poner en 0 o recalcular si es necesario, pero para ser seguros pasamos 0 o sacamos la lógica si falla)
                            // En lugar de hacer otra query, por simplicidad si no tenemos la comisión aquí, dejamos 0
                            const comisionPorc = 0; 
                            const paramsPar = [
                                fullFolio, numPar, p.cveArt, p.cantidad, p.cantidad, p.precio, p.costo,
                                p.tasaIva, totImp4, desc1Porc, comisionPorc, numAlma, p.uniMed, p.tipoEle, p.tipoElemInterno, totPartida, p.cveEsqImpu, lineUuid,
                                p.cveProdServ, p.cveUnidad, cveObs, precCimp
                            ];

                            await new Promise((res, rej) => {
                                transaction.query(sqlPar, paramsPar, (err) => err ? rej(err) : res());
                            });
                        }

                        // Commit
                        transaction.commit((err) => {
                            if (err) {
                                transaction.rollback();
                                connection.detach();
                                return reject(err);
                            }
                            connection.detach();
                            resolve(folioSae);
                        });

                    } catch (error) {
                        transaction.rollback();
                        connection.detach();
                        reject(error);
                    }
                });
            }).catch(reject);
        });
    }


    static async convertirCotizacionAPedido(cveCotizacion, seriePedido) {
        return new Promise((resolve, reject) => {
            const folioCotiz = cveCotizacion.trim();
            db.getConnection().then((connection) => {
                connection.transaction(Firebird.ISOLATION_READ_COMMITTED, async (err, transaction) => {
                    if (err) {
                        connection.detach();
                        return reject(err);
                    }

                    try {
                        
                        // 1. Obtener cabecera de la cotización original
                        const sqlCot = "SELECT * FROM FACTC15 WHERE CVE_DOC = ?";
                        const cotResult = await new Promise((res, rej) => {
                            transaction.query(sqlCot, [folioCotiz], (err, result) => err ? rej(err) : res(result));
                        });

                        if (!cotResult || cotResult.length === 0) {
                            throw new Error(`No se encontró la cotización ${cveCotizacion.trim()} en Aspel SAE.`);
                        }

                        const cot = cotResult[0];

                        // Si ya está enlazada, retornar el DOC_SIG
                        if (cot.ENLAZADO === 'T' && cot.DOC_SIG) {
                            throw new Error(`La cotización ya fue convertida previamente. Pedido: ${cot.DOC_SIG}`);
                        }

                        // Validación: Bloquear a Clientes Morosos
                        const sqlClie = "SELECT STATUS FROM CLIE15 WHERE TRIM(CLAVE) = TRIM(?)";
                        const clieResult = await new Promise((res, rej) => {
                            transaction.query(sqlClie, [cot.CVE_CLPV], (err, result) => err ? rej(err) : res(result));
                        });
                        
                        if (clieResult && clieResult.length > 0) {
                            if (clieResult[0].STATUS === 'M') {
                                throw new Error("ATENCION!!! El cliente al que intentas hacer pedido tiene un estatus de MOROSO. Hable con el directo de ventas para que le autorice este movimiento.");
                            }
                        }

                        // 2. Obtener el siguiente folio para el Pedido
                        const sqlFolio = "SELECT ULT_DOC FROM FOLIOSF15 WHERE TIP_DOC = 'P' AND SERIE = ?";
                        const folioResult = await new Promise((res, rej) => {
                            transaction.query(sqlFolio, [seriePedido], (err, result) => err ? rej(err) : res(result));
                        });

                        if (!folioResult || folioResult.length === 0) {
                            throw new Error(`No se encontró la serie de folios '${seriePedido}' para pedidos.`);
                        }

                        let currentFolioNum = parseInt(folioResult[0].ULT_DOC, 10);
                        let nextFolioNum = currentFolioNum + 1;
                        const newPedidoFolio = `${seriePedido}${nextFolioNum.toString().padStart(6, '0')}`;
                        
                        let clavePedido = newPedidoFolio;

                        // 3. Actualizar FOLIOSF15 (+1)
                        await new Promise((res, rej) => {
                            transaction.query(
                                "UPDATE FOLIOSF15 SET ULT_DOC = ? WHERE TIP_DOC = 'P' AND SERIE = ?",
                                [nextFolioNum, seriePedido],
                                (err) => err ? rej(err) : res()
                            );
                        });

                        // 4. Insertar cabecera del Pedido en FACTP15 (Copia de FACTC15)
                        const { v4: uuidv4 } = require('uuid');
                        const newUuid = uuidv4().toUpperCase();

                        const sqlInsertFactP = `
                            INSERT INTO FACTP15 (
                                TIP_DOC, CVE_DOC, CVE_CLPV, STATUS, DAT_MOSTR, CVE_VEND, CVE_PEDI,
                                FECHA_DOC, FECHA_ENT, FECHA_VEN, CAN_TOT, IMP_TOT1, IMP_TOT2, IMP_TOT3,
                                IMP_TOT4, IMP_TOT5, IMP_TOT6, IMP_TOT7, IMP_TOT8, DES_TOT, DES_FIN, COM_TOT, CONDICION,
                                CVE_OBS, NUM_ALMA, ACT_CXC, ACT_COI,
                                ENLAZADO, TIP_DOC_E, NUM_MONED, TIPCAMB, NUM_PAGOS, FECHAELAB,
                                PRIMERPAGO, RFC, CTLPOL, ESCFD, AUTORIZA, SERIE, FOLIO, AUTOANIO, DAT_ENVIO, CONTADO,
                                CVE_BITA, BLOQ, FORMAENVIO, DES_FIN_PORC, DES_TOT_PORC, IMPORTE, COM_TOT_PORC,
                                METODODEPAGO, NUMCTAPAGO, TIP_DOC_ANT, DOC_ANT, TIP_DOC_SIG, DOC_SIG,
                                UUID, VERSION_SINC, FORMADEPAGOSAT, USO_CFDI, TIP_FAC, REG_FISC
                            ) VALUES (
                                'P', ?, ?, 'O', ?, ?, ?,
                                CAST(CURRENT_DATE AS TIMESTAMP), CAST(CURRENT_DATE AS TIMESTAMP), ?, ?, ?, ?, ?,
                                ?, ?, ?, ?, ?, ?, ?, ?, ?,
                                ?, ?, ?, ?,
                                'O', ?, ?, ?, ?, CURRENT_TIMESTAMP,
                                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                                ?, ?, ?, ?, ?, ?, ?,
                                ?, ?, 'C', ?, 'O', NULL,
                                ?, CURRENT_TIMESTAMP, ?, ?, 'P', ?
                            )
                        `;
                        const paramsFactP = [
                            clavePedido, cot.CVE_CLPV, cot.DAT_MOSTR, cot.CVE_VEND, cot.CVE_PEDI,
                            cot.FECHA_VEN, cot.CAN_TOT, cot.IMP_TOT1, cot.IMP_TOT2, cot.IMP_TOT3,
                            cot.IMP_TOT4, cot.IMP_TOT5, cot.IMP_TOT6, cot.IMP_TOT7, cot.IMP_TOT8, cot.DES_TOT, cot.DES_FIN, cot.COM_TOT, cot.CONDICION,
                            cot.CVE_OBS, cot.NUM_ALMA, cot.ACT_CXC, cot.ACT_COI,
                            cot.TIP_DOC_E, cot.NUM_MONED, cot.TIPCAMB, cot.NUM_PAGOS,
                            cot.PRIMERPAGO, cot.RFC, cot.CTLPOL, cot.ESCFD, cot.AUTORIZA, seriePedido, nextFolioNum, cot.AUTOANIO, cot.DAT_ENVIO, cot.CONTADO,
                            cot.CVE_BITA, cot.BLOQ, cot.FORMAENVIO, cot.DES_FIN_PORC, cot.DES_TOT_PORC, cot.IMPORTE, cot.COM_TOT_PORC,
                            cot.METODODEPAGO, cot.NUMCTAPAGO, cot.CVE_DOC,
                            newUuid, cot.FORMADEPAGOSAT, cot.USO_CFDI, cot.REG_FISC
                        ];

                        await new Promise((res, rej) => {
                            transaction.query(sqlInsertFactP, paramsFactP, (err) => err ? rej(err) : res());
                        });

                        // 4.5. Insertar en FACTP_CLIB15 (Requerido por el generador de PDF)
                        const sqlFactClib = `INSERT INTO FACTP_CLIB15 (CLAVE_DOC) VALUES (?)`;
                        await new Promise((res, rej) => {
                            transaction.query(sqlFactClib, [clavePedido], (err) => err ? rej(err) : res());
                        });

                        // 4.6 Registro en Bitácora (BITA15) para el Pedido
                        const bitaRowsP = await new Promise((res, rej) => transaction.query(
                            `SELECT ULT_CVE FROM TBLCONTROL15 WHERE ID_TABLA = 62`, [], (err, result) => err ? rej(err) : res(result)
                        ));
                        const nextBitaP = parseInt(bitaRowsP[0].ULT_CVE, 10) + 1;
                        await new Promise((res, rej) => transaction.query(
                            `UPDATE TBLCONTROL15 SET ULT_CVE = ? WHERE ID_TABLA = 62`, [nextBitaP], (err) => err ? rej(err) : res()
                        ));

                        // Obtener nombre del propietario desde la bitácora de la cotización original
                        let nomUsuarioPedido = 'ZOHO_CRM';
                        if (cot.CVE_BITA > 0) {
                            const bitaOrig = await new Promise((res, rej) => transaction.query(
                                `SELECT NOM_USUARIO FROM BITA15 WHERE CVE_BITA = ?`, [cot.CVE_BITA], (err, result) => err ? rej(err) : res(result)
                            ));
                            if (bitaOrig && bitaOrig.length > 0 && bitaOrig[0].NOM_USUARIO) {
                                nomUsuarioPedido = bitaOrig[0].NOM_USUARIO.trim();
                            }
                        }

                        const obsBitaP = `No. [ ${clavePedido.trim()} ] $ ${(cot.IMPORTE || cot.CAN_TOT || 0).toFixed(2)}`.substring(0, 55);

                        await new Promise((res, rej) => transaction.query(
                            `INSERT INTO BITA15 (CVE_BITA, CVE_CLIE, CVE_CAMPANIA, CVE_ACTIVIDAD, FECHAHORA, CVE_USUARIO, OBSERVACIONES, STATUS, NOM_USUARIO)
                             VALUES (?, ?, '_SAE_', '    4', CURRENT_TIMESTAMP, 0, ?, 'F', ?)`,
                            [nextBitaP, cot.CVE_CLPV, obsBitaP, nomUsuarioPedido.substring(0, 15)],
                            (err) => err ? rej(err) : res()
                        ));

                        // Actualizar CVE_BITA en el encabezado del pedido
                        await new Promise((res, rej) => transaction.query(
                            `UPDATE FACTP15 SET CVE_BITA = ? WHERE CVE_DOC = ?`, [nextBitaP, clavePedido], (err) => err ? rej(err) : res()
                        ));

                        logger.info(`[saeWrite] Bitácora de pedido registrada → CVE_BITA: ${nextBitaP}, Usuario: ${nomUsuarioPedido}`);

                        // 5. Copiar Partidas (PAR_FACTC15 -> PAR_FACTP15) y Reservar Inventario
                        const sqlGetPar = "SELECT * FROM PAR_FACTC15 WHERE CVE_DOC = ? ORDER BY NUM_PAR ASC";
                        const parResult = await new Promise((res, rej) => {
                            transaction.query(sqlGetPar, [folioCotiz], (err, result) => err ? rej(err) : res(result));
                        });

                        const sqlInsertParP = `
                            INSERT INTO PAR_FACTP15 (
                                CVE_DOC, NUM_PAR, CVE_ART, CANT, PXS, PREC, COST,
                                IMPU1, IMPU2, IMPU3, IMPU4, IMPU5, IMPU6, IMPU7, IMPU8,
                                IMP1APLA, IMP2APLA, IMP3APLA, IMP4APLA, IMP5APLA, IMP6APLA, IMP7APLA, IMP8APLA,
                                TOTIMP1, TOTIMP2, TOTIMP3, TOTIMP4, TOTIMP5, TOTIMP6, TOTIMP7, TOTIMP8,
                                DESC1, DESC2, DESC3, COMI, APAR, ACT_INV, NUM_ALM,
                                TIP_CAM, UNI_VENTA, TIPO_PROD, CVE_OBS, REG_SERIE, E_LTPD, TIPO_ELEM, NUM_MOV,
                                TOT_PARTIDA, IMPRIMIR, MAN_IEPS, APL_MAN_IMP, CUOTA_IEPS, APL_MAN_IEPS,
                                MTO_PORC, MTO_CUOTA, CVE_ESQ, UUID, VERSION_SINC, CVE_PRODSERV, CVE_UNIDAD, PRECCIMP
                            ) VALUES (
                                ?, ?, ?, ?, ?, ?, ?,
                                ?, ?, ?, ?, ?, ?, ?, ?,
                                ?, ?, ?, ?, ?, ?, ?, ?,
                                ?, ?, ?, ?, ?, ?, ?, ?,
                                ?, ?, ?, ?, ?, ?, ?,
                                ?, ?, ?, ?, ?, ?, ?, ?,
                                ?, ?, ?, ?, ?, ?,
                                ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?
                            )
                        `;

                        for (const par of parResult) {
                            const newParUuid = uuidv4().toUpperCase();
                            const paramsInsertParP = [
                                clavePedido, par.NUM_PAR, par.CVE_ART, par.CANT, par.PXS, par.PREC, par.COST,
                                par.IMPU1, par.IMPU2, par.IMPU3, par.IMPU4, par.IMPU5, par.IMPU6, par.IMPU7, par.IMPU8,
                                par.IMP1APLA, par.IMP2APLA, par.IMP3APLA, par.IMP4APLA, par.IMP5APLA, par.IMP6APLA, par.IMP7APLA, par.IMP8APLA,
                                par.TOTIMP1, par.TOTIMP2, par.TOTIMP3, par.TOTIMP4, par.TOTIMP5, par.TOTIMP6, par.TOTIMP7, par.TOTIMP8,
                                par.DESC1, par.DESC2, par.DESC3, par.COMI, par.APAR, par.ACT_INV, par.NUM_ALM,
                                par.TIP_CAM, par.UNI_VENTA, par.TIPO_PROD, par.CVE_OBS, par.REG_SERIE, par.E_LTPD, par.TIPO_ELEM, par.NUM_MOV,
                                (par.PREC * par.CANT), par.IMPRIMIR, par.MAN_IEPS, par.APL_MAN_IMP, par.CUOTA_IEPS, par.APL_MAN_IEPS,
                                par.MTO_PORC, par.MTO_CUOTA, par.CVE_ESQ, newParUuid, par.CVE_PRODSERV, par.CVE_UNIDAD,
                                (par.PREC * (1 + (par.IMPU4 / 100)))
                            ];
                            await new Promise((res, rej) => {
                                transaction.query(sqlInsertParP, paramsInsertParP, (err) => err ? rej(err) : res());
                            });

                            // Insertar en PAR_FACTP_CLIB15 (Requerido por el generador de PDF)
                            const sqlParFactClib = `INSERT INTO PAR_FACTP_CLIB15 (CLAVE_DOC, NUM_PART) VALUES (?, ?)`;
                            await new Promise((res, rej) => {
                                transaction.query(sqlParFactClib, [clavePedido, par.NUM_PAR], (err) => err ? rej(err) : res());
                            });

                            // Insertar trazabilidad en DOCTOSIGF15 (Doble registro por partida)
                            const sqlDocSig = `INSERT INTO DOCTOSIGF15 (TIP_DOC, CVE_DOC, ANT_SIG, TIP_DOC_E, CVE_DOC_E, PARTIDA, PART_E, CANT_E) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                            
                            // Registro 1: La cotización apunta al pedido (Siguiente)
                            await new Promise((res, rej) => {
                                transaction.query(sqlDocSig, ['C', folioCotiz, 'S', 'P', newPedidoFolio, par.NUM_PAR, par.NUM_PAR, par.CANT], (err) => err ? rej(err) : res());
                            });
                            
                            // Registro 2: El pedido apunta a la cotización (Antecedente)
                            await new Promise((res, rej) => {
                                transaction.query(sqlDocSig, ['P', newPedidoFolio, 'A', 'C', folioCotiz, par.NUM_PAR, par.NUM_PAR, par.CANT], (err) => err ? rej(err) : res());
                            });

                            // Actualizar Inventario (Reservar: aumentar PEND_SURT)
                            await new Promise((res, rej) => {
                                transaction.query(
                                    "UPDATE INVE15 SET PEND_SURT = COALESCE(PEND_SURT, 0) + ? WHERE CVE_ART = ?",
                                    [par.CANT, par.CVE_ART], (err) => err ? rej(err) : res()
                                );
                            });
                            await new Promise((res, rej) => {
                                transaction.query(
                                    "UPDATE MULT15 SET PEND_SURT = COALESCE(PEND_SURT, 0) + ? WHERE CVE_ART = ? AND CVE_ALM = ?",
                                    [par.CANT, par.CVE_ART, par.NUM_ALM], (err) => err ? rej(err) : res()
                                );
                            });
                        }

                        // 6. Actualizar Cotización original (STATUS = 'E', ENLAZADO = 'T', DOC_SIG = pedido)
                        await new Promise((res, rej) => {
                            transaction.query(
                                "UPDATE FACTC15 SET STATUS = 'E', ENLAZADO = 'T', TIP_DOC_SIG = 'P', DOC_SIG = ? WHERE CVE_DOC = ?",
                                [clavePedido, folioCotiz], (err) => err ? rej(err) : res()
                            );
                        });

                        // Commit
                        transaction.commit((err) => {
                            if (err) {
                                transaction.rollback();
                                connection.detach();
                                return reject(err);
                            }
                            connection.detach();
                            resolve(newPedidoFolio);
                        });

                    } catch (error) {
                        transaction.rollback();
                        connection.detach();
                        reject(error);
                    }
                });
            }).catch(reject);
        });
    }
}

module.exports = SaeWriteService;

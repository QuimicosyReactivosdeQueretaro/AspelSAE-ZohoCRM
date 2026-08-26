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
                                cveUnidad: artSae.CVE_UNIDAD || ''
                            });
                        }

                        // 4. Actualizar Encabezado
                        const sqlUpdate = `
                            UPDATE FACTC15 SET 
                                CVE_CLPV = ?, RFC = ?, CVE_VEND = ?, REG_FISC = ?,
                                IMP_TOT4 = ?, CAN_TOT = ?, DES_TOT = ?, IMPORTE = ?,
                                FECHA_VEN = ${cotizacion.fechaVigencia ? `CAST('${cotizacion.fechaVigencia}' AS TIMESTAMP)` : `CAST(CURRENT_DATE + 15 AS TIMESTAMP)`}
                            WHERE CVE_DOC = ?
                        `;
                        const paramsUpdate = [
                            paddedClave, client.RFC, paddedVendedor, client.REG_FISC,
                            cotizacion.iva, cotizacion.total, cotizacion.descuentoTotal || 0, cotizacion.subtotal,
                            fullFolio
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
                                ?, 0, 0, 0, 0, 'N', 1,
                                1.0, ?, 'P', 0, 0, 'N', 0,
                                ?, 'S', 'N', 1, 0, 'C',
                                0, 0, 1, ?, CURRENT_TIMESTAMP,
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

                            const paramsPar = [
                                fullFolio, numPar, p.cveArt, p.cantidad, p.cantidad, p.precio, p.costo,
                                p.tasaIva, totImp4, desc1Porc, p.uniMed, totPartida, lineUuid,
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

const express = require('express');
const router = express.Router();
const saeWrite = require('../services/saeWrite');
const logger = require('../utils/logger');
const db = require('../config/database');

/**
 * ============================================================================
 * ARCHIVO: src/routes/webhook.js (EL RECEPTOR DE COTIZACIONES)
 * ============================================================================
 * ¿Para qué sirve?
 * Cuando Zoho CRM envía una cotización hacia abajo (a través del túnel),
 * este archivo es el que "abre la puerta", recibe el paquete de datos (JSON),
 * lo revisa para ver que no falte nada importante, y se lo pasa a saeWrite.js 
 * para que lo guarde en la base de datos de Aspel SAE.
 * ============================================================================
 */

// POST /webhook/cotizacion
// Esta es la ruta exacta (el camino final) que pegaste en Zoho CRM.
router.post('/cotizacion', async (req, res) => {
    try {
        // req.body contiene toda la información que nos mandó Zoho CRM
        const payload = req.body;
        logger.info(`Recibida petición de webhook para nueva cotización: ${JSON.stringify(payload)}`);

        // Extraer y formatear los datos enviados desde Zoho
        // (Zoho enviará un JSON con la estructura que definimos en su función Deluge)
        // Mapeo de Sucursales a Series de Folio
        let sucursalMap;
        let defaultSerie;
        
        if (payload.tipoCotizacion === 'Equipos') {
            sucursalMap = {
                'Querétaro': 'C-EQ',
                'Xalapa': 'C-EX',
                'San Luis Potosí': 'C-ES',
                'SLP': 'C-ES',
                'Huasteca': 'C-EH'
            };
            defaultSerie = 'C-EQ';
        } else {
            // Reactivos (Normal)
            sucursalMap = {
                'Querétaro': 'C-QR-',
                'Xalapa': 'C-XA-',
                'San Luis Potosí': 'C-SL-',
                'SLP': 'C-SL-',
                'Huasteca': 'C-HT-'
            };
            defaultSerie = 'C-QR-';
        }
        
        const serieSeleccionada = payload.sucursal ? sucursalMap[payload.sucursal] || defaultSerie : defaultSerie;

        const cotizacion = {
            serie: serieSeleccionada,
            sucursal: payload.sucursal || '',
            clienteClave: payload.clienteClave,
            vendedorClave: payload.vendedorClave,
            fechaVigencia: payload.fechaVigencia || null, // Nueva fecha
            descripcion: payload.descripcion || '', // Comentario general del documento
            partidas: payload.partidas || [], // Array de objetos { cveArt, cantidad, precio, tasaIva, comentario, descuento }
            subtotal: parseFloat(payload.subtotal || 0),
            descuentoTotal: parseFloat(payload.descuentoTotal || 0), // Nuevo descuento global
            iva: parseFloat(payload.iva || 0),
            total: parseFloat(payload.total || 0)
        };

        // Validación básica de seguridad
        // Si Zoho no nos mandó el cliente o no trae artículos, rechazamos la petición
        if (!cotizacion.clienteClave || cotizacion.partidas.length === 0) {
            return res.status(400).json({ error: 'Faltan datos obligatorios (clienteClave o partidas)' });
        }

        // Decidir si es una Inserción (nueva) o una Actualización (sobreescritura)
        let folioGenerado;
        let esActualizacion = false;

        if (payload.folioSae && payload.folioSae.trim().length > 0) {
            // Flujo de Actualización
            folioGenerado = await saeWrite.updateCotizacion(payload.folioSae.trim(), cotizacion);
            esActualizacion = true;
            logger.info(`Cotización actualizada exitosamente en SAE con folio: ${folioGenerado}`);
        } else {
            // Flujo de Inserción
            folioGenerado = await saeWrite.insertCotizacion(cotizacion);
            logger.info(`Cotización creada exitosamente en SAE con folio: ${folioGenerado}`);
        }
        
        // Le contestamos a Zoho CRM con un "OK" (status 200) y le decimos qué folio se afectó
        res.status(200).json({ 
            status: 'success', 
            message: esActualizacion ? 'Cotización actualizada en Aspel SAE correctamente' : 'Cotización insertada en Aspel SAE correctamente',
            folio: folioGenerado 
        });

    } catch (error) {
        // Si algo explotó (ej. error de base de datos), guardamos el error y le avisamos a Zoho
        logger.error(`Error procesando webhook de cotización: ${error.message}`);
        
        // Si el error es una validación de negocio (cotización enlazada), enviar 400 en vez de 500
        const statusCode = error.message.includes('no se puede modificar') ? 400 : 500;
        
        res.status(statusCode).json({ 
            status: 'error', 
            error: error.message 
        });
    }
});

// POST /webhook/convertir-pedido
// Recibe un folio de cotización y lo transforma en pedido
router.post('/convertir-pedido', async (req, res) => {
    try {
        const payload = req.body;
        logger.info(`Petición para convertir cotización a pedido: ${JSON.stringify(payload)}`);

        const cveCotizacion = payload.cotizacionFolio; // Ej: 'C-QR-026433'
        const sucursal = payload.sucursal; 
        
        if (!cveCotizacion) {
            return res.status(400).json({ error: 'Falta cotizacionFolio' });
        }

        let serieSeleccionada = 'P-QR-';
        
        // Auto-detectar si es un pedido de Equipos basándose en el folio de la cotización
        if (cveCotizacion.startsWith('C-EQ')) serieSeleccionada = 'P-EQ';
        else if (cveCotizacion.startsWith('C-EX')) serieSeleccionada = 'P-EX';
        else if (cveCotizacion.startsWith('C-ES')) serieSeleccionada = 'P-ES';
        else if (cveCotizacion.startsWith('C-EH')) serieSeleccionada = 'P-EH';
        else {
            const sucursalMap = {
                'Querétaro': 'P-QR-',
                'Xalapa': 'P-XA-',
                'San Luis Potosí': 'P-SL-',
                'SLP': 'P-SL-',
                'Huasteca': 'P-HT-'
            };
            serieSeleccionada = sucursal ? sucursalMap[sucursal] || 'P-QR-' : 'P-QR-';
        }

        const pedidoFolio = await saeWrite.convertirCotizacionAPedido(cveCotizacion, serieSeleccionada);
        
        logger.info(`Cotización ${cveCotizacion} convertida exitosamente al pedido: ${pedidoFolio}`);
        
        res.status(200).json({ 
            status: 'success', 
            message: 'Cotización convertida a Pedido en SAE correctamente',
            pedidoFolio: pedidoFolio 
        });
    } catch (error) {
        logger.error(`Error convirtiendo cotización a pedido: ${error.message}`);
        res.status(500).json({ 
            status: 'error', 
            error: error.message 
        });
    }
});

// GET /webhook/lotes/:cveArt
// Devuelve una lista formateada en texto de todos los lotes comerciales de un producto
router.get('/lotes/:cveArt', async (req, res) => {
    try {
        const cveArt = req.params.cveArt.trim();
        logger.info(`Consulta en vivo de lotes para el producto: ${cveArt}`);

        // Consultar el nombre del producto en INVE15
        const prodQuery = "SELECT TRIM(DESCR) as DESCR, CON_LOTE FROM INVE15 WHERE TRIM(CVE_ART) = ?";
        const prods = await db.query(prodQuery, [cveArt]);
        
        if (!prods || prods.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Producto no encontrado en Aspel SAE.'
            });
        }

        const descr = prods[0].DESCR;
        const conLote = prods[0].CON_LOTE;

        if (conLote !== 'S') {
            return res.status(200).json({
                status: 'success',
                texto: `ℹ️ INFORMACIÓN DE PRODUCTO\nProducto: ${descr} (${cveArt})\n\nEste producto no está configurado para manejo de lotes ni pedimentos en Aspel SAE.`
            });
        }

        // Consultar lotes activos en almacenes comerciales (1, 2, 3, 4, 14)
        const lotesQuery = `
            SELECT TRIM(LOTE) as LOTE, FCHCADUC, CANTIDAD, CVE_ALM 
            FROM LTPD15 
            WHERE TRIM(CVE_ART) = ? AND CANTIDAD > 0 AND STATUS = 'A' AND CVE_ALM IN (1, 2, 3, 4, 14)
            ORDER BY FCHCADUC ASC, CVE_ALM ASC`;
        const lotes = await db.query(lotesQuery, [cveArt]);

        const ALMACEN_MAP = {
            1: 'Querétaro',
            2: 'Xalapa',
            3: 'San Luis Potosí',
            4: 'Huasteca',
            14: 'Ciudad de México'
        };

        if (!lotes || lotes.length === 0) {
            return res.status(200).json({
                status: 'success',
                texto: `📦 REPORTES DE LOTES COMERCIALES EN VIVO\nProducto: ${descr} (${cveArt})\n==================================================\n\n⚠️ Actualmente no hay piezas con lote disponible en ninguno de los almacenes comerciales de venta (Querétaro, Xalapa, SLP, Huasteca, CDMX).\n\n(Nota: Si existen piezas en almacén de merma o tránsito, no se muestran aquí para protección comercial).`
            });
        }

        let totalPiezas = 0;
        let lineas = [];
        const hoy = new Date();

        let num = 1;
        for (const lote of lotes) {
            totalPiezas += lote.CANTIDAD;
            const almNombre = ALMACEN_MAP[lote.CVE_ALM] || `Almacén ${lote.CVE_ALM}`;
            
            let fchTexto = 'Sin fecha';
            let alertaCaducado = '';
            if (lote.FCHCADUC) {
                const fecha = new Date(lote.FCHCADUC);
                const dia = String(fecha.getUTCDate()).padStart(2, '0');
                const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
                const anio = fecha.getUTCFullYear();
                fchTexto = `${dia}/${mes}/${anio}`;

                if (fecha < hoy) {
                    alertaCaducado = ' ⚠️[VENCIDO]';
                }
            }

            lineas.push(`[${num}] 🔹 Lote #${lote.LOTE}: ${lote.CANTIDAD} pz (Caduca: ${fchTexto}${alertaCaducado} | Almacén: ${almNombre})`);
            num++;
        }

        const textoFinal = `📦 LOTES COMERCIALES (${cveArt}) ➡️ Total disponible: ${totalPiezas} pieza(s) en ${lotes.length} lote(s)   ║   ${lineas.join('   ║   ')}`;

        res.status(200).json({
            status: 'success',
            cveArt: cveArt,
            totalLotes: lotes.length,
            totalPiezas: totalPiezas,
            texto: textoFinal
        });

    } catch (error) {
        logger.error(`Error en consulta en vivo de lotes: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Error al consultar lotes en Aspel SAE',
            error: error.message
        });
    }
});

// GET /webhook/vista/lotes/:cveArt
// Devuelve una PÁGINA WEB HTML completa con tabla estilizada para abrir en ventana emergente de Zoho
router.get('/vista/lotes/:cveArt', async (req, res) => {
    try {
        const cveArt = req.params.cveArt.trim();
        logger.info(`Vista HTML de lotes para el producto: ${cveArt}`);

        const prodQuery = "SELECT TRIM(DESCR) as DESCR, CON_LOTE FROM INVE15 WHERE TRIM(CVE_ART) = ?";
        const prods = await db.query(prodQuery, [cveArt]);
        
        const descr = prods && prods.length > 0 ? prods[0].DESCR : 'Producto Desconocido';
        const conLote = prods && prods.length > 0 ? prods[0].CON_LOTE : 'N';

        if (conLote !== 'S') {
            return res.send(`
                <!DOCTYPE html>
                <html lang="es">
                <head><meta charset="UTF-8"><title>Sin Lotes</title><style>body{font-family:sans-serif;padding:40px;text-align:center;color:#555;}.card{background:#fff;padding:30px;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.1);max-width:500px;margin:0 auto;}</style></head>
                <body style="background:#f4f6f8;"><div class="card"><h2>ℹ️ Sin Control de Lotes</h2><p>El producto <b>${descr} (${cveArt})</b> no maneja lotes ni caducidades en Aspel SAE.</p></div></body>
                </html>
            `);
        }

        const lotesQuery = `
            SELECT TRIM(LOTE) as LOTE, FCHCADUC, CANTIDAD, CVE_ALM 
            FROM LTPD15 
            WHERE TRIM(CVE_ART) = ? AND CANTIDAD > 0 AND STATUS = 'A' AND CVE_ALM IN (1, 2, 3, 4, 14)
            ORDER BY FCHCADUC ASC, CVE_ALM ASC`;
        const lotes = await db.query(lotesQuery, [cveArt]);

        const ALMACEN_MAP = {
            1: 'Querétaro',
            2: 'Xalapa',
            3: 'San Luis Potosí',
            4: 'Huasteca',
            14: 'Ciudad de México'
        };

        let totalPiezas = 0;
        let filasHtml = '';
        const hoy = new Date();

        if (lotes && lotes.length > 0) {
            let idx = 1;
            for (const lote of lotes) {
                totalPiezas += lote.CANTIDAD;
                const almNombre = ALMACEN_MAP[lote.CVE_ALM] || `Almacén ${lote.CVE_ALM}`;
                
                let fchTexto = 'Sin fecha';
                let estatusBadge = '<span class="badge badge-active">Activo / Vigente</span>';
                
                if (lote.FCHCADUC) {
                    const fecha = new Date(lote.FCHCADUC);
                    const dia = String(fecha.getUTCDate()).padStart(2, '0');
                    const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
                    const anio = fecha.getUTCFullYear();
                    fchTexto = `${dia}/${mes}/${anio}`;

                    if (fecha < hoy) {
                        estatusBadge = '<span class="badge badge-expired">⚠️ Vencido</span>';
                    }
                }

                filasHtml += `
                    <tr>
                        <td style="text-align: center; color: #888; font-weight: bold;">${idx}</td>
                        <td><span class="lote-code">${lote.LOTE}</span></td>
                        <td><b>${almNombre}</b> <span style="color:#888; font-size:12px;">(#${lote.CVE_ALM})</span></td>
                        <td>${fchTexto}</td>
                        <td style="font-size: 16px; font-weight: bold; color: #2d3748;">${lote.CANTIDAD} <span style="font-size:12px; font-weight:normal; color:#718096;">pz</span></td>
                        <td>${estatusBadge}</td>
                    </tr>
                `;
                idx++;
            }
        } else {
            filasHtml = `<tr><td colspan="6" style="text-align:center; padding: 30px; color: #888;">No hay existencias activas en almacenes comerciales.</td></tr>`;
        }

        const htmlPage = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Lotes - ${cveArt}</title>
            <style>
                body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; background: #f0f2f5; margin: 0; padding: 25px; color: #333; }
                .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); overflow: hidden; }
                .header { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: #fff; padding: 25px 30px; display: flex; justify-content: space-between; align-items: center; }
                .header-info h1 { margin: 0; font-size: 22px; font-weight: 600; }
                .header-info p { margin: 6px 0 0 0; opacity: 0.9; font-size: 14px; }
                .total-box { background: rgba(255,255,255,0.15); padding: 12px 20px; border-radius: 8px; text-align: right; backdrop-filter: blur(5px); border: 1px solid rgba(255,255,255,0.2); }
                .total-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9; }
                .total-num { font-size: 26px; font-weight: 700; margin-top: 2px; }
                .table-container { padding: 20px 30px 30px; overflow-x: auto; }
                table { width: 100%; border-collapse: collapse; text-align: left; }
                th { background: #f8fafc; padding: 14px 16px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
                td { padding: 16px; border-bottom: 1px solid #edf2f7; font-size: 14px; color: #334155; }
                tr:hover { background: #f8fafc; }
                .badge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
                .badge-active { background: #dcfce7; color: #15803d; }
                .badge-expired { background: #fee2e2; color: #b91c1c; }
                .lote-code { font-family: 'Consolas', monospace; font-weight: 700; color: #0369a1; background: #e0f2fe; padding: 4px 10px; border-radius: 6px; font-size: 14px; }
                .footer { background: #f8fafc; padding: 15px 30px; border-top: 1px solid #e2e8f0; text-align: right; font-size: 12px; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-info">
                        <h1>📦 Reporte de Lotes y Caducidades</h1>
                        <p><b>Producto:</b> ${descr} (${cveArt})</p>
                    </div>
                    <div class="total-box">
                        <div class="total-label">Total Disponible Venta</div>
                        <div class="total-num">${totalPiezas} <span style="font-size:14px; font-weight:normal;">piezas</span></div>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align: center;">#</th>
                                <th>Número de Lote</th>
                                <th>Almacén Físico</th>
                                <th>Fecha de Caducidad</th>
                                <th>Existencia</th>
                                <th>Estatus</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filasHtml}
                        </tbody>
                    </table>
                </div>
                <div class="footer">
                    Consulta en tiempo real a Aspel SAE • Sincronizado por Zoho-SAE Middleware
                </div>
            </div>
        </body>
        </html>
        `;

        res.send(htmlPage);

    } catch (error) {
        logger.error(`Error en vista HTML de lotes: ${error.message}`);
        res.status(500).send(`<h3>Error al consultar lotes: ${error.message}</h3>`);
    }
});

module.exports = router;

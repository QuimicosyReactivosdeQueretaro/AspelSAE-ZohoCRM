require('dotenv').config();
const express = require('express');
const logger = require('./utils/logger');
const db = require('./config/database');
const cron = require('node-cron');
const syncFacturas = require('./scripts/syncFacturas');

/**
 * ============================================================================
 * ARCHIVO: src/index.js (EL SERVIDOR WEB / LA VÍA DE BAJADA)
 * ============================================================================
 * ¿Para qué sirve?
 * Este es el archivo principal que levanta el "Servidor de Escucha" en tu computadora.
 * Se queda esperando todo el día en el puerto 3001 a que Zoho CRM (a través del túnel)
 * le envíe información, como cuando un vendedor hace una nueva cotización.
 * ============================================================================
 */

const app = express();
// Permite que nuestro servidor entienda los datos en formato JSON que envía Zoho
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Definimos el "puerto" por el cual vamos a escuchar. Usamos el 3001.
const PORT = process.env.PORT || 3001;

/**
 * RUTA DE SALUD (Health Check)
 * Es como un termómetro. Si escribes http://localhost:3001/health en tu navegador,
 * el servidor te responde si está vivo y si logró conectarse a la base de datos Firebird (SAE).
 */
app.get('/health', async (req, res) => {
    try {
        // Verificar conexión a DB mandando una consulta súper básica
        const result = await db.query("SELECT 1 AS OK FROM RDB$DATABASE");
        res.json({ 
            status: 'success', 
            message: 'El servidor está corriendo', 
            database: result && result.length > 0 ? 'Conectado' : 'Error',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Error de conexión a la base de datos',
            error: error.message
        });
    }
});

/**
 * REGISTRO DE RUTAS PRINCIPALES (Los "caminos" de entrada)
 * Aquí le decimos al servidor: "Si alguien llama a la puerta '/webhook', 
 * manda ese paquete de datos a que lo procese el archivo routes/webhook.js"
 */
app.use('/webhook', require('./routes/webhook'));
// app.use('/sync', require('./routes/sync'));

/**
 * INICIAR EL SERVIDOR
 * Aquí es donde realmente se "prende" la máquina y empieza a escuchar por el puerto 3001.
 */
app.listen(PORT, () => {
    logger.info(`Servidor Middleware Zoho-SAE iniciado en el puerto ${PORT}`);
    logger.info(`Entorno: ${process.env.NODE_ENV}`);
    logger.info(`Base de Datos Configurada: ${process.env.SAE_DB_PATH}`);
});

/**
 * TAREAS PROGRAMADAS (Cron Jobs)
 * Aquí configuramos que el bot revise las facturas cada 30 minutos de forma automática.
 */
cron.schedule('*/30 * * * *', async () => {
    logger.info('Ejecutando tarea programada: syncFacturas...');
    await syncFacturas.run();
});
logger.info('Cron job de sincronización de facturas configurado para correr cada 30 minutos.');

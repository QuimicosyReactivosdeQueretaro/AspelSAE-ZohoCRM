const Firebird = require('node-firebird');
const logger = require('../utils/logger');
require('dotenv').config();

const fbOptions = {
    host: process.env.SAE_DB_HOST || '127.0.0.1',
    port: parseInt(process.env.SAE_DB_PORT || '3050'),
    database: process.env.SAE_DB_PATH,
    user: process.env.SAE_DB_USER || 'SYSDBA',
    password: process.env.SAE_DB_PASS || 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
    retryConnectionInterval: 1000,
    charset: 'WIN1252'
};

// Crear pool de conexiones para mejor rendimiento y manejo de concurrencia (máximo 5 conexiones simultáneas)
const pool = Firebird.pool(5, fbOptions);

/**
 * Ejecuta una consulta SQL genérica en el pool de conexiones
 * @param {string} sql Consulta SQL
 * @param {Array} params Parámetros para la consulta
 * @returns {Promise<Array>} Resultados de la consulta
 */
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        pool.get((err, db) => {
            if (err) {
                logger.error(`Error al obtener conexión del pool: ${err.message}`);
                return reject(err);
            }
            db.query(sql, params, (err, result) => {
                db.detach(); // Siempre liberar la conexión
                if (err) {
                    logger.error(`Error en consulta SQL: ${err.message}\nSQL: ${sql}\nParams: ${JSON.stringify(params)}`);
                    return reject(err);
                }
                resolve(result);
            });
        });
    });
};

/**
 * Obtiene una conexión directa del pool para transacciones
 * @returns {Promise<Object>} Instancia de base de datos
 */
const getConnection = () => {
    return new Promise((resolve, reject) => {
        pool.get((err, db) => {
            if (err) {
                logger.error(`Error al obtener conexión del pool para transacción: ${err.message}`);
                return reject(err);
            }
            resolve(db);
        });
    });
};

module.exports = {
    pool,
    query,
    getConnection
};

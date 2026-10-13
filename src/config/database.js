const Firebird = require('node-firebird');
const logger = require('../utils/logger');
require('dotenv').config();

// Número de empresa activa de Aspel SAE (por defecto '15')
const EMPRESA = (process.env.SAE_EMPRESA || '15').trim();

// Ajustar dinámicamente la ruta de la base de datos si difiere de la empresa configurada
let rawDbPath = process.env.SAE_DB_PATH || '';
if (rawDbPath) {
    rawDbPath = rawDbPath
        .replace(/Empresa\d+/gi, `Empresa${EMPRESA}`)
        .replace(/EMPRE\d+\.FDB/gi, `EMPRE${EMPRESA}.FDB`);
}

const fbOptions = {
    host: process.env.SAE_DB_HOST || '127.0.0.1',
    port: parseInt(process.env.SAE_DB_PORT || '3050'),
    database: rawDbPath,
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
 * Helper dinámico para nombres de tablas de SAE según la empresa configurada.
 * Ejemplos:
 * T('FACTC') => 'FACTC15' (o 'FACTC16')
 * T.FACTC    => 'FACTC15' (o 'FACTC16')
 * T.EMPRESA  => '15'
 */
const T = new Proxy(
    (name) => `${name}${EMPRESA}`,
    {
        get: (target, prop) => {
            if (prop === 'EMPRESA') return EMPRESA;
            if (typeof prop === 'string') return `${prop}${EMPRESA}`;
            return target[prop];
        }
    }
);

/**
 * Resuelve nombres de tablas que pudieran haber quedado fijos con sufijo 15.
 * Si EMPRESA es 15, no altera la consulta. Si es 16 (u otra), reemplaza el sufijo 15 por la empresa activa.
 */
const resolveSql = (sql) => {
    if (typeof sql !== 'string' || EMPRESA === '15') return sql;
    return sql.replace(/\b(FACT[CPFR]|PAR_FACT[CPFR]|PAR_FACTP_CLIB|FACTP_CLIB|CLIE|INVE|IMPU|TBLCONTROL|BITA|PRECIO_X_PROD|OBS_DOCF|INFENVIO|DOCTOSIGF|MULT|LTPD|VEND|CLIN|FOLIOSF|KITS)15\b/g, `$1${EMPRESA}`);
};

/**
 * Ejecuta una consulta SQL genérica en el pool de conexiones
 * @param {string} sql Consulta SQL
 * @param {Array} params Parámetros para la consulta
 * @returns {Promise<Array>} Resultados de la consulta
 */
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        const finalSql = resolveSql(sql);
        pool.get((err, db) => {
            if (err) {
                logger.error(`Error al obtener conexión del pool: ${err.message}`);
                return reject(err);
            }
            db.query(finalSql, params, (err, result) => {
                db.detach(); // Siempre liberar la conexión
                if (err) {
                    logger.error(`Error en consulta SQL: ${err.message}\nSQL: ${finalSql}\nParams: ${JSON.stringify(params)}`);
                    return reject(err);
                }
                resolve(result);
            });
        });
    });
};

/**
 * Obtiene una conexión directa del pool para transacciones
 * @returns {Promise<Object>} Instancia de base de datos con soporte transparente para transacciones
 */
const getConnection = () => {
    return new Promise((resolve, reject) => {
        pool.get((err, db) => {
            if (err) {
                logger.error(`Error al obtener conexión del pool para transacción: ${err.message}`);
                return reject(err);
            }
            // Envolver db.transaction para interceptar transaction.query con resolveSql
            const originalTransaction = db.transaction.bind(db);
            db.transaction = function(isolation, callback) {
                return originalTransaction(isolation, (err, tr) => {
                    if (err || !tr) return callback(err, tr);
                    const originalTrQuery = tr.query.bind(tr);
                    tr.query = function(sql, params, cb) {
                        const finalSql = resolveSql(sql);
                        return originalTrQuery(finalSql, params, cb);
                    };
                    return callback(null, tr);
                });
            };
            resolve(db);
        });
    });
};

module.exports = {
    pool,
    query,
    getConnection,
    T,
    EMPRESA,
    dbPath: rawDbPath
};

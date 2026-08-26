const zohoAuth = require('../src/services/zohoAuth');
const logger = require('../src/utils/logger');

async function testAuth() {
    try {
        logger.info('Iniciando prueba de autenticación con Zoho CRM...');
        const token = await zohoAuth.getAccessToken();
        logger.info(`¡Autenticación exitosa! Access Token obtenido (primeros 10 caracteres): ${token.substring(0, 10)}...`);
        console.log("OK");
    } catch (error) {
        logger.error(`Falló la autenticación: ${error.message}`);
        console.log("FAIL");
    }
}

testAuth();

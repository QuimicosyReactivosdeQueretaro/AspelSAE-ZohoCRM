const axios = require('axios');
const zohoAuth = require('./zohoAuth');
const logger = require('../utils/logger');

/**
 * ============================================================================
 * ARCHIVO: src/services/zohoApi.js (EL BRAZO DERECHO)
 * ============================================================================
 * ¿Para qué sirve?
 * Este archivo es el único autorizado para hablar con Zoho CRM. 
 * Actúa como un "mensajero". Toma los datos que sacamos de Aspel SAE, los empaca
 * y se los envía por internet a Zoho usando sus reglas (API REST).
 * ============================================================================
 */

const ZOHO_API_BASE = 'https://www.zohoapis.com/crm/v6';

class ZohoApiService {
    
    /**
     * Realiza una petición genérica al API de Zoho CRM
     */
    async _request(method, endpoint, data = null) {
        const token = await zohoAuth.getAccessToken();
        
        const config = {
            method,
            url: `${ZOHO_API_BASE}${endpoint}`,
            headers: {
                'Authorization': `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            config.data = data;
        }

        try {
            const response = await axios(config);
            return response.data;
        } catch (error) {
            let errorMsg = error.message;
            if (error.response && error.response.data) {
                errorMsg = JSON.stringify(error.response.data);
            }
            logger.error(`Error en API Zoho (${method} ${endpoint}): ${errorMsg}`);
            throw new Error(`Zoho API Error: ${errorMsg}`);
        }
    }

    /**
     * Sincroniza (Upsert) un lote de clientes hacia Zoho Contacts.
     * Utiliza el campo Clave_Sae para evitar duplicados.
     * @param {Array} clientes Array de objetos cliente mapeados para Zoho
     */
    async upsertContacts(clientes) {
        if (!clientes || clientes.length === 0) return null;

        const payload = {
            data: clientes,
            duplicate_check_fields: ["Clave_Sae"]
        };

        return await this._request('POST', '/Contacts/upsert', payload);
    }

    /**
     * Sincroniza (Upsert) un lote de productos hacia Zoho Products.
     * Utiliza el campo Codigo_SAE para evitar duplicados.
     * @param {Array} productos Array de objetos producto mapeados para Zoho
     */
    async upsertProducts(productos) {
        if (!productos || productos.length === 0) return null;

        const payload = {
            data: productos,
            duplicate_check_fields: ["Product_Code"]
        };

        return await this._request('POST', '/Products/upsert', payload);
    }
}

module.exports = new ZohoApiService();

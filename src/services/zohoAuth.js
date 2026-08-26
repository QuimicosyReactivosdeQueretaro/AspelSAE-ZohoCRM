const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
require('dotenv').config();

// Almacén temporal de tokens (idealmente debería ser en base de datos o Redis, 
// pero para este middleware un archivo JSON o variable en memoria es suficiente)
const TOKEN_FILE = path.join(__dirname, '../../config/zoho_tokens.json');

class ZohoAuthService {
    constructor() {
        this.clientId = process.env.ZOHO_CLIENT_ID;
        this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
        this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
        
        // El datacenter puede variar (.com, .eu, .in). Asumimos .com por defecto
        this.accountsUrl = 'https://accounts.zoho.com/oauth/v2/token';
        this.accessToken = null;
        this.expiresAt = null;

        this._loadTokens();
    }

    /**
     * Carga el token temporal desde archivo si existe
     */
    _loadTokens() {
        try {
            if (fs.existsSync(TOKEN_FILE)) {
                const data = fs.readFileSync(TOKEN_FILE, 'utf8');
                const tokens = JSON.parse(data);
                this.accessToken = tokens.access_token;
                this.expiresAt = tokens.expires_at;
            }
        } catch (error) {
            logger.warn('No se pudo cargar el token guardado. Se generará uno nuevo.');
        }
    }

    /**
     * Guarda el token en archivo para no pedir uno nuevo en cada reinicio
     */
    _saveTokens() {
        try {
            // Asegurar que el directorio exista
            const dir = path.dirname(TOKEN_FILE);
            if (!fs.existsSync(dir)){
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(TOKEN_FILE, JSON.stringify({
                access_token: this.accessToken,
                expires_at: this.expiresAt
            }));
        } catch (error) {
            logger.error(`Error guardando tokens: ${error.message}`);
        }
    }

    /**
     * Obtiene un Access Token válido. Si el actual expiró, pide uno nuevo usando el Refresh Token.
     * @returns {Promise<string>} Access Token
     */
    async getAccessToken() {
        if (!this.clientId || !this.clientSecret || !this.refreshToken) {
            throw new Error('Faltan credenciales de Zoho en el archivo .env (CLIENT_ID, CLIENT_SECRET o REFRESH_TOKEN)');
        }

        const now = Date.now();
        // Si tenemos un token válido (damos 5 minutos de margen), lo retornamos
        if (this.accessToken && this.expiresAt && now < (this.expiresAt - 300000)) {
            return this.accessToken;
        }

        logger.info('Access Token de Zoho expirado o no existe. Solicitando uno nuevo...');
        
        try {
            const response = await axios.post(this.accountsUrl, null, {
                params: {
                    refresh_token: this.refreshToken,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'refresh_token'
                }
            });

            if (response.data.error) {
                throw new Error(response.data.error);
            }

            this.accessToken = response.data.access_token;
            // expires_in viene en segundos, usualmente 3600 (1 hora)
            this.expiresAt = now + (response.data.expires_in * 1000);
            
            this._saveTokens();
            
            logger.info('Nuevo Access Token de Zoho obtenido exitosamente.');
            return this.accessToken;

        } catch (error) {
            logger.error(`Error al actualizar token de Zoho: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
            throw error;
        }
    }
}

module.exports = new ZohoAuthService();

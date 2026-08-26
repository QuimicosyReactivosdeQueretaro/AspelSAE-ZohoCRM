const axios = require('axios');

async function testWebhook() {
    console.log("Simulando petición de Zoho CRM...");
    
    // JSON simulando lo que enviará Zoho Deluge Script
    const payload = {
        clienteClave: "1363", // Ej. Cliente válido en la BD
        vendedorClave: "1",
        subtotal: 1000.00,
        iva: 160.00,
        total: 1160.00,
        partidas: [
            {
                cveArt: "SPIN 1700002",
                cantidad: 2,
                precio: 500.00,
                tasaIva: 16
            }
        ]
    };

    try {
        const response = await axios.post('http://localhost:3001/webhook/cotizacion', payload);
        console.log("Respuesta del servidor:");
        console.log(response.data);
    } catch (error) {
        console.error("Error al golpear el webhook:", error.response ? error.response.data : error.message);
    }
}

testWebhook();

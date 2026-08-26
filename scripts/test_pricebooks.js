const zohoApi = require('../src/services/zohoApi');

async function testPriceBooks() {
    try {
        console.log("=== CREANDO PRICE BOOK DE PRUEBA ===");
        const pbPayload = {
            data: [
                {
                    Price_Book_Name: "Lista Prueba API",
                    Active: true,
                    Pricing_Model: "None",
                    Pricing_Details: [
                        {
                            "from_range": 1,
                            "to_range": 999999999,
                            "discount": 0
                        }
                    ]
                }
            ]
        };
        const pbRes = await zohoApi._request('POST', '/Price_Books', pbPayload);
        console.log("Respuesta creación Price Book:", JSON.stringify(pbRes, null, 2));
        
        let pbId = null;
        if (pbRes && pbRes.data && pbRes.data[0].details) {
            pbId = pbRes.data[0].details.id;
        }
        if (!pbId) {
            console.log("No se pudo obtener el ID del Price Book, buscando...");
            const pbList = await zohoApi._request('GET', '/Price_Books');
            pbId = pbList.data[0].id;
        }
        console.log("Price Book ID:", pbId);

        console.log("\n=== VINCULANDO MULTIPLES PRODUCTOS A PRICE BOOK ===");
        const prodList = await zohoApi._request('GET', '/Products?fields=id&page=1&per_page=3');
        const prods = prodList.data;
        console.log("Product IDs:", prods.map(p => p.id));

        const relPayload = {
            data: prods.map((p, i) => ({
                id: p.id,
                list_price: 10.50 + i
            }))
        };
        
        const relRes = await zohoApi._request('PUT', `/Price_Books/${pbId}/Products`, relPayload);
        console.log("Respuesta vinculación masiva:", JSON.stringify(relRes, null, 2));

    } catch (error) {
        console.error("Error en prueba:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
}
testPriceBooks();

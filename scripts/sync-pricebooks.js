require('dotenv').config();
const db = require('../src/config/database');
const zohoApi = require('../src/services/zohoApi');
const logger = require('../src/utils/logger');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllZohoProducts() {
    let allProducts = [];
    let hasMore = true;
    let pageToken = null;

    while (hasMore) {
        try {
            logger.info(`Fetching Zoho Products (pageToken: ${pageToken || 'start'})...`);
            let url = '/Products?fields=id,Product_Code';
            if (pageToken) {
                url += `&page_token=${pageToken}`;
            }
            const res = await zohoApi._request('GET', url);
            if (res && res.data) {
                allProducts = allProducts.concat(res.data);
                hasMore = res.info.more_records;
                pageToken = res.info.next_page_token;
                await sleep(500); // rate limit protection
            } else {
                hasMore = false;
            }
        } catch (err) {
            if (err.message.includes('NO_CONTENT')) {
                hasMore = false;
            } else {
                throw err;
            }
        }
    }
    
    // Create a map of Product_Code -> id
    const prodMap = {};
    allProducts.forEach(p => {
        if (p.Product_Code) {
            prodMap[p.Product_Code.trim()] = p.id;
        }
    });
    return prodMap;
}

async function syncPriceBooks() {
    try {
        logger.info("=== INICIANDO MIGRACIÓN DE LISTAS DE PRECIOS ===");

        // 1. Fetch Price Lists from SAE
        logger.info("1. Consultando listas de precios en SAE (PRECIOS16)...");
        const precios16 = await db.query("SELECT CVE_PRECIO, DESCRIPCION FROM PRECIOS16 WHERE CVE_PRECIO = 1 OR (CVE_PRECIO >= 20 AND CVE_PRECIO <= 49)");
        logger.info(`Se encontraron ${precios16.length} listas de precios relevantes en SAE.`);

        // 2. Fetch existing Price Books from Zoho
        logger.info("2. Consultando Price Books existentes en Zoho CRM...");
        let zohoPriceBooks = [];
        try {
            const pbRes = await zohoApi._request('GET', '/Price_Books?fields=id,Price_Book_Name');
            zohoPriceBooks = pbRes.data || [];
        } catch (e) {
            if (!e.message.includes('NO_CONTENT')) throw e;
        }
        
        const zohoPbMap = {}; // name -> id
        zohoPriceBooks.forEach(pb => {
            zohoPbMap[pb.Price_Book_Name.trim()] = pb.id;
        });

        const listIdToZohoPbId = {}; // SAE CVE_PRECIO -> Zoho Price_Book ID

        // 3. Create missing Price Books in Zoho
        logger.info("3. Creando/Mapeando Price Books en Zoho CRM...");
        for (const lista of precios16) {
            const nombre = lista.DESCRIPCION ? lista.DESCRIPCION.trim() : `Lista ${lista.CVE_PRECIO}`;
            if (zohoPbMap[nombre]) {
                listIdToZohoPbId[lista.CVE_PRECIO] = zohoPbMap[nombre];
            } else {
                logger.info(`Creando Price Book en Zoho: ${nombre}`);
                const pbPayload = {
                    data: [{
                        Price_Book_Name: nombre,
                        Active: true,
                        Pricing_Model: "None",
                        Pricing_Details: [{
                            "from_range": 1,
                            "to_range": 999999999,
                            "discount": 0
                        }]
                    }]
                };
                const createRes = await zohoApi._request('POST', '/Price_Books', pbPayload);
                if (createRes && createRes.data && createRes.data[0].details) {
                    listIdToZohoPbId[lista.CVE_PRECIO] = createRes.data[0].details.id;
                    zohoPbMap[nombre] = createRes.data[0].details.id;
                }
                await sleep(500);
            }
        }

        // 4. Get all products from Zoho to map CVE_ART -> zoho_id
        logger.info("4. Obteniendo mapa de productos desde Zoho...");
        const productMap = await getAllZohoProducts();
        logger.info(`Se obtuvieron ${Object.keys(productMap).length} productos de Zoho.`);

        // 5. Fetch PRECIO_X_PROD16 from SAE
        logger.info("5. Consultando precios por producto en SAE (PRECIO_X_PROD16)...");
        const preciosXProd = await db.query("SELECT CVE_ART, CVE_PRECIO, PRECIO FROM PRECIO_X_PROD16 WHERE CVE_PRECIO = 1 OR (CVE_PRECIO >= 20 AND CVE_PRECIO <= 49)");
        logger.info(`Se encontraron ${preciosXProd.length} precios cruzados en SAE.`);

        // 6. Group by Price List and sync to Zoho
        logger.info("6. Vinculando precios a los Price Books en Zoho CRM...");
        
        for (const lista of precios16) {
            const pbId = listIdToZohoPbId[lista.CVE_PRECIO];
            if (!pbId) {
                logger.warn(`Saltando lista ${lista.CVE_PRECIO} porque no tiene ID en Zoho.`);
                continue;
            }

            const preciosLista = preciosXProd.filter(p => p.CVE_PRECIO === lista.CVE_PRECIO);
            if (preciosLista.length === 0) continue;

            logger.info(`Procesando lista ${lista.CVE_PRECIO} (${preciosLista.length} productos)...`);

            // Mapear a formato de Zoho
            const payloadData = [];
            for (const p of preciosLista) {
                const cveArt = p.CVE_ART.trim();
                const zohoProdId = productMap[cveArt];
                
                if (zohoProdId) {
                    let finalPrice = parseFloat(p.PRECIO) || 0;
                    
                    // Si el precio es 0, buscar el precio de la Lista 1 (Precio Público)
                    if (finalPrice === 0) {
                        const fallback = preciosXProd.find(p1 => p1.CVE_PRECIO === 1 && p1.CVE_ART.trim() === cveArt);
                        if (fallback && parseFloat(fallback.PRECIO) > 0) {
                            finalPrice = parseFloat(fallback.PRECIO);
                        }
                    }

                    payloadData.push({
                        id: zohoProdId,
                        list_price: finalPrice
                    });
                }
            }

            logger.info(`  -> ${payloadData.length} productos encontrados en Zoho para vincular.`);

            // Chunk by 100 to avoid API limits on related lists
            const CHUNK_SIZE = 100;
            for (let i = 0; i < payloadData.length; i += CHUNK_SIZE) {
                const chunk = payloadData.slice(i, i + CHUNK_SIZE);
                try {
                    await zohoApi._request('PUT', `/Price_Books/${pbId}/Products`, { data: chunk });
                    logger.info(`  -> Lote de ${chunk.length} precios vinculados correctamente.`);
                } catch (e) {
                    logger.error(`  -> Error vinculando lote: ${e.message}`);
                }
                await sleep(500); // Rate limit protection
            }
        }

        logger.info("=== MIGRACIÓN DE LISTAS DE PRECIOS COMPLETADA ===");
    } catch (error) {
        logger.error("Error crítico en la migración:", error);
    } finally {
        process.exit();
    }
}

syncPriceBooks();

const saeRead = require("./src/services/saeRead");
async function run() {
    console.log("Probando búsqueda de producto...");
    const p = await saeRead.getProducto("MIND 105-005917");
    console.log(p ? "Encontrado:" + p.CVE_ART : "NO ENCONTRADO");
    process.exit(0);
}
run().catch(console.error);

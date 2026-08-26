const saeRead = require('./src/services/saeRead');

async function testQuery() {
    try {
        const client = await saeRead.getCliente('2040');
        console.log("Client 2040:", client);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testQuery();

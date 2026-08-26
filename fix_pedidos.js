const db = require('./src/config/database');

async function run() {
    const query = "UPDATE FACTP15 SET ENLAZADO = 'O' WHERE ENLAZADO = 'T' AND DOC_SIG IS NULL AND TIP_DOC_SIG = 'O'";
    try {
        await db.query(query);
        console.log('Fixed database ENLAZADO flags.');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();

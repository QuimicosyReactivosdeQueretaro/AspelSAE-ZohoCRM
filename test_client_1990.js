const saeDb = require("./src/config/database");
async function run() {
    try {
        const query = `SELECT TRIM(CLAVE) as CLAVE, TRIM(NOMBRE) as NOMBRE, TRIM(TELEFONO) as TELEFONO, TRIM(EMAILPRED) as EMAIL, STATUS FROM CLIE15 WHERE TRIM(CLAVE) = '1990'`;
        const result = await saeDb.query(query);
        console.table(result);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();

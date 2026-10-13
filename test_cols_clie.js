const saeDb = require("./src/config/database");
async function run() {
    const cols = await saeDb.query("SELECT * FROM CLIE15 ROWS 1");
    console.log(Object.keys(cols[0]));
    process.exit(0);
}
run().catch(console.error);

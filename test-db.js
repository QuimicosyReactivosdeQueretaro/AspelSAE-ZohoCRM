const db = require('./src/config/database'); 
async function test() { 
    try { 
        const inve = await db.query("SELECT EXIST FROM INVE16 WHERE TRIM(CVE_ART) = 'ACQU 22'"); 
        console.log('INVE16 EXIST:', inve); 
        const mult = await db.query("SELECT CVE_ALM, EXIST FROM MULT16 WHERE TRIM(CVE_ART) = 'ACQU 22'"); 
        console.log('MULT16:', mult); 
    } catch(e) { 
        console.error(e); 
    } finally { 
        process.exit(); 
    } 
} 
test();

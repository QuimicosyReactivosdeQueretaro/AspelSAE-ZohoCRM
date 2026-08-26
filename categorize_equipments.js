const db = require('./src/config/database');
async function run() {
    const query = "SELECT CVE_ART, DESCR FROM INVE15 WHERE DESCR LIKE '%ANALIZADOR%' OR DESCR LIKE '%EQUIPO%'";
    const result = await db.query(query);
    
    const marcas = {};
    
    for (let row of result) {
        let name = row.DESCR.trim().replace(/\r\n/g, '');
        let marca = 'Otros';
        
        const upper = name.toUpperCase();
        if (upper.includes('MINDRAY') || upper.includes('MIND') || upper.includes('BS-') || upper.includes('BC-') || upper.includes('CL-1000')) marca = 'Mindray';
        else if (upper.includes('SPINLAB') || upper.includes('SPIN') || upper.includes('SPINREACT')) marca = 'Spinreact';
        else if (upper.includes('MAGLUMI')) marca = 'Snibe (Maglumi)';
        else if (upper.includes('LIFO') || upper.includes('LIFOTRONIC') || upper.includes('AC 630') || upper.includes('AC 610') || upper.includes('AC 310') || upper.includes('H8')) marca = 'Lifotronic';
        else if (upper.includes('SIEMENS') || upper.includes('CLINITEK') || upper.includes('FLEXOR')) marca = 'Siemens';
        else if (upper.includes('WOND')) marca = 'Wondfo';
        else if (upper.includes('PREC') || upper.includes('XM60') || upper.includes('XM50')) marca = 'Precisa';
        else if (upper.includes('BAYER')) marca = 'Bayer';
        else if (upper.includes('I-STAT')) marca = 'Abbott (i-STAT)';
        else if (upper.includes('KEYU')) marca = 'Keyu';
        else if (upper.includes('OPTI')) marca = 'OPTI Medical';
        else if (upper.includes('EPITHOD')) marca = 'Epithod';
        else if (upper.includes('BIOHERMES') || upper.includes('GLICOHEMOGLOBINA')) marca = 'BioHermes';
        
        if (upper.includes('SEMINUEVO') || upper.includes('SEMI-AUTO')) {
           // Skip categorization as SEMINUEVO or group it
        }

        if (!marcas[marca]) marcas[marca] = [];
        marcas[marca].push(name);
    }
    
    console.log(JSON.stringify(marcas, null, 2));
}
run().catch(console.error).finally(()=>process.exit(0));

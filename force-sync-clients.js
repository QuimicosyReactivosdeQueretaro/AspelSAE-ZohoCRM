const db = require('./src/config/database');
const zohoApi = require('./src/services/zohoApi');

async function run() {
    console.log('Obteniendo todos los clientes activos de SAE...');
    const query = "SELECT TRIM(CLAVE) as CLAVE, TRIM(NOMBRE) as NOMBRE, TRIM(RFC) as RFC, TRIM(REG_FISC) as REG_FISC, TRIM(CVE_VEND) as CVE_VEND, TRIM(CALLE) as CALLE, TRIM(NUMINT) as NUMINT, LISTA_PREC, TRIM(NUMEXT) as NUMEXT, TRIM(COLONIA) as COLONIA, TRIM(CODIGO) as CODIGO, TRIM(MUNICIPIO) as MUNICIPIO, TRIM(ESTADO) as ESTADO, TRIM(TELEFONO) as TELEFONO, TRIM(EMAILPRED) as EMAILPRED FROM CLIE15 WHERE STATUS = 'A'";
    
    const clientesSae = await db.query(query);
    console.log('Total de clientes activos en SAE:', clientesSae.length);
    
    let successTotal = 0;
    let errorTotal = 0;
    const limit = 100;
    let offset = 0;
    
    while (offset < clientesSae.length) {
        const batch = clientesSae.slice(offset, offset + limit);
        const zohoContacts = batch.map(c => {
            let cleanedPhone = c.TELEFONO ? c.TELEFONO.replace(/[^0-9+\-]/g, '').substring(0, 30).trim() : '';
            if (!/\d/.test(cleanedPhone)) cleanedPhone = '';
            
            return {
                Last_Name: c.NOMBRE || 'Sin Nombre',
                Clave_Sae: c.CLAVE.trim(),
                RFC_Sae: c.RFC || '',
                Phone: cleanedPhone,
                Email: (c.EMAILPRED && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(c.EMAILPRED.trim())) ? c.EMAILPRED.trim() : '',
                R_gimen_Fiscal_Sae: c.REG_FISC || '',
                Vendedor_Sae: c.CVE_VEND || '',
                Mailing_Street: [c.CALLE, c.NUMEXT, c.NUMINT].filter(Boolean).join(' '),
                Mailing_City: c.MUNICIPIO || '',
                Mailing_State: c.ESTADO || '',
                Mailing_Zip: c.CODIGO || ''
            };
        });
        
        try {
            const response = await zohoApi._request('POST', '/Contacts/upsert', {
                data: zohoContacts,
                duplicate_check_fields: ['Clave_Sae']
            });
            
            if (response && response.data) {
                const successes = response.data.filter(r => r.status === 'success');
                const errors = response.data.filter(r => r.status === 'error');
                
                successTotal += successes.length;
                errorTotal += errors.length;
            }
        } catch (err) {
            console.error('Error enviando lote:', err.message);
        }
        
        offset += limit;
        console.log('Procesados: ' + offset + ' / ' + clientesSae.length);
        
        await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log('\n--- RESUMEN FINAL ---');
    console.log('Total exitos (Nuevos o Actualizados):', successTotal);
    console.log('Total errores de validacion:', errorTotal);
}

run().catch(console.error).finally(()=>process.exit(0));

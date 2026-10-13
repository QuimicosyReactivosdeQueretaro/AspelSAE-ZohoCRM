const saeDb = require('./src/config/database');
const xlsx = require('xlsx');

async function run() {
    try {
        console.log("Extrayendo clientes de Aspel SAE...");
        const query = `SELECT TRIM(CLAVE) as CLAVE, TRIM(NOMBRE) as NOMBRE, TRIM(TELEFONO) as TELEFONO, TRIM(EMAILPRED) as EMAIL, STATUS FROM CLIE15 WHERE TELEFONO IS NOT NULL AND TRIM(TELEFONO) <> ''`;
        const clientes = await saeDb.query(query);
        
        const inconsistentes = [];

        clientes.forEach(c => {
            const tel = c.TELEFONO;
            let motivo = [];
            
            const cleanTel = tel.replace(/[\s\-\(\)\.]/g, '');
            
            if (/[^\d]/.test(cleanTel)) {
                motivo.push("Contiene letras o caracteres raros");
            }
            
            const digits = tel.replace(/[^\d]/g, '');
            
            if (digits.length > 10) {
                motivo.push(`Tiene más de 10 dígitos (${digits.length})`);
            } else if (digits.length > 0 && digits.length < 10) {
                motivo.push(`Tiene menos de 10 dígitos (${digits.length})`);
            }

            // Traducir estatus a algo más legible
            let estatusLegible = c.STATUS;
            if (c.STATUS === 'A') estatusLegible = 'A (Activo)';
            if (c.STATUS === 'S') estatusLegible = 'S (Suspendido)';
            if (c.STATUS === 'B') estatusLegible = 'B (Baja)';
            if (c.STATUS === 'M') estatusLegible = 'M (Moroso)';

            if (motivo.length > 0) {
                inconsistentes.push({
                    "Clave SAE": c.CLAVE,
                    "Nombre de Cliente": c.NOMBRE,
                    "Teléfono Registrado": tel,
                    "Correo Electrónico": c.EMAIL || 'Sin correo',
                    "Estatus": estatusLegible,
                    "Motivo de Inconsistencia": motivo.join(" | ")
                });
            }
        });

        console.log(`Se encontraron ${inconsistentes.length} teléfonos inconsistentes.`);

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(inconsistentes);
        
        const colWidths = [
            { wch: 15 }, // Clave SAE
            { wch: 50 }, // Nombre
            { wch: 25 }, // Telefono
            { wch: 35 }, // Correo
            { wch: 15 }, // Estatus
            { wch: 50 }  // Motivo
        ];
        ws['!cols'] = colWidths;

        xlsx.utils.book_append_sheet(wb, ws, "Telefonos Inconsistentes");
        
        const filePath = "C:\\zoho-sae-middleware\\Clientes_Telefonos_Inconsistentes.xlsx";
        xlsx.writeFile(wb, filePath);
        
        console.log("Excel generado con éxito en: " + filePath);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();

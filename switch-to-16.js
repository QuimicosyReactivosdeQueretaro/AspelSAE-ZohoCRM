const fs = require('fs');

const envFile = 'C:\\Users\\tonyg\\.gemini\\antigravity\\scratch\\zoho-sae-middleware\\.env';
let env = fs.readFileSync(envFile, 'utf8');
env = env.replace('SAE90EMPRE15.FDB', 'SAE90EMPRE16.FDB');
env = env.replace('Empresa15\\\\Datos', 'Empresa16\\\\Datos');
fs.writeFileSync(envFile, env);

const tablesToReplace = ['CLIE15', 'INVE15', 'PRECIO_X_PROD15', 'IMPU15', 'VEND15', 'FACTC15', 'PAR_FACTC15', 'FOLIOSF15', 'TBLCONTROL15', 'INFENVIO15', 'OBS_DOCF15'];

function replaceInFile(file) {
    let content = fs.readFileSync(file, 'utf8');
    tablesToReplace.forEach(t => {
        const t16 = t.replace('15', '16');
        content = content.split(t).join(t16);
    });
    fs.writeFileSync(file, content);
    console.log("Replaced back to 16 in " + file);
}

replaceInFile('C:\\Users\\tonyg\\.gemini\\antigravity\\scratch\\zoho-sae-middleware\\src\\services\\saeRead.js');
replaceInFile('C:\\Users\\tonyg\\.gemini\\antigravity\\scratch\\zoho-sae-middleware\\src\\services\\saeWrite.js');

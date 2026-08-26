const fs = require('fs');

const envFile = 'C:\\Users\\tonyg\\.gemini\\antigravity\\scratch\\zoho-sae-middleware\\.env';
let env = fs.readFileSync(envFile, 'utf8');
env = env.replace('SAE90EMPRE16.FDB', 'SAE90EMPRE15.FDB');
fs.writeFileSync(envFile, env);

const tablesToReplace = ['CLIE16', 'INVE16', 'PRECIO_X_PROD16', 'IMPU16', 'VEND16', 'FACTC16', 'PAR_FACTC16', 'FOLIOSF16', 'TBLCONTROL16', 'INFENVIO16', 'OBS_DOCF16'];

function replaceInFile(file) {
    let content = fs.readFileSync(file, 'utf8');
    tablesToReplace.forEach(t => {
        const t15 = t.replace('16', '15');
        content = content.split(t).join(t15);
    });
    fs.writeFileSync(file, content);
    console.log("Replaced in " + file);
}

replaceInFile('C:\\Users\\tonyg\\.gemini\\antigravity\\scratch\\zoho-sae-middleware\\src\\services\\saeRead.js');
replaceInFile('C:\\Users\\tonyg\\.gemini\\antigravity\\scratch\\zoho-sae-middleware\\src\\services\\saeWrite.js');

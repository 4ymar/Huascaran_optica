const Database = require('better-sqlite3');
const { encryptText } = require('./security/secrets');

const token = process.env.NUBEFACT_TOKEN;
const url = process.env.NUBEFACT_URL;
const modo = process.env.SUNAT_MODO || 'demo';

if (!token || !url) {
    console.error('Faltan variables NUBEFACT_TOKEN y NUBEFACT_URL.');
    console.error('Ejemplo PowerShell: $env:NUBEFACT_TOKEN="..." ; $env:NUBEFACT_URL="https://api.nubefact.com/api/v1/..." ; node setup_sunat.js');
    process.exit(1);
}

if (!/^https:\/\/api\.nubefact\.com\//.test(url)) {
    console.error('NUBEFACT_URL no parece una URL valida de NubeFact.');
    process.exit(1);
}

const db = new Database('./data/inventario.db');
const guardar = db.prepare('INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)');

guardar.run('sunat_activo', '1');
guardar.run('cpe_proveedor', 'nubefact');
guardar.run('sunat_token', encryptText(token));
guardar.run('sunat_url', url);
guardar.run('sunat_modo', modo);

const rows = db.prepare("SELECT clave, valor FROM config WHERE clave IN ('sunat_activo','cpe_proveedor','sunat_url','sunat_modo')").all();
console.table(rows);

db.close();
console.log('Config SUNAT guardada correctamente sin exponer el token.');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function dataDir() {
    return process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, '..', 'data');
}

function secretsPath() {
    return process.env.SECRETS_PATH || path.join(dataDir(), 'secrets.json');
}

function loadSecrets() {
    const file = secretsPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });

    let secrets = {};
    if (fs.existsSync(file)) {
        try {
            secrets = JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch (_) {
            secrets = {};
        }
    }

    let changed = false;
    if (!secrets.installation_secret) {
        secrets.installation_secret = crypto.randomBytes(32).toString('hex');
        changed = true;
    }
    if (!secrets.jwt_secret) {
        secrets.jwt_secret = crypto.randomBytes(48).toString('hex');
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { encoding: 'utf-8', mode: 0o600 });
    }

    return secrets;
}

function getJwtSecret() {
    return loadSecrets().jwt_secret;
}

function encryptionKey(purpose = 'config') {
    const secrets = loadSecrets();
    return crypto
        .createHash('sha256')
        .update(`${purpose}:${secrets.installation_secret}:${process.env.MACHINE_ID || ''}`)
        .digest();
}

function encryptText(value) {
    if (!value) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey('sunat-token'), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptText(value) {
    if (!value) return '';
    if (!String(value).startsWith('enc:v1:')) return value;
    const [, , ivB64, tagB64, dataB64] = String(value).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey('sunat-token'), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
    ]).toString('utf8');
}

function maskSecret(value) {
    const plain = decryptText(value || '');
    if (!plain) return '';
    if (plain.length <= 8) return '********';
    return `${plain.slice(0, 4)}...${plain.slice(-4)}`;
}

module.exports = {
    dataDir,
    secretsPath,
    loadSecrets,
    getJwtSecret,
    encryptText,
    decryptText,
    maskSecret,
};

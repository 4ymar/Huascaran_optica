const fs = require('fs');
const path = require('path');

const isDev = process.env.NODE_ENV !== 'production' && process.env.IS_ELECTRON !== 'true';

const getLogDir = () => {
    if (process.env.DB_PATH) {
        return path.dirname(process.env.DB_PATH);
    }
    return path.join(__dirname, 'data');
};

const getErrorLogPath = () => path.join(getLogDir(), 'app-error.log');
const getAppLogPath = () => process.env.LOG_PATH || path.join(getLogDir(), 'app.log');

// Patrones sensibles para ocultar o sanitizar
const SENSITIVE_KEYS = ['token', 'password', 'clave', 'jwt', 'secret', 'sunat_token', 'authorization', 'bearer'];

function sanitizar(valor) {
    if (!valor) return valor;
    if (typeof valor === 'string') {
        let limpio = valor;
        // Ocultar tokens JWT
        limpio = limpio.replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[TOKEN_JWT_REDACTADO]');
        // Ocultar Bearer tokens
        limpio = limpio.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [TOKEN_REDACTADO]');
        return limpio;
    }
    if (typeof valor === 'object') {
        try {
            const copia = Array.isArray(valor) ? [...valor] : { ...valor };
            for (const k of Object.keys(copia)) {
                const keyLower = k.toLowerCase();
                if (SENSITIVE_KEYS.some(s => keyLower.includes(s))) {
                    copia[k] = '[REDACTADO]';
                } else if (typeof copia[k] === 'object' && copia[k] !== null) {
                    copia[k] = sanitizar(copia[k]);
                }
            }
            return copia;
        } catch (_) {
            return '[Objeto no serializable]';
        }
    }
    return valor;
}

function formatearMensaje(tag, args) {
    const texto = args.map(a => {
        if (a instanceof Error) {
            return a.stack || a.message;
        }
        if (typeof a === 'object') {
            return JSON.stringify(sanitizar(a));
        }
        return sanitizar(String(a));
    }).join(' ');
    return tag ? `[${tag}] ${texto}` : texto;
}

function escribirArchivo(filePath, linea) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(filePath, linea + '\n');
    } catch (_) {}
}

const logger = {
    debug(tag, ...args) {
        if (!isDev) return;
        const msg = formatearMensaje(tag, args);
        const timestamp = new Date().toISOString();
        console.log(`\x1b[36m[${timestamp}] [DEBUG] ${msg}\x1b[0m`);
    },

    info(tag, ...args) {
        const msg = formatearMensaje(tag, args);
        const timestamp = new Date().toISOString();
        const linea = `[${timestamp}] [INFO] ${msg}`;
        if (isDev) {
            console.log(`\x1b[32m${linea}\x1b[0m`);
        }
        escribirArchivo(getAppLogPath(), linea);
    },

    warn(tag, ...args) {
        const msg = formatearMensaje(tag, args);
        const timestamp = new Date().toISOString();
        const linea = `[${timestamp}] [WARN] ${msg}`;
        console.warn(`\x1b[33m${linea}\x1b[0m`);
        escribirArchivo(getAppLogPath(), linea);
    },

    error(tag, ...args) {
        const msg = formatearMensaje(tag, args);
        const timestamp = new Date().toISOString();
        const linea = `[${timestamp}] [ERROR] ${msg}`;
        console.error(`\x1b[31m${linea}\x1b[0m`);
        escribirArchivo(getErrorLogPath(), linea);
        escribirArchivo(getAppLogPath(), linea);
    }
};

module.exports = logger;

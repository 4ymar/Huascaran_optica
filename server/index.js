const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const _t0diag = Date.now();
function _markDiag(label) {
    logger.debug('STARTUP', `${label}: ${Date.now() - _t0diag}ms`);
}
_markDiag('antes de require(bytenode)');
require('bytenode');
_markDiag('despues de require(bytenode)');
const LICENCIA_MOD = fs.existsSync(path.join(__dirname, 'licencia.jsc')) ? './licencia.jsc' : './licencia.js';
const app = express();
const { getMachineId, verificarLicencia } = require(LICENCIA_MOD);
process.env.MACHINE_ID = getMachineId();
const startupStartedAt = Date.now();

const os = require('os');

function startupMark(label) {
    logger.debug('STARTUP', `${label}: ${Date.now() - startupStartedAt}ms`);
}

function lazyRouter(factory) {
    let router;
    return (req, res, next) => {
        try {
            if (!router) router = factory();
            return router(req, res, next);
        } catch (err) {
            return next(err);
        }
    };
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

process.on('uncaughtException', (err) => {
    logger.error('FATAL', 'Excepción no capturada:', err);
});

// ── Verificar licencia al iniciar ──────────────────────────
_markDiag('antes de verificarLicencia()');
const licencia = verificarLicencia();
_markDiag('despues de verificarLicencia()');
if (!licencia.valida) {
    logger.warn('LICENCIA', `SISTEMA BLOQUEADO - ${licencia.motivo}`);
} else {
    logger.info('LICENCIA', 'Licencia activa y validada');
}

const PORT = 3030;
const DB_PATH        = process.env.DB_PATH        || path.join(__dirname, 'data', 'inventario.db');
const BACKUP_DIR     = process.env.BACKUP_DIR     || path.join(__dirname, 'data', 'backups');
const DESCARGAS_DIR  = process.env.DESCARGAS_DIR  || path.join(__dirname, '..', 'descargas');

// ── Subcarpetas de backups ─────────────────────────────────
const BACKUP_AUTO    = path.join(BACKUP_DIR, 'automaticos');
const BACKUP_DIARIOS = path.join(BACKUP_DIR, 'diarios');
const BACKUP_MANUAL  = path.join(BACKUP_DIR, 'manuales');

[BACKUP_DIR, BACKUP_AUTO, BACKUP_DIARIOS, BACKUP_MANUAL, DESCARGAS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Helper: nombre de archivo con timestamp ────────────────
function nombreBackup(sufijo) {
    const n = new Date();
    const pad = v => String(v).padStart(2, '0');
    const base = `db_backup_${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}_${pad(n.getHours())}-${pad(n.getMinutes())}-${pad(n.getSeconds())}`;
    return sufijo ? `${base}_${sufijo}.db` : `${base}.db`;
}

function validarBackupSQLite(rutaArchivo) {
    let conn;
    try {
        const Database = require('better-sqlite3');
        conn = new Database(rutaArchivo, { readonly: true, fileMustExist: true });
        _markDiag('validarBackupSQLite: antes de integrity_check');
        const resultado = conn.pragma('integrity_check', { simple: true }) === 'ok';
        _markDiag('validarBackupSQLite: despues de integrity_check');
        return resultado;
    } catch (_) {
        return false;
    } finally {
        try { if (conn) conn.close(); } catch (_) {}
    }
}

function copiarBackupExternoSiCorresponde(rutaArchivo, nombre) {
    try {
        const cfg = require('./data/database').config.obtenerTodo();
        if (cfg.backup_externo_activo !== '1' || !cfg.backup_externo_dir) return;
        if (!fs.existsSync(cfg.backup_externo_dir)) {
            logger.warn('BACKUP', 'Carpeta externa no disponible');
            return;
        }
        fs.copyFileSync(rutaArchivo, path.join(cfg.backup_externo_dir, nombre));
        logger.info('BACKUP', `Copia externa actualizada: ${nombre}`);
    } catch (err) {
        logger.error('BACKUP', 'Error al copiar backup externo:', err.message);
    }
}

// ── Backup diario (1 por día, últimos 30 días) ─────────────
async function hacerBackupDiario() {
    try {
        if (!fs.existsSync(DB_PATH)) return;
        const hoy = new Date();
        const pad = v => String(v).padStart(2, '0');
        const fechaHoy = `${hoy.getFullYear()}-${pad(hoy.getMonth()+1)}-${pad(hoy.getDate())}`;
        const yaExiste = fs.readdirSync(BACKUP_DIARIOS).some(f => f.includes(fechaHoy));
        if (!yaExiste) {
            const nombre = `db_backup_${fechaHoy}_diario.db`;
            const destinoDiario = path.join(BACKUP_DIARIOS, nombre);
            const dbInstance = require('./data/database').db;
            await dbInstance.backup(destinoDiario);
            if (!validarBackupSQLite(destinoDiario)) {
                try { fs.unlinkSync(destinoDiario); } catch (_) {}
                throw new Error('Backup diario fallo integrity_check');
            }
            copiarBackupExternoSiCorresponde(destinoDiario, nombre);
            logger.info('BACKUP', `Diario guardado: ${nombre}`);
            const archivos = fs.readdirSync(BACKUP_DIARIOS)
                .filter(f => f.startsWith('db_backup_') && f.endsWith('.db'))
                .sort();
            if (archivos.length > 30) {
                archivos.slice(0, archivos.length - 30).forEach(f => {
                    try { fs.unlinkSync(path.join(BACKUP_DIARIOS, f)); } catch (_) {}
                });
            }
        }
    } catch (err) {
        logger.error('BACKUP', 'Error en backup diario:', err.message);
    }
}

// ── Backup automático (cada 30 min → carpeta automaticos/) ─
async function hacerBackup(sufijo) {
    try {
        if (!fs.existsSync(DB_PATH)) return;
        _markDiag('hacerBackup: INICIO');
        const nombre  = nombreBackup(sufijo);
        const destino = path.join(BACKUP_AUTO, nombre);
        const dbInstance = require('./data/database').db;
        _markDiag('hacerBackup: antes de dbInstance.backup()');
        await dbInstance.backup(destino);
        _markDiag('hacerBackup: despues de dbInstance.backup()');
        _markDiag('hacerBackup: antes de validarBackupSQLite()');
        if (!validarBackupSQLite(destino)) {
            try { fs.unlinkSync(destino); } catch (_) {}
            throw new Error('Backup automatico fallo integrity_check');
        }
        const archivos = fs.readdirSync(BACKUP_AUTO)
            .filter(f => f.startsWith('db_backup_') && f.endsWith('.db'))
            .sort();
        if (archivos.length > 48) {
            archivos.slice(0, archivos.length - 48).forEach(f => {
                try { fs.unlinkSync(path.join(BACKUP_AUTO, f)); } catch (_) {}
            });
        }
        copiarBackupExternoSiCorresponde(destino, nombre);
        logger.info('BACKUP', `Automático guardado: ${nombre}`);
        _markDiag('hacerBackup: antes de hacerBackupDiario()');
        await hacerBackupDiario();
        _markDiag('hacerBackup: FIN (todo completado)');
    } catch (err) {
        logger.error('BACKUP', 'Error en backup automático:', err.message);
    }
}

_markDiag('agendado setTimeout hacerBackup (dispara en 30s)');
setTimeout(() => hacerBackup(), 150000);
setInterval(hacerBackup, 30 * 60 * 1000);


// ── Middleware base (debe ir ANTES de las rutas) ───────────
app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        try {
            const url = new URL(origin);
            const host = url.hostname;
            const permitidos = new Set(['localhost', '127.0.0.1', getLocalIP()]);
            if (permitidos.has(host) || /^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
                return callback(null, true);
            }
        } catch (_) {}
        return callback(new Error('Origen no permitido por CORS'));
    }
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// ── Content Security Policy (permite Google Fonts) ────────
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "img-src 'self' data: blob:",
            "connect-src 'self' https://api.nubefact.com"
        ].join('; ')
    );
    next();
});

// ── Heartbeat (auto apagado si no hay navegador) ───────────
const isElectron = process.env.IS_ELECTRON === 'true';
let shutdownTimer = null;
const HEARTBEAT_TIMEOUT = process.env.IS_ELECTRON === 'true' ? 90000 : 300000;

function resetShutdownTimer() {
    if (isElectron) return;
    if (shutdownTimer) clearTimeout(shutdownTimer);
    shutdownTimer = setTimeout(() => {
        logger.info('SERVER', 'Navegador cerrado. Apagando sistema...');
        process.exit(0);
    }, HEARTBEAT_TIMEOUT);
}

if (!isElectron) {
    resetShutdownTimer();
}

app.post('/api/heartbeat', (req, res) => {
    resetShutdownTimer();
    res.json({ status: 'ok' });
});

// ── Rutas públicas de licencia (sin bloqueo) ───────────────
app.get('/api/licencia/estado', (req, res) => {
    const { verificarLicencia, getMachineId } = require(LICENCIA_MOD);
    const estado = verificarLicencia();
    res.json({ ...estado, machineId: getMachineId() });
});

app.post('/api/licencia/activar', (req, res) => {
    const { activarLicencia } = require(LICENCIA_MOD);
    const { clave } = req.body;
    if (!clave) {
        return res.status(400).json({ exito: false, error: 'Falta la clave de activación' });
    }
    const resultado = activarLicencia(clave);
    res.json(resultado);
});

// ── Health check (público) ─────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        db: fs.existsSync(DB_PATH) ? 'ok' : 'no encontrado'
    });
});

// ── Info del servidor (IP local para acceso desde otros dispositivos) ──
app.get('/api/server-info', (req, res) => {
    const ip = getLocalIP();
    res.json({ ip, port: PORT, url: `http://${ip}:${PORT}` });
});


// ── Middleware de licencia (protege todas las rutas /api/) ──
app.use((req, res, next) => {
    if (
        !req.path.startsWith('/api/') ||
        req.path.startsWith('/api/auth') ||
        req.path.startsWith('/api/setup') ||
        req.path.startsWith('/api/recuperacion') ||
        req.path === '/api/licencia/estado' ||
        req.path === '/api/licencia/activar' ||
        req.path === '/api/health' ||
        req.path === '/api/heartbeat' ||
        req.path === '/api/server-info'  
    ) 
    {
        return next();
    }

    const { verificarLicencia } = require(LICENCIA_MOD);
    const lic = verificarLicencia();
    if (!lic.valida) {
        return res.status(403).json({
            bloqueado: true,
            motivo: lic.motivo,
            machineId: require(LICENCIA_MOD).getMachineId()
        });
    }
    next();
});

_markDiag('antes de require(./middleware/auth)');
// ── requireAuth diferido: evita pagar el costo de cargar jsonwebtoken
// (y su cadena de dependencias) durante el arranque síncrono del servidor.
// Se resuelve real la primera vez que llega una petición a ruta protegida,
// y se pre-calienta en segundo plano justo después de app.listen().
let _requireAuthReal = null;
function requireAuth(req, res, next) {
    if (!_requireAuthReal) {
        _requireAuthReal = require('./middleware/auth').requireAuth;
    }
    return _requireAuthReal(req, res, next);
}

// ── Exponer rutas base a los routers vía app.locals ────────
app.locals.DB_PATH       = DB_PATH;
app.locals.BACKUP_DIR    = BACKUP_DIR;
app.locals.DESCARGAS_DIR = DESCARGAS_DIR;

// ── Rutas públicas ─────────────────────────────────────────
app.use('/api/auth', lazyRouter(() => require('./routes/auth')));
app.use('/api/setup', lazyRouter(() => require('./routes/setup')));
app.use('/api/recuperacion', lazyRouter(() => require('./routes/recuperacion')));

// ── Rutas protegidas (Requieren JWT) ───────────────────────
app.use('/api/*path', requireAuth);

app.use('/api/usuarios', lazyRouter(() => require('./routes/usuarios')));
app.use('/api/sistema', lazyRouter(() => require('./routes/sistema')));
app.use('/api/productos', lazyRouter(() => require('./routes/productos')));
app.use('/api/ventas', lazyRouter(() => require('./routes/ventas')));
app.use('/api/compras', lazyRouter(() => require('./routes/compras')));
app.use('/api/facturacion', lazyRouter(() => require('./routes/facturacion')));
app.use('/api/documentos', lazyRouter(() => require('./routes/documentos')));
app.use('/api/almacenes', lazyRouter(() => require('./routes/almacenes')));
app.use('/api/proveedores', lazyRouter(() => require('./routes/proveedores')));
app.use('/api/clientes', lazyRouter(() => require('./routes/clientes')));
app.use('/api/movimientos', lazyRouter(() => require('./routes/movimientos')));
app.use('/api/reportes', lazyRouter(() => require('./routes/reportes')));
app.use('/api/config', lazyRouter(() => require('./routes/config')));
app.use('/api/config', lazyRouter(() => require('./routes/demo')));
app.use('/api/archivos', lazyRouter(() => require('./routes/archivos')));
app.use('/api/creditos', lazyRouter(() => require('./routes/creditos')));
app.use('/api/caja', lazyRouter(() => require('./routes/caja')));
app.use('/api/logs', lazyRouter(() => require('./routes/logs')));
app.use('/api/backups', lazyRouter(() => require('./routes/backups')));
app.use('/api/categorias', lazyRouter(() => require('./routes/categorias')));
app.use('/api/unidades', lazyRouter(() => require('./routes/unidades')));
app.use('/api/recetas', lazyRouter(() => require('./routes/recetas')));
app.use('/api/ordenes', lazyRouter(() => require('./routes/ordenes')));
app.use('/api/talleres', lazyRouter(() => require('./routes/talleres')));


// ── Archivos estáticos del frontend ───────────────────────
const clientDist = process.env.CLIENT_DIST || path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// ── Frontend Catch-all (React Router) ──────────────────────
app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
        res.sendFile(path.join(clientDist, 'index.html'));
    } else {
        next();
    }
});

// ── Middleware de errores centralizado (DEBE ir al final) ──
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);


const server = app.listen(PORT, '0.0.0.0', () => { 
    logger.info('SERVER', `Sistema Huascaran API corriendo en puerto ${PORT}`);
    startupMark('servidor escuchando');

    // Pre-calentar requireAuth en segundo plano, sin bloquear el arranque.
    setImmediate(() => {
        try {
            require('./middleware/auth');
            logger.debug('STARTUP', 'requireAuth pre-calentado en segundo plano');
        } catch (err) {
            logger.error('STARTUP', 'Error pre-calentando requireAuth:', err.message);
        }
    });
});

// ── Apagado gracioso desde Electron ───────────────────────
// process.on('message') no cambia: al correr como proceso hijo (fork),
// Node ya entrega acá los mensajes enviados con serverProcess.send(...)
// desde main.js, sin nada adicional que configurar.
process.on('message', (msg) => {
    if (msg === 'shutdown') {
        logger.info('SERVER', 'Señal de cierre de Electron. Cerrando...');
        server.closeAllConnections();
        server.close(() => {
            // process.send solo existe corriendo como proceso hijo (fork).
            // Si corre suelto (npm run dev:backend), no existe — se ignora.
            if (typeof process.send === 'function') {
                process.send('server-shutdown-complete');
            }
        });
    }
});

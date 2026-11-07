/**
 * routes/backups.js
 */

const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const path     = require('path');
const bcrypt   = require('bcryptjs');
const Database = require('better-sqlite3');
const { db, usuarios, config } = require('../data/database');
const { requireRole } = require('../middleware/auth');
const logger = require('../logger');

router.use(requireRole('ADMIN'));

function getDirs(req) {
    const BACKUP_DIR = req.app.locals.BACKUP_DIR;
    return {
        base:        BACKUP_DIR,
        automaticos: path.join(BACKUP_DIR, 'automaticos'),
        diarios:     path.join(BACKUP_DIR, 'diarios'),
        manuales:    path.join(BACKUP_DIR, 'manuales'),
    };
}

function infoArchivo(carpeta, tipo, archivo) {
    try {
        const fullPath = path.join(carpeta, archivo);
        const stats    = fs.statSync(fullPath);
        return { archivo, tipo, tamano_kb: Math.round(stats.size / 1024), fecha_archivo: stats.mtime.toISOString() };
    } catch { return null; }
}

function leerCarpeta(carpeta, tipo, limite) {
    if (!fs.existsSync(carpeta)) return [];
    return fs.readdirSync(carpeta)
        .filter(f => f.startsWith('db_backup_') && (f.endsWith('.db') || f.endsWith('.json')))
        .sort().reverse().slice(0, limite)
        .map(f => infoArchivo(carpeta, tipo, f)).filter(Boolean);
}

function esBackupValido(rutaArchivo) {
    try {
        const header = Buffer.alloc(16);
        const fd = fs.openSync(rutaArchivo, 'r');
        fs.readSync(fd, header, 0, 16, 0);
        fs.closeSync(fd);
        return header.toString('utf8', 0, 15) === 'SQLite format 3';
    } catch { return false; }
}

function validarIntegridadBackup(rutaArchivo) {
    if (!esBackupValido(rutaArchivo)) {
        return { ok: false, error: 'El archivo no tiene formato SQLite valido.' };
    }
    let conn;
    try {
        conn = new Database(rutaArchivo, { readonly: true, fileMustExist: true });
        const integrity = conn.pragma('integrity_check', { simple: true });
        const tablas = conn.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name IN ('productos','ventas','detalle_ventas','config','usuarios')
        `).all().map(r => r.name);
        const faltantes = ['productos','ventas','detalle_ventas','config','usuarios'].filter(t => !tablas.includes(t));
        if (integrity !== 'ok') return { ok: false, error: `integrity_check: ${integrity}` };
        if (faltantes.length) return { ok: false, error: `Schema incompleto. Faltan: ${faltantes.join(', ')}` };
        return { ok: true, integrity };
    } catch (err) {
        return { ok: false, error: err.message };
    } finally {
        try { if (conn) conn.close(); } catch (_) {}
    }
}

function copiarBackupExterno(rutaArchivo, archivo) {
    const cfg = config.obtenerTodo();
    if (cfg.backup_externo_activo !== '1' || !cfg.backup_externo_dir) return null;
    try {
        const destinoDir = cfg.backup_externo_dir;
        if (!fs.existsSync(destinoDir)) return { ok: false, error: 'Carpeta externa no disponible' };
        const destino = path.join(destinoDir, archivo);
        fs.copyFileSync(rutaArchivo, destino);
        return { ok: true, archivo, ruta: destino, fecha: new Date().toISOString() };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

const pad = v => String(v).padStart(2, '0');
function timestampNombre() {
    const n = new Date();
    return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}_${pad(n.getHours())}-${pad(n.getMinutes())}-${pad(n.getSeconds())}`;
}

// GET /api/backups — vista simple: último diario + último manual
router.get('/', (req, res) => {
    try {
        const dirs = getDirs(req);
        const ultimoDiario = leerCarpeta(dirs.diarios,  'diario', 1)[0] || null;
        const ultimoManual = leerCarpeta(dirs.manuales, 'manual', 1)[0] || null;
        res.json({ ultimoDiario, ultimoManual });
    } catch (err) {
        res.status(500).json({ error: 'Error al listar backups: ' + err.message });
    }
});

// GET /api/backups/todos — lista completa para modal de admin
router.get('/todos', (req, res) => {
    try {
        const dirs = getDirs(req);
        res.json({
            automaticos: leerCarpeta(dirs.automaticos, 'automatico', 10),
            diarios:     leerCarpeta(dirs.diarios,     'diario',     30),
            manuales:    leerCarpeta(dirs.manuales,    'manual',     20),
        });
    } catch (err) {
        res.status(500).json({ error: 'Error: ' + err.message });
    }
});

// GET /api/backups/status — fecha del último backup
router.get('/status', (req, res) => {
    try {
        const dirs = getDirs(req);
        let ultimoArchivo = null, ultimaFecha = null;
        for (const carpeta of [dirs.automaticos, dirs.diarios, dirs.manuales]) {
            if (!fs.existsSync(carpeta)) continue;
            for (const f of fs.readdirSync(carpeta).filter(f => f.startsWith('db_backup_') && (f.endsWith('.db') || f.endsWith('.json')))) {
                const mtime = fs.statSync(path.join(carpeta, f)).mtime;
                if (!ultimaFecha || mtime > ultimaFecha) { ultimaFecha = mtime; ultimoArchivo = f; }
            }
        }
        const cfg = config.obtenerTodo();
        let ultimoExterno = null;
        if (cfg.backup_externo_dir && fs.existsSync(cfg.backup_externo_dir)) {
            const archivosExternos = fs.readdirSync(cfg.backup_externo_dir)
                .filter(f => f.startsWith('db_backup_') && f.endsWith('.db'));
            for (const f of archivosExternos) {
                const ruta = path.join(cfg.backup_externo_dir, f);
                const stats = fs.statSync(ruta);
                if (!ultimoExterno || stats.mtime > new Date(ultimoExterno.fecha_archivo)) {
                    ultimoExterno = { archivo: f, fecha_archivo: stats.mtime.toISOString(), tamano_kb: Math.round(stats.size / 1024) };
                }
            }
        }
        const horasSinBackup = ultimaFecha ? (Date.now() - ultimaFecha.getTime()) / 36e5 : null;
        res.json({
            ultimo_backup: ultimaFecha ? ultimaFecha.toISOString() : null,
            ultimo_archivo: ultimoArchivo,
            ultimo_externo: ultimoExterno,
            backup_externo_activo: cfg.backup_externo_activo === '1',
            backup_externo_dir: cfg.backup_externo_dir || '',
            advertencia: !ultimaFecha || horasSinBackup > 24 ? 'No hay backup local reciente en las ultimas 24 horas.' : null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/backups/verificar-password
// Verifica la contraseña del admin antes de mostrar la lista de backups.
// Devuelve un token temporal de 5 minutos para autorizar la restauración.
const restoreTokens = new Map(); // token → { expira, id_usuario }

router.post('/verificar-password', (req, res) => {
    const { password } = req.body;

    if (!req.user) {
        return res.status(403).json({ error: 'No autenticado.' });
    }

    if (req.user.rol !== 'ADMIN') {
        return res.status(403).json({ error: 'Solo el administrador puede restaurar copias de seguridad.' });
    }

    if (!password) {
        return res.status(400).json({ error: 'Debe ingresar su contraseña.' });
    }

    try {
        const user = usuarios.obtenerPorUsernameConPassword(req.user.username);

        if (!user) {
            return res.status(401).json({ error: 'Usuario no encontrado.' });
        }

        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Contraseña incorrecta.' });
        }

        // Token temporal 5 minutos
        const token  = `rst_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const expira = Date.now() + 5 * 60 * 1000;
        restoreTokens.set(token, { expira, id_usuario: req.user.id_usuario });

        // Limpiar tokens vencidos
        for (const [k, v] of restoreTokens) {
            if (v.expira < Date.now()) restoreTokens.delete(k);
        }

        const dirs = getDirs(req);
        res.json({
            ok:           true,
            restoreToken: token,
            diarios:      leerCarpeta(dirs.diarios,  'diario', 30),
            manuales:     leerCarpeta(dirs.manuales, 'manual', 20),
        });

    } catch (err) {
        logger.error('BACKUP', 'Error en verificar-password:', err.stack || err.message);
        res.status(500).json({ error: 'Error interno: ' + err.message });
    }
});

// POST /api/backups/manual — backup manual con fs.copyFileSync (mismo método que el automático)
router.post('/manual', (req, res) => {
    try {
        const dirs    = getDirs(req);
        const DB_PATH = req.app.locals.DB_PATH;

        if (!fs.existsSync(DB_PATH)) {
            return res.status(400).json({ error: 'No se encontró la base de datos.' });
        }

        if (!fs.existsSync(dirs.manuales)) fs.mkdirSync(dirs.manuales, { recursive: true });

        const nombre  = `db_backup_${timestampNombre()}_manual.db`;
        const destino = path.join(dirs.manuales, nombre);

        // Estrategia WAL: cambiar temporalmente a journal DELETE para forzar
        // que SQLite escriba TODO al .db principal, copiar, y volver a WAL.
        // Esto garantiza que el backup tiene los datos del momento exacto.
        let modoOriginalRestaurado = false;
        try {
            if (db && typeof db.pragma === 'function') {
                // Cambiar a modo DELETE fuerza el flush completo del WAL al .db
                db.pragma('journal_mode = DELETE');
                modoOriginalRestaurado = false;
                logger.debug('BACKUP', 'Modo journal cambiado a DELETE para backup');
            }
        } catch (e) {
            logger.warn('BACKUP', 'No se pudo cambiar journal_mode:', e.message);
        }

        try {
            fs.copyFileSync(DB_PATH, destino);
            logger.debug('BACKUP', 'Copia realizada en modo DELETE (datos completos)');
        } finally {
            // Restaurar WAL siempre, aunque falle la copia
            if (!modoOriginalRestaurado && db && typeof db.pragma === 'function') {
                try {
                    db.pragma('journal_mode = WAL');
                    logger.debug('BACKUP', 'Modo journal restaurado a WAL');
                } catch (e) {
                    logger.warn('BACKUP', 'No se pudo restaurar WAL:', e.message);
                }
            }
        }

        const integridad = validarIntegridadBackup(destino);
        if (!integridad.ok) {
            try { fs.unlinkSync(destino); } catch (_) {}
            return res.status(500).json({ error: `El backup generado esta corrupto: ${integridad.error}` });
        }
        const externo = copiarBackupExterno(destino, nombre);

        // Rotar: máximo 20 manuales
        const archivos = fs.readdirSync(dirs.manuales)
            .filter(f => f.startsWith('db_backup_') && f.endsWith('.db')).sort();
        if (archivos.length > 20) {
            archivos.slice(0, archivos.length - 20).forEach(f => {
                try { fs.unlinkSync(path.join(dirs.manuales, f)); } catch (_) {}
            });
        }

        logger.info('BACKUP', `Manual generado: ${nombre}`);
        res.json({ ok: true, archivo: nombre, fecha: new Date().toISOString(), integridad, externo });

    } catch (err) {
        logger.error('BACKUP', 'Error manual:', err.stack || err.message);
        res.status(500).json({ error: 'Error al generar backup: ' + err.message });
    }
});

// GET /api/backups/descargar?archivo=...&tipo=... — descarga para USB
router.get('/descargar', (req, res) => {
    const { archivo, tipo } = req.query;

    if (!archivo || !tipo) return res.status(400).json({ error: 'Faltan parámetros.' });
    if (archivo.includes('..') || archivo.includes('/') || archivo.includes('\\'))
        return res.status(400).json({ error: 'Nombre de archivo no válido.' });

    const tiposPermitidos = ['automatico', 'diario', 'manual'];
    if (!tiposPermitidos.includes(tipo)) return res.status(400).json({ error: 'Tipo no válido.' });

    try {
        const dirs = getDirs(req);
        const carpeta = { automatico: dirs.automaticos, diario: dirs.diarios, manual: dirs.manuales }[tipo];
        const rutaArchivo = path.join(carpeta, archivo);

        if (!fs.existsSync(rutaArchivo)) return res.status(404).json({ error: 'Archivo no encontrado.' });

        res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.sendFile(rutaArchivo);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/backups/restaurar — solo admin, requiere token + confirmación escrita
router.post('/probar-restauracion', (req, res) => {
    const { archivo, tipo } = req.body;
    if (!archivo || !tipo) return res.status(400).json({ error: 'Faltan parametros.' });
    if (archivo.includes('..') || archivo.includes('/') || archivo.includes('\\')) {
        return res.status(400).json({ error: 'Nombre de archivo no valido.' });
    }
    const tiposPermitidos = ['automatico', 'diario', 'manual'];
    if (!tiposPermitidos.includes(tipo)) return res.status(400).json({ error: 'Tipo no valido.' });

    try {
        const dirs = getDirs(req);
        const carpeta = { automatico: dirs.automaticos, diario: dirs.diarios, manual: dirs.manuales }[tipo];
        const rutaArchivo = path.join(carpeta, archivo);
        if (!fs.existsSync(rutaArchivo)) return res.status(404).json({ error: 'Archivo no encontrado.' });
        const integridad = validarIntegridadBackup(rutaArchivo);
        if (!integridad.ok) return res.status(400).json({ ok: false, ...integridad });
        res.json({ ok: true, archivo, tipo, integridad });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/restaurar', (req, res) => {
    const { archivo, tipo, confirmacion, restoreToken } = req.body;

    // Solo administradores
    if (!req.user || req.user.rol !== 'ADMIN') {
        return res.status(403).json({ error: 'Solo el administrador puede restaurar copias de seguridad.' });
    }

    if (!archivo || !tipo || !confirmacion || !restoreToken)
        return res.status(400).json({ error: 'Faltan parámetros requeridos.' });

    // Validar token temporal (debe existir y no haber vencido)
    const tokenData = restoreTokens.get(restoreToken);
    if (!tokenData) {
        return res.status(401).json({ error: 'Sesión de restauración expirada. Vuelva a verificar su contraseña.' });
    }
    if (tokenData.expira < Date.now()) {
        restoreTokens.delete(restoreToken);
        return res.status(401).json({ error: 'La sesión de restauración expiró (5 min). Vuelva a verificar su contraseña.' });
    }
    if (tokenData.id_usuario !== req.user.id_usuario) {
        return res.status(403).json({ error: 'Token de restauración no válido.' });
    }

    if (confirmacion !== 'RESTAURAR')
        return res.status(400).json({ error: 'Confirmación incorrecta. Escriba exactamente: RESTAURAR' });

    const tiposPermitidos = ['automatico', 'diario', 'manual'];
    if (!tiposPermitidos.includes(tipo))
        return res.status(400).json({ error: 'Tipo de backup no válido.' });

    if (archivo.includes('..') || archivo.includes('/') || archivo.includes('\\'))
        return res.status(400).json({ error: 'Nombre de archivo no válido.' });

    try {
        const DB_PATH = req.app.locals.DB_PATH;
        const dirs    = getDirs(req);

        const carpetaOrigen = { automatico: dirs.automaticos, diario: dirs.diarios, manual: dirs.manuales }[tipo];
        const rutaBackup    = path.join(carpetaOrigen, archivo);

        if (!fs.existsSync(rutaBackup))
            return res.status(404).json({ error: `Backup no encontrado: ${archivo}` });

        const integridad = validarIntegridadBackup(rutaBackup);
        if (!integridad.ok)
            return res.status(400).json({ error: `El backup esta corrupto y no puede restaurarse: ${integridad.error}` });

        // Guardar copia de la BD actual ANTES de sobreescribir
        if (fs.existsSync(DB_PATH)) {
            if (!fs.existsSync(dirs.manuales)) fs.mkdirSync(dirs.manuales, { recursive: true });
            const nombrePrevia = `db_backup_${timestampNombre()}_antes_restaurar.db`;
            fs.copyFileSync(DB_PATH, path.join(dirs.manuales, nombrePrevia));
            logger.info('BACKUP', `Copia previa a restauración guardada: ${nombrePrevia}`);
        }

        // Cerrar conexión SQLite si es posible, luego copiar backup
        try {
            if (db && typeof db.close === 'function') db.close();
        } catch (_) { /* continuar aunque falle el cierre */ }

        fs.copyFileSync(rutaBackup, DB_PATH);

        // Invalidar token — ya no puede usarse de nuevo
        restoreTokens.delete(restoreToken);
        logger.info('BACKUP', `BD restaurada desde: ${archivo}`);

        // Señal de reinicio al proceso principal (Electron o standalone)
        process.emit('message', 'shutdown');

        res.json({
            ok: true,
            mensaje: 'Base de datos restaurada. El sistema se reiniciará en unos segundos.',
            archivo_restaurado: archivo,
        });

    } catch (err) {
        logger.error('BACKUP', 'Error en restauración:', err.message);
        res.status(500).json({ error: 'Error al restaurar: ' + err.message });
    }
});

module.exports = router;

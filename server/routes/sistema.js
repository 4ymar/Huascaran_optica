/**
 * routes/sistema.js
 * Rutas de diagnóstico del sistema:
 *   GET  /api/sistema/diagnostico            → Estado de salud del sistema
 *   GET  /api/sistema/diagnostico/exportar   → Paquete de soporte en ZIP
 */

const router = require('express').Router();
const { db } = require('../data/database');
const { requireRole } = require('../middleware/auth');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const logger = require('../logger');

router.use(requireRole('ADMIN'));

function obtenerEstadoActualizacion() {
    const bloqueos = [];

    const sesionAbierta = db.prepare(`
        SELECT id_sesion, usuario
        FROM sesiones_caja
        WHERE estado = 'ABIERTA'
        LIMIT 1
    `).get();
    if (sesionAbierta) {
        bloqueos.push(`Hay una sesión de caja abierta (usuario: ${sesionAbierta.usuario}).`);
    }

    const cpeEnCurso = db.prepare(`
        SELECT estado, COUNT(*) AS total
        FROM cpe_documentos
        WHERE estado IN ('ENVIANDO', 'PENDIENTE', 'PENDIENTE_CONSULTA')
          AND datetime(fecha_actualizacion) >= datetime('now', '-15 minutes')
        GROUP BY estado
    `).all();
    for (const row of cpeEnCurso) {
        bloqueos.push(`Hay ${row.total} comprobante(s) electrónico(s) en estado ${row.estado}.`);
    }

    return {
        puede_actualizar: bloqueos.length === 0,
        bloqueos,
    };
}

// ══════════════════════════════════════════════════════════════════
//  GET /api/sistema/estado-actualizacion
//  Verifica si el sistema puede reiniciarse de forma segura
// ══════════════════════════════════════════════════════════════════
router.get('/estado-actualizacion', (req, res) => {
    try {
        res.json({
            ok: true,
            ...obtenerEstadoActualizacion()
        });
    } catch (err) {
        logger.error('SISTEMA', 'Error en /api/sistema/estado-actualizacion:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════
//  GET /api/sistema/diagnostico
//  Obtiene el reporte de diagnóstico del sistema
// ══════════════════════════════════════════════════════════════════
router.get('/diagnostico', (req, res) => {
    try {
        const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/inventario.db');
        const logPath = process.env.LOG_PATH || path.join(path.dirname(dbPath), 'app-error.log');
        const appVersion = process.env.APP_VERSION || '2.0.0';

        // 1. Verificar integridad de la BD y versión de esquema
        let dbIntegridad = 'error';
        let schemaVersion = 0;
        let migracionesAplicadas = [];
        try {
            const result = db.pragma('integrity_check', { simple: true });
            dbIntegridad = result === 'ok' ? 'ok' : 'fallido: ' + JSON.stringify(result);
            schemaVersion = db.pragma('user_version', { simple: true });
            try {
                migracionesAplicadas = db.prepare(`
                    SELECT version, nombre, aplicada_en
                    FROM schema_migrations
                    ORDER BY version DESC
                `).all();
            } catch (_) {
                migracionesAplicadas = [];
            }
        } catch (err) {
            dbIntegridad = 'error: ' + err.message;
        }

        // 2. Verificar CPEs atascados en ENVIANDO por más de 10 minutos
        let cpePendientes = 0;
        try {
            const row = db.prepare(`
                SELECT COUNT(*) AS c FROM cpe_documentos 
                WHERE estado = 'ENVIANDO' 
                AND datetime(fecha_actualizacion) <= datetime('now', '-10 minutes')
            `).get();
            cpePendientes = row ? row.c : 0;
        } catch (err) {
            logger.error('SISTEMA', 'Error verificando CPEs pendientes:', err.message);
        }

        // 3. Verificar estado seguro de reinicio
        let estadoActualizacion = { puede_actualizar: false, bloqueos: ['No se pudo verificar el estado de actualización.'] };
        try {
            estadoActualizacion = obtenerEstadoActualizacion();
        } catch (err) {
            logger.error('SISTEMA', 'Error verificando estado de actualización:', err.message);
        }

        res.json({
            ok: true,
            db_path: dbPath,
            log_path: logPath,
            app_version: appVersion,
            schema_version: schemaVersion,
            migraciones_total: migracionesAplicadas.length,
            ultima_migracion: migracionesAplicadas[0] || null,
            db_integridad: dbIntegridad,
            cpe_pendientes: cpePendientes,
            puede_actualizar: estadoActualizacion.puede_actualizar,
            bloqueos_actualizacion: estadoActualizacion.bloqueos,
            caja_abierta: estadoActualizacion.bloqueos.some(b => b.toLowerCase().includes('caja abierta'))
        });
    } catch (err) {
        logger.error('SISTEMA', 'Error en /api/sistema/diagnostico:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════
//  GET /api/sistema/diagnostico/exportar
//  Exporta el paquete de soporte en un archivo ZIP
// ══════════════════════════════════════════════════════════════════
router.get('/diagnostico/exportar', async (req, res) => {
    const tempDbPath = path.join(os.tmpdir(), 'huascaran_temp.db');
    const tempZipPath = path.join(os.tmpdir(), `huascaran_soporte_${Date.now()}.zip`);

    try {
        const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/inventario.db');
        const logPath = process.env.LOG_PATH || path.join(path.dirname(dbPath), 'app-error.log');
        const normalLogPath = path.join(path.dirname(dbPath), 'app.log');

        // 1. Crear una copia de la base de datos para sanitizarla
        if (!fs.existsSync(dbPath)) {
            return res.status(404).json({ ok: false, error: 'Base de datos original no encontrada' });
        }

        fs.copyFileSync(dbPath, tempDbPath);

        // 2. Abrir la base de datos temporal, leer metadatos y sanitizar
        const tempDb = new Database(tempDbPath);
        let manifiesto = {};
        try {
            let migraciones = [];
            try {
                migraciones = tempDb.prepare(`
                    SELECT version, nombre, aplicada_en
                    FROM schema_migrations
                    ORDER BY version
                `).all();
            } catch (_) {}
            let integridad = 'error';
            try {
                integridad = tempDb.pragma('integrity_check', { simple: true });
            } catch (err) {
                integridad = `error: ${err.message}`;
            }
            manifiesto = {
                generado_en: new Date().toISOString(),
                app_version: process.env.APP_VERSION || '2.0.0',
                schema_version: tempDb.pragma('user_version', { simple: true }),
                db_integridad: integridad,
                migraciones_total: migraciones.length,
                ultima_migracion: migraciones[migraciones.length - 1] || null,
                migraciones,
            };
            tempDb.exec(`
                -- Redactar contraseñas de usuarios
                UPDATE usuarios SET password_hash = 'REDACTED';
                -- Eliminar llaves de configuración sensibles, dejando solo las requeridas
                DELETE FROM config WHERE clave NOT IN ('cpe_proveedor', 'sunat_activo', 'sunat_modo', 'sunat_url');
            `);
        } finally {
            tempDb.close();
        }

        // 3. Crear el archivo ZIP usando archiver
        const output = fs.createWriteStream(tempZipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            res.json({ ok: true, tempZipPath });
        });

        archive.on('error', (err) => {
            throw err;
        });

        archive.pipe(output);

        // Agregar BD sanitizada
        archive.file(tempDbPath, { name: 'inventario_soporte.db' });
        archive.append(JSON.stringify(manifiesto, null, 2), { name: 'manifesto_soporte.json' });

        // Agregar archivos de logs si existen
        if (fs.existsSync(logPath)) {
            archive.file(logPath, { name: 'app-error.log' });
        }
        if (fs.existsSync(normalLogPath)) {
            archive.file(normalLogPath, { name: 'app.log' });
        }

        await archive.finalize();

        // Eliminar la BD temporal después de zipearla
        try { fs.unlinkSync(tempDbPath); } catch (_) {}

    } catch (err) {
        logger.error('SISTEMA', 'Error al exportar paquete de soporte:', err.message);
        // Limpiar archivos temporales en caso de error
        try { if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath); } catch (_) {}
        try { if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath); } catch (_) {}
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;

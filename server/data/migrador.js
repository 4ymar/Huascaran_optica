/**
 * server/data/migrador.js
 * Motor de migraciones seguro, secuencial y transaccional para HUASCARAN POS.
 * 
 * Garantías:
 * 1. Checkpoint WAL y verificación de integridad previa (PRAGMA integrity_check).
 * 2. Respaldo automático del archivo SQLite antes de aplicar cualquier cambio DDL.
 * 3. Ejecución secuencial y atómica por transacción con registro en 'schema_migrations'.
 * 4. Restauración automática del respaldo en caso de fallo crítico en cualquier migración.
 * 5. Verificación de integridad posterior y actualización de PRAGMA user_version.
 */

const fs = require('fs');
const path = require('path');

function loggerMigracion(msg) {
    const linea = `[${new Date().toISOString()}] [DB-MIGRATOR] ${msg}\n`;
    console.log(linea.trim());
    if (process.env.LOG_PATH) {
        try { fs.appendFileSync(process.env.LOG_PATH, linea); } catch (_) {}
    }
}

function crearTablaMigracionesSiFalta(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            nombre TEXT NOT NULL,
            aplicada_en TEXT NOT NULL
        );
    `);
}

function obtenerVersionFinal() {
    return MIGRACIONES.reduce((max, mig) => Math.max(max, mig.version), 0);
}

function crearRespaldoFisico(db, dbPath, destino) {
    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(dbPath, destino);
}

function eliminarArchivosWal(dbPath) {
    for (const extra of [`${dbPath}-wal`, `${dbPath}-shm`]) {
        try {
            if (fs.existsSync(extra)) fs.unlinkSync(extra);
        } catch (_) {}
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CATÁLOGO SECUENCIAL DE MIGRACIONES
//  Cada migración se ejecuta dentro de una transacción exclusiva y queda
//  registrada en 'schema_migrations' con su timestamp.
// ══════════════════════════════════════════════════════════════════════════════
const MIGRACIONES = [
    {
        version: 1,
        nombre: '001_estructura_base_y_categorias_unidades',
        up: (db) => {
            // Migración de jerarquía en categorías si no existe
            const colsCategorias = db.prepare(`PRAGMA table_info(categorias)`).all();
            if (!colsCategorias.some(c => c.name === 'id_categoria_padre')) {
                db.exec(`ALTER TABLE categorias ADD COLUMN id_categoria_padre INTEGER REFERENCES categorias(id_categoria)`);
            }

            // Migración de FK id_categoria en productos
            const colsProductos = db.prepare(`PRAGMA table_info(productos)`).all();
            if (!colsProductos.some(c => c.name === 'id_categoria')) {
                db.exec(`ALTER TABLE productos ADD COLUMN id_categoria INTEGER REFERENCES categorias(id_categoria)`);
                if (colsProductos.includes('categoria')) {
                    db.exec(`
                        UPDATE productos
                        SET id_categoria = (SELECT id_categoria FROM categorias WHERE categorias.nombre = productos.categoria)
                        WHERE categoria IS NOT NULL AND categoria != ''
                    `);
                }
            }

            // Tabla de unidades de medida
            db.exec(`
                CREATE TABLE IF NOT EXISTS unidades (
                    id_unidad INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre    TEXT NOT NULL UNIQUE,
                    activo    INTEGER NOT NULL DEFAULT 1,
                    orden     INTEGER NOT NULL DEFAULT 0
                );
            `);
        }
    },
    {
        version: 2,
        nombre: '002_caja_canales_pago_y_comprobantes_cpe',
        up: (db) => {
            const colsVentas = db.prepare(`PRAGMA table_info(ventas)`).all().map(c => c.name);
            if (!colsVentas.includes('id_sesion_caja')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN id_sesion_caja TEXT`);
            }
            if (!colsVentas.includes('monto_efectivo')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN monto_efectivo REAL NOT NULL DEFAULT 0`);
            }
            if (!colsVentas.includes('monto_tarjeta')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN monto_tarjeta REAL NOT NULL DEFAULT 0`);
            }
            if (!colsVentas.includes('monto_yape_plin')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN monto_yape_plin REAL NOT NULL DEFAULT 0`);
            }
            if (!colsVentas.includes('cpe_estado')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN cpe_estado TEXT DEFAULT ''`);
            }
            if (!colsVentas.includes('cpe_codigo_hash')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN cpe_codigo_hash TEXT DEFAULT ''`);
            }
            if (!colsVentas.includes('cpe_enlace_pdf')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN cpe_enlace_pdf TEXT DEFAULT ''`);
            }
            if (!colsVentas.includes('cpe_enlace_xml')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN cpe_enlace_xml TEXT DEFAULT ''`);
            }
            if (!colsVentas.includes('nota_credito_serie')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN nota_credito_serie TEXT DEFAULT ''`);
            }
            if (!colsVentas.includes('nota_credito_numero')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN nota_credito_numero TEXT DEFAULT ''`);
            }
            if (!colsVentas.includes('nota_credito_fecha')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN nota_credito_fecha TEXT DEFAULT ''`);
            }
            if (!colsVentas.includes('nota_credito_observacion')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN nota_credito_observacion TEXT DEFAULT ''`);
            }

            const colsMovCaja = db.prepare(`PRAGMA table_info(movimientos_caja)`).all().map(c => c.name);
            if (!colsMovCaja.includes('medio_pago')) {
                db.exec(`ALTER TABLE movimientos_caja ADD COLUMN medio_pago TEXT NOT NULL DEFAULT 'EFECTIVO'`);
            }
            if (!colsMovCaja.includes('referencia_tipo')) {
                db.exec(`ALTER TABLE movimientos_caja ADD COLUMN referencia_tipo TEXT`);
            }
            if (!colsMovCaja.includes('referencia_id')) {
                db.exec(`ALTER TABLE movimientos_caja ADD COLUMN referencia_id TEXT`);
            }

            const colsLogs = db.prepare(`PRAGMA table_info(logs)`).all().map(c => c.name);
            if (!colsLogs.includes('id_referencia')) {
                db.exec(`ALTER TABLE logs ADD COLUMN id_referencia TEXT`);
            }
            if (!colsLogs.includes('tipo_referencia')) {
                db.exec(`ALTER TABLE logs ADD COLUMN tipo_referencia TEXT`);
            }
        }
    },
    {
        version: 3,
        nombre: '003_sunat_codigo_producto_y_documentos_cpe',
        up: (db) => {
            const colsProductos = db.prepare(`PRAGMA table_info(productos)`).all().map(c => c.name);
            if (!colsProductos.includes('codigo_barras')) {
                db.exec(`ALTER TABLE productos ADD COLUMN codigo_barras TEXT DEFAULT ''`);
            }
            if (!colsProductos.includes('codigo_producto_sunat')) {
                db.exec(`ALTER TABLE productos ADD COLUMN codigo_producto_sunat TEXT DEFAULT ''`);
            }
            if (!colsProductos.includes('eliminado')) {
                db.exec(`ALTER TABLE productos ADD COLUMN eliminado INTEGER NOT NULL DEFAULT 0`);
            }
            if (!colsProductos.includes('tipo_igv')) {
                db.exec(`ALTER TABLE productos ADD COLUMN tipo_igv INTEGER NOT NULL DEFAULT 1`);
            }

            const colsClientes = db.prepare(`PRAGMA table_info(clientes)`).all().map(c => c.name);
            if (!colsClientes.includes('eliminado')) {
                db.exec(`ALTER TABLE clientes ADD COLUMN eliminado INTEGER NOT NULL DEFAULT 0`);
            }

            const colsCompras = db.prepare(`PRAGMA table_info(compras)`).all().map(c => c.name);
            if (!colsCompras.includes('id_proveedor')) {
                db.exec(`ALTER TABLE compras ADD COLUMN id_proveedor TEXT`);
            }

            const colsCpeDoc = db.prepare(`PRAGMA table_info(cpe_documentos)`).all().map(c => c.name);
            if (!colsCpeDoc.includes('enlace_cdr')) {
                db.exec(`ALTER TABLE cpe_documentos ADD COLUMN enlace_cdr TEXT DEFAULT ''`);
            }
            if (!colsCpeDoc.includes('ultimo_error')) {
                db.exec(`ALTER TABLE cpe_documentos ADD COLUMN ultimo_error TEXT DEFAULT ''`);
            }
            if (!colsCpeDoc.includes('intentos')) {
                db.exec(`ALTER TABLE cpe_documentos ADD COLUMN intentos INTEGER NOT NULL DEFAULT 0`);
            }

            const colsDetVenta = db.prepare(`PRAGMA table_info(detalle_ventas)`).all().map(c => c.name);
            if (!colsDetVenta.includes('costo_unitario')) {
                db.exec(`ALTER TABLE detalle_ventas ADD COLUMN costo_unitario REAL`);
            }

            const colsDetDev = db.prepare(`PRAGMA table_info(detalle_devoluciones)`).all().map(c => c.name);
            if (!colsDetDev.includes('costo_unitario')) {
                db.exec(`ALTER TABLE detalle_devoluciones ADD COLUMN costo_unitario REAL`);
            }
        }
    },
    {
        version: 4,
        nombre: '004_seguridad_usuarios_y_rol_almacen',
        up: (db) => {
            const colsUsuarios = db.prepare(`PRAGMA table_info(usuarios)`).all().map(c => c.name);
            if (!colsUsuarios.includes('token_version')) {
                db.exec(`ALTER TABLE usuarios ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`);
            }

            const schemaUsuarios = db.prepare(
                `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'`
            ).get();

            if (schemaUsuarios && !schemaUsuarios.sql.includes('ENCARGADO_ALMACEN')) {
                db.exec(`
                    CREATE TABLE usuarios_new (
                        id_usuario      TEXT PRIMARY KEY,
                        username        TEXT UNIQUE NOT NULL,
                        password_hash   TEXT NOT NULL,
                        nombre_completo TEXT NOT NULL,
                        rol             TEXT NOT NULL CHECK(rol IN ('ADMIN', 'CAJERO', 'ENCARGADO_ALMACEN')),
                        estado          TEXT NOT NULL DEFAULT 'ACTIVO' CHECK(estado IN ('ACTIVO', 'INACTIVO')),
                        fecha_creacion  TEXT NOT NULL,
                        token_version   INTEGER NOT NULL DEFAULT 0
                    );
                `);
                db.exec(`
                    INSERT INTO usuarios_new (id_usuario, username, password_hash, nombre_completo, rol, estado, fecha_creacion, token_version)
                    SELECT id_usuario, username, password_hash, nombre_completo, rol, estado, fecha_creacion, COALESCE(token_version, 0)
                    FROM usuarios;
                `);
                db.exec(`DROP TABLE usuarios;`);
                db.exec(`ALTER TABLE usuarios_new RENAME TO usuarios;`);
            }
        }
    },
    {
        version: 5,
        nombre: '005_multialmacen_columnas_e_indices',
        up: (db) => {
            const colsMov = db.prepare(`PRAGMA table_info(movimientos)`).all().map(c => c.name);
            if (!colsMov.includes('id_almacen')) {
                db.exec(`ALTER TABLE movimientos ADD COLUMN id_almacen TEXT`);
            }

            const colsCompras = db.prepare(`PRAGMA table_info(compras)`).all().map(c => c.name);
            if (!colsCompras.includes('id_almacen')) {
                db.exec(`ALTER TABLE compras ADD COLUMN id_almacen TEXT`);
            }

            const colsVentas = db.prepare(`PRAGMA table_info(ventas)`).all().map(c => c.name);
            if (!colsVentas.includes('id_almacen')) {
                db.exec(`ALTER TABLE ventas ADD COLUMN id_almacen TEXT`);
            }

            // Backfill seguro para registros sin almacén asignado
            db.prepare(`UPDATE compras SET id_almacen = 'alm-principal' WHERE id_almacen IS NULL OR id_almacen = ''`).run();
            db.prepare(`UPDATE ventas SET id_almacen = 'alm-principal' WHERE id_almacen IS NULL OR id_almacen = ''`).run();
            db.prepare(`UPDATE movimientos SET id_almacen = 'alm-principal' WHERE id_almacen IS NULL OR id_almacen = ''`).run();

            // Índices de rendimiento
            const indices = [
                `CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras ON productos(codigo_barras)`,
                `CREATE INDEX IF NOT EXISTS idx_ventas_sesion           ON ventas(id_sesion_caja)`,
                `CREATE INDEX IF NOT EXISTS idx_ventas_fecha            ON ventas(fecha_hora)`,
                `CREATE INDEX IF NOT EXISTS idx_ventas_cliente          ON ventas(id_cliente)`,
                `CREATE INDEX IF NOT EXISTS idx_detalle_ventas_venta    ON detalle_ventas(id_venta)`,
                `CREATE INDEX IF NOT EXISTS idx_detalle_ventas_producto ON detalle_ventas(id_producto)`,
                `CREATE INDEX IF NOT EXISTS idx_movimientos_producto    ON movimientos(id_producto)`,
                `CREATE INDEX IF NOT EXISTS idx_movimientos_fecha       ON movimientos(fecha_hora)`,
                `CREATE INDEX IF NOT EXISTS idx_movimientos_almacen     ON movimientos(id_almacen)`,
                `CREATE INDEX IF NOT EXISTS idx_creditos_cliente        ON creditos(id_cliente)`,
                `CREATE INDEX IF NOT EXISTS idx_creditos_estado         ON creditos(estado)`,
                `CREATE INDEX IF NOT EXISTS idx_abonos_credito          ON abonos(id_credito)`,
                `CREATE INDEX IF NOT EXISTS idx_logs_fecha              ON logs(fecha_hora)`,
                `CREATE INDEX IF NOT EXISTS idx_logs_modulo             ON logs(modulo)`,
                `CREATE INDEX IF NOT EXISTS idx_logs_usuario            ON logs(usuario)`,
                `CREATE INDEX IF NOT EXISTS idx_mov_caja_sesion         ON movimientos_caja(id_sesion)`,
            ];
            for (const sql of indices) {
                db.exec(sql);
            }
        }
    },
    {
        version: 6,
        nombre: '006_corregir_cpe_estado_aceptado_falso',
        up: (db) => {
            // Reclasificar comprobantes marcados ACEPTADO en ventas y cpe_documentos
            // que no tienen confirmación de aceptación real de SUNAT (aceptada_por_sunat != 1)
            db.exec(`
                UPDATE ventas
                SET cpe_estado = 'ENVIADO_PENDIENTE_SUNAT'
                WHERE cpe_estado = 'ACEPTADO'
                  AND id_venta IN (
                    SELECT v.id_venta
                    FROM ventas v
                    JOIN cpe_documentos d ON d.id_venta = v.id_venta
                    WHERE (
                        json_extract(d.response_json, '$.aceptada_por_sunat') IS NULL
                        OR json_extract(d.response_json, '$.aceptada_por_sunat') = 0
                    )
                    AND d.estado = 'ACEPTADO'
                  );
            `);

            db.exec(`
                UPDATE cpe_documentos
                SET estado = 'ENVIADO_PENDIENTE_SUNAT'
                WHERE estado = 'ACEPTADO'
                  AND (
                    json_extract(response_json, '$.aceptada_por_sunat') IS NULL
                    OR json_extract(response_json, '$.aceptada_por_sunat') = 0
                  );
            `);
        }
    },
    {
        version: 7,
        nombre: '007_modulo_optica_base',
        up: (db) => {
            // Agrega columnas solo si no existen (idempotente; también sirve
            // para bases que vengan de la versión anterior de óptica).
            const agregarColumnas = (tabla, columnas) => {
                const existentes = db.prepare(`PRAGMA table_info(${tabla})`).all().map(c => c.name);
                for (const [nombre, ddl] of columnas) {
                    if (!existentes.includes(nombre)) {
                        db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${nombre} ${ddl}`);
                    }
                }
            };

            // ── Talleres ─────────────────────────────────────────────────────
            db.exec(`
                CREATE TABLE IF NOT EXISTS talleres (
                    id_taller    TEXT PRIMARY KEY,
                    nombre       TEXT NOT NULL,
                    contacto     TEXT,
                    telefono_alt TEXT,
                    email        TEXT,
                    ruc          TEXT,
                    direccion    TEXT,
                    especialidad TEXT,
                    notas        TEXT,
                    activo       INTEGER NOT NULL DEFAULT 1
                );
            `);

            // ── Recetas ──────────────────────────────────────────────────────
            db.exec(`
                CREATE TABLE IF NOT EXISTS recetas (
                    id_receta     TEXT PRIMARY KEY,
                    id_cliente    TEXT NOT NULL,
                    fecha_receta  TEXT NOT NULL,
                    od_esfera     REAL,
                    od_cilindro   REAL,
                    od_eje        INTEGER,
                    oi_esfera     REAL,
                    oi_cilindro   REAL,
                    oi_eje        INTEGER,
                    tipo_lente    TEXT,
                    dip           REAL,
                    observaciones TEXT,
                    activa        INTEGER NOT NULL DEFAULT 1,
                    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente)
                );
            `);
            agregarColumnas('recetas', [
                ['od_adicion',            'REAL'],
                ['oi_adicion',            'REAL'],
                ['od_altura',             'REAL'],
                ['oi_altura',             'REAL'],
                ['od_prisma',             'TEXT'],
                ['oi_prisma',             'TEXT'],
                ['od_av_sc',              'TEXT'],
                ['od_av_ae',              'TEXT'],
                ['od_av_cc',              'TEXT'],
                ['oi_av_sc',              'TEXT'],
                ['oi_av_ae',              'TEXT'],
                ['oi_av_cc',              'TEXT'],
                ['material_lente',        'TEXT'],
                ['diagnostico',           'TEXT'],
                ['codigo_cie10',          'TEXT'],
                ['periodo_uso',           'TEXT'],
                ['indicaciones',          'TEXT'],
                ['fecha_proximo_control', 'TEXT'],
                ['profesional_nombre',    'TEXT'],
                ['profesional_registro',  'TEXT'],
                ['usuario_creador',       'TEXT'],
                ['fecha_registro',        'TEXT'],
            ]);

            // ── Órdenes de trabajo ───────────────────────────────────────────
            db.exec(`
                CREATE TABLE IF NOT EXISTS ordenes_trabajo (
                    id_orden               TEXT PRIMARY KEY,
                    id_cliente             TEXT NOT NULL,
                    id_receta              TEXT,
                    fecha_entrada          TEXT NOT NULL,
                    fecha_entrega_estimada TEXT,
                    fecha_entrega_real     TEXT,
                    estado                 TEXT NOT NULL DEFAULT 'PENDIENTE',
                    tipo_trabajo           TEXT,
                    observaciones          TEXT,
                    total_mano_obra        REAL NOT NULL DEFAULT 0,
                    usuario_creador        TEXT,
                    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
                    FOREIGN KEY (id_receta)  REFERENCES recetas(id_receta)
                );
            `);
            agregarColumnas('ordenes_trabajo', [
                ['id_taller',              'TEXT REFERENCES talleres(id_taller)'],
                ['fecha_envio_taller',     'TEXT'],
                ['fecha_recepcion_taller', 'TEXT'],
            ]);

            db.exec(`
                CREATE TABLE IF NOT EXISTS detalle_orden (
                    id_detalle   TEXT PRIMARY KEY,
                    id_orden     TEXT NOT NULL,
                    id_producto  TEXT,
                    cantidad     REAL NOT NULL DEFAULT 1,
                    precio_venta REAL NOT NULL DEFAULT 0,
                    ojo          TEXT,
                    FOREIGN KEY (id_orden)    REFERENCES ordenes_trabajo(id_orden),
                    FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
                );
            `);

            // Historial de etapas de la orden (cada cambio de estado)
            db.exec(`
                CREATE TABLE IF NOT EXISTS orden_historial (
                    id_historial TEXT PRIMARY KEY,
                    id_orden     TEXT NOT NULL,
                    estado       TEXT NOT NULL,
                    id_taller    TEXT,
                    usuario      TEXT,
                    nota         TEXT,
                    fecha_hora   TEXT NOT NULL,
                    FOREIGN KEY (id_orden)  REFERENCES ordenes_trabajo(id_orden),
                    FOREIGN KEY (id_taller) REFERENCES talleres(id_taller)
                );
            `);

            // ── Campos de óptica en tablas existentes ────────────────────────
            agregarColumnas('clientes', [
                ['fecha_nacimiento', 'TEXT'],
                ['sexo',             'TEXT'],
                ['ocupacion',        'TEXT'],
                ['observaciones',    'TEXT'],
            ]);
            agregarColumnas('ventas', [
                ['id_receta', 'TEXT'],
                ['id_orden',  'TEXT'],
            ]);

            // ── Índices ──────────────────────────────────────────────────────
            db.exec(`CREATE INDEX IF NOT EXISTS idx_recetas_cliente        ON recetas(id_cliente)`);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_ordenes_cliente        ON ordenes_trabajo(id_cliente)`);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_ordenes_estado         ON ordenes_trabajo(estado)`);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_orden_historial_orden  ON orden_historial(id_orden)`);
        }
    }
];

// ══════════════════════════════════════════════════════════════════════════════
//  EJECUTOR DE MIGRACIONES CON RESGUARDO Y ROLLBACK AUTOMÁTICO
// ══════════════════════════════════════════════════════════════════════════════
function ejecutarMigracionesSeguras(db, dbPath) {
    loggerMigracion('Iniciando verificación de esquema y migraciones...');

    // 1. Checkpoint WAL previo
    try {
        db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (err) {
        loggerMigracion(`Advertencia en checkpoint WAL inicial: ${err.message}`);
    }

    // 2. Comprobar integridad física antes de tocar nada
    const integrityPre = db.pragma('integrity_check', { simple: true });
    if (integrityPre !== 'ok') {
        const errMsg = `Fallo crítico: la base de datos no pasó el integrity_check previo (${integrityPre})`;
        loggerMigracion(errMsg);
        throw new Error(errMsg);
    }

    // 3. Leer historial sin crear DDL todavía. Si la tabla no existe, todas
    // las migraciones idempotentes quedan pendientes y se crea respaldo antes.
    const tablaMigracionesExiste = Boolean(
        db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'schema_migrations'
        `).get()
    );
    const migracionesAplicadas = new Set(
        tablaMigracionesExiste
            ? db.prepare(`SELECT version FROM schema_migrations`).all().map(r => r.version)
            : []
    );

    const pendientes = MIGRACIONES.filter(m => !migracionesAplicadas.has(m.version))
                                  .sort((a, b) => a.version - b.version);

    if (pendientes.length === 0) {
        loggerMigracion('Esquema al día. No hay migraciones pendientes.');
        const maxVersion = obtenerVersionFinal();
        db.pragma(`user_version = ${maxVersion}`);
        return { aplicadas: 0, versionActual: maxVersion };
    }

    loggerMigracion(`Se encontraron ${pendientes.length} migración(es) pendiente(s). Creando respaldo previo...`);

    // 4. Crear Respaldo Físico Automático Pre-Migración
    const dirBackups = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
    const dirAutomaticos = path.join(dirBackups, 'automaticos');
    if (!fs.existsSync(dirAutomaticos)) {
        fs.mkdirSync(dirAutomaticos, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPreMigracion = path.join(dirAutomaticos, `inventario.db.pre-migracion-${timestamp}.bak`);

    try {
        crearRespaldoFisico(db, dbPath, backupPreMigracion);
        loggerMigracion(`Respaldo pre-migración creado exitosamente en: ${backupPreMigracion}`);
    } catch (backupErr) {
        loggerMigracion(`Error al crear respaldo pre-migración: ${backupErr.message}. Abortando migraciones por seguridad.`);
        throw backupErr;
    }

    // 5. Ejecutar migraciones secuenciales en transacciones individuales
    let ultimaVersionAplicada = 0;
    for (const mig of pendientes) {
        loggerMigracion(`Aplicando migración [v${mig.version}] ${mig.nombre}...`);
        try {
            const transaccion = db.transaction(() => {
                crearTablaMigracionesSiFalta(db);
                mig.up(db);
                db.prepare(
                    `INSERT INTO schema_migrations (version, nombre, aplicada_en) VALUES (?, ?, ?)`
                ).run(mig.version, mig.nombre, new Date().toISOString());
            });
            transaccion();
            ultimaVersionAplicada = mig.version;
            loggerMigracion(`Migración [v${mig.version}] aplicada con éxito.`);
        } catch (migErr) {
            loggerMigracion(`ERROR CRÍTICO aplicando migración [v${mig.version}] ${mig.nombre}: ${migErr.message}`);
            loggerMigracion(`Iniciando restauración automática desde: ${backupPreMigracion}`);

            // Intentar restaurar copia limpia
            try {
                try { db.close(); } catch (_) {}
                eliminarArchivosWal(dbPath);
                fs.copyFileSync(backupPreMigracion, dbPath);
                loggerMigracion('Restauración completada. Base de datos revertida al estado previo seguro.');
            } catch (restoreErr) {
                loggerMigracion(`FATAL: No se pudo restaurar el archivo de respaldo: ${restoreErr.message}`);
            }

            throw new Error(`Fallo en migración [v${mig.version}] ${mig.nombre}. La BD fue restaurada al estado previo. Motivo: ${migErr.message}`);
        }
    }

    // 6. Checkpoint final y verificación de integridad posterior
    try {
        db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (_) {}

    const integrityPost = db.pragma('integrity_check', { simple: true });
    if (integrityPost !== 'ok') {
        loggerMigracion(`ADVERTENCIA: Fallo en integrity_check posterior (${integrityPost})`);
    }

    const versionFinal = obtenerVersionFinal();
    db.pragma(`user_version = ${versionFinal}`);
    loggerMigracion(`Proceso de migración finalizado exitosamente. Versión actual de esquema: ${versionFinal}`);

    return { aplicadas: pendientes.length, versionActual: versionFinal };
}

module.exports = {
    ejecutarMigracionesSeguras,
    MIGRACIONES
};

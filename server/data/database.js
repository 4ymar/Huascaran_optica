const path     = require('path');
const fs       = require('fs');
const _dbT0 = Date.now();
function _dbMark(label) {
    const linea = `[${new Date().toISOString()}] [DB-STARTUP] ${label}: ${Date.now() - _dbT0}ms\n`;
    console.log(linea.trim());
    if (process.env.LOG_PATH) { try { fs.appendFileSync(process.env.LOG_PATH, linea); } catch (_) {} }
}
_dbMark('antes de require(better-sqlite3)');
const Database = require('better-sqlite3');
_dbMark('despues de require(better-sqlite3)');

// ── Ruta de la BD: usa DB_PATH si viene de Electron, si no usa la local ───────
const dbPath = process.env.DB_PATH || path.join(__dirname, 'inventario.db');

// ── Crear carpeta si no existe (necesario en máquinas nuevas) ─────────────────
const dirPath = path.dirname(dbPath);
if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
}

// ── Conexión única (singleton) ────────────────────────────────────────────────
_dbMark('antes de new Database(dbPath)');
const db = new Database(dbPath);
_dbMark('despues de new Database(dbPath)');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
_dbMark('pragmas aplicados');

const { ejecutarMigracionesSeguras, MIGRACIONES } = require('./migrador');

function tablaExiste(nombre) {
    return Boolean(
        db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(nombre)
    );
}

const CATEGORIAS_DEFAULT = [
    { nombre: 'General',            icono: '📦', orden: 0  },
    { nombre: 'Herramientas',        icono: '🔧', orden: 1  },
    { nombre: 'Construcción',        icono: '🧱', orden: 2  },
    { nombre: 'Electricidad',        icono: '⚡', orden: 3  },
    { nombre: 'Plomería',            icono: '🚿', orden: 4  },
    { nombre: 'Pintura',             icono: '🎨', orden: 5  },
    { nombre: 'Alimentos',           icono: '🍎', orden: 6  },
    { nombre: 'Bebidas',             icono: '🥤', orden: 7  },
    { nombre: 'Limpieza e Higiene',  icono: '🧴', orden: 8  },
    { nombre: 'Ropa y Calzado',      icono: '👕', orden: 9  },
    { nombre: 'Farmacia',            icono: '💊', orden: 10 },
    { nombre: 'Tecnología',          icono: '📱', orden: 11 },
    { nombre: 'Muebles y Hogar',     icono: '🪑', orden: 12 },
    { nombre: 'Jardinería',          icono: '🌱', orden: 13 },
    { nombre: 'Mascotas',            icono: '🐾', orden: 14 },
    { nombre: 'Útiles y Papelería',  icono: '📚', orden: 15 },
    { nombre: 'Restaurante',         icono: '🍽️', orden: 16 },
    { nombre: 'Salud y Belleza',     icono: '💈', orden: 17 },
    { nombre: 'Seguridad',           icono: '🔒', orden: 18 },
    { nombre: 'Destacados',          icono: '⭐', orden: 19 },
];

const UNIDADES_DEFAULT = [
    { nombre: 'unidad', orden: 0 },
    { nombre: 'kg',     orden: 1 },
    { nombre: 'metro',  orden: 2 },
    { nombre: 'litro',  orden: 3 },
    { nombre: 'galon',  orden: 4 },
    { nombre: 'rollo',  orden: 5 },
    { nombre: 'bolsa',  orden: 6 },
    { nombre: 'caja',   orden: 7 },
    { nombre: 'par',    orden: 8 },
    { nombre: 'juego',  orden: 9 },
    { nombre: 'millar', orden: 10 },
    { nombre: 'm3',     orden: 11 },
    { nombre: 'varilla',orden: 12 },
];

// ══════════════════════════════════════════════════════════════════════════════
//  AUTO-MIGRACIÓN: crea las tablas si no existen (BD nueva o vacía)
//  Usa CREATE TABLE IF NOT EXISTS → seguro de ejecutar siempre al arrancar.
// ══════════════════════════════════════════════════════════════════════════════
function inicializarBaseDeDatos() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS clientes (
            id_cliente          TEXT PRIMARY KEY,
            tipo_cliente        TEXT NOT NULL,
            nombre_razon_social TEXT NOT NULL,
            tipo_documento      TEXT,
            numero_documento    TEXT,
            direccion           TEXT,
            telefono            TEXT,
            email               TEXT,
            estado              INTEGER NOT NULL DEFAULT 1,
            fecha_registro      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS productos (
            id_producto          TEXT PRIMARY KEY,
            sku                  TEXT NOT NULL UNIQUE,
            nombre               TEXT NOT NULL,
            categoria            TEXT,
            unidad_medida        TEXT,
            precio_compra        REAL NOT NULL DEFAULT 0,
            precio_venta         REAL NOT NULL DEFAULT 0,
            stock_actual         REAL NOT NULL DEFAULT 0,
            stock_minimo         REAL NOT NULL DEFAULT 0,
            descripcion          TEXT DEFAULT '',
            imagen_url           TEXT DEFAULT '',
            estado               INTEGER NOT NULL DEFAULT 1,
            fecha_creacion       TEXT NOT NULL,
            fecha_actualizacion  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ventas (
            id_venta            TEXT PRIMARY KEY,
            numero_venta        TEXT NOT NULL,
            fecha_hora          TEXT NOT NULL,
            id_cliente          TEXT,
            tipo_comprobante    TEXT NOT NULL,
            numero_comprobante  TEXT,
            subtotal            REAL NOT NULL DEFAULT 0,
            igv                 REAL NOT NULL DEFAULT 0,
            descuento           REAL NOT NULL DEFAULT 0,
            total               REAL NOT NULL DEFAULT 0,
            forma_pago          TEXT NOT NULL,
            estado              TEXT NOT NULL DEFAULT 'ACTIVA',
            usuario             TEXT,
            notas               TEXT,
            FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente)
        );

        CREATE TABLE IF NOT EXISTS detalle_ventas (
            id_detalle       TEXT PRIMARY KEY,
            id_venta         TEXT NOT NULL,
            id_producto      TEXT NOT NULL,
            nombre_producto  TEXT NOT NULL,
            cantidad         REAL NOT NULL,
            precio_unitario  REAL NOT NULL,
            descuento_linea  REAL NOT NULL DEFAULT 0,
            subtotal_linea   REAL NOT NULL,
            FOREIGN KEY (id_venta)    REFERENCES ventas(id_venta),
            FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
        );

        CREATE TABLE IF NOT EXISTS compras (
            id_compra       TEXT PRIMARY KEY,
            numero_oc       TEXT NOT NULL,
            fecha_hora      TEXT NOT NULL,
            proveedor       TEXT NOT NULL,
            ruc_proveedor   TEXT,
            doc_proveedor   TEXT,
            subtotal        REAL NOT NULL DEFAULT 0,
            igv             REAL NOT NULL DEFAULT 0,
            total           REAL NOT NULL DEFAULT 0,
            estado          TEXT NOT NULL DEFAULT 'ACTIVA',
            usuario         TEXT,
            notas           TEXT
        );

        CREATE TABLE IF NOT EXISTS detalle_compras (
            id_detalle      TEXT PRIMARY KEY,
            id_compra       TEXT NOT NULL,
            id_producto     TEXT NOT NULL,
            nombre_producto TEXT NOT NULL,
            cantidad        REAL NOT NULL,
            precio_unitario REAL NOT NULL,
            subtotal_linea  REAL NOT NULL,
            FOREIGN KEY (id_compra)   REFERENCES compras(id_compra),
            FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
        );

        CREATE TABLE IF NOT EXISTS movimientos (
            id_movimiento   TEXT PRIMARY KEY,
            fecha_hora      TEXT NOT NULL,
            id_producto     TEXT NOT NULL,
            nombre_producto TEXT NOT NULL,
            tipo_movimiento TEXT NOT NULL,
            cantidad        REAL NOT NULL,
            stock_anterior  REAL NOT NULL,
            stock_nuevo     REAL NOT NULL,
            referencia      TEXT,
            motivo          TEXT,
            usuario         TEXT,
            id_almacen      TEXT,
            FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
            FOREIGN KEY (id_almacen)  REFERENCES almacenes(id_almacen)
        );

        CREATE TABLE IF NOT EXISTS config (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS creditos (
            id_credito        TEXT PRIMARY KEY,
            id_cliente        TEXT NOT NULL,
            id_venta          TEXT,
            monto_total       REAL NOT NULL DEFAULT 0,
            estado            TEXT NOT NULL DEFAULT 'PENDIENTE',
            fecha_vencimiento TEXT,
            notas             TEXT DEFAULT '',
            fecha_creacion    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS abonos (
            id_abono       TEXT PRIMARY KEY,
            id_credito     TEXT NOT NULL,
            monto_abonado  REAL NOT NULL,
            fecha_abono    TEXT NOT NULL,
            medio_pago     TEXT DEFAULT 'EFECTIVO',
            notas          TEXT DEFAULT '',
            fecha_creacion TEXT NOT NULL,
            FOREIGN KEY (id_credito) REFERENCES creditos(id_credito)
        );

        CREATE TABLE IF NOT EXISTS sesiones_caja (
            id_sesion         TEXT PRIMARY KEY,
            usuario           TEXT NOT NULL,
            fecha_apertura    TEXT NOT NULL,
            monto_apertura    REAL NOT NULL DEFAULT 0,
            fecha_cierre      TEXT,
            monto_cierre_real REAL,
            monto_esperado    REAL,
            diferencia        REAL,
            total_ventas      REAL NOT NULL DEFAULT 0,
            total_efectivo    REAL NOT NULL DEFAULT 0,
            total_tarjeta     REAL NOT NULL DEFAULT 0,
            total_yape_plin   REAL NOT NULL DEFAULT 0,
            total_otros       REAL NOT NULL DEFAULT 0,
            cantidad_ventas   INTEGER NOT NULL DEFAULT 0,
            notas_cierre      TEXT DEFAULT '',
            estado            TEXT NOT NULL DEFAULT 'ABIERTA'
        );

        CREATE TABLE IF NOT EXISTS movimientos_caja (
            id_movimiento_caja TEXT PRIMARY KEY,
            id_sesion          TEXT NOT NULL,
            tipo               TEXT NOT NULL,
            monto              REAL NOT NULL,
            concepto           TEXT NOT NULL,
            fecha_hora         TEXT NOT NULL,
            usuario            TEXT NOT NULL,
            medio_pago         TEXT NOT NULL DEFAULT 'EFECTIVO',
            referencia_tipo    TEXT,
            FOREIGN KEY (id_sesion) REFERENCES sesiones_caja(id_sesion)
        );

        CREATE TABLE IF NOT EXISTS usuarios (
            id_usuario      TEXT PRIMARY KEY,
            username        TEXT UNIQUE NOT NULL,
            password_hash   TEXT NOT NULL,
            nombre_completo TEXT NOT NULL,
            rol             TEXT NOT NULL CHECK(rol IN ('ADMIN', 'CAJERO', 'ENCARGADO_ALMACEN')),
            estado          TEXT NOT NULL DEFAULT 'ACTIVO' CHECK(estado IN ('ACTIVO', 'INACTIVO')),
            fecha_creacion  TEXT NOT NULL,
            token_version   INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS logs (
            id_log          TEXT PRIMARY KEY,
            fecha_hora      TEXT NOT NULL,
            usuario         TEXT NOT NULL,
            accion          TEXT NOT NULL,
            modulo          TEXT NOT NULL,
            detalles        TEXT,
            ip              TEXT
        );

        CREATE TABLE IF NOT EXISTS cpe_eventos (
            id_evento     TEXT PRIMARY KEY,
            id_venta      TEXT NOT NULL,
            operacion     TEXT NOT NULL,
            estado        TEXT NOT NULL,
            request_json  TEXT,
            response_json TEXT,
            mensaje       TEXT,
            usuario       TEXT,
            fecha_hora    TEXT NOT NULL,
            FOREIGN KEY (id_venta) REFERENCES ventas(id_venta)
        );

        CREATE TABLE IF NOT EXISTS cpe_documentos (
            id_cpe             TEXT PRIMARY KEY,
            id_venta           TEXT NOT NULL,
            proveedor          TEXT NOT NULL DEFAULT 'nubefact',
            tipo_comprobante   TEXT NOT NULL,
            serie              TEXT NOT NULL,
            numero             TEXT NOT NULL,
            estado             TEXT NOT NULL DEFAULT 'POR_EMITIR',
            codigo_hash        TEXT DEFAULT '',
            enlace_pdf         TEXT DEFAULT '',
            enlace_xml         TEXT DEFAULT '',
            enlace_cdr         TEXT DEFAULT '',
            request_json       TEXT,
            response_json      TEXT,
            ultimo_error       TEXT DEFAULT '',
            intentos           INTEGER NOT NULL DEFAULT 0,
            fecha_creacion     TEXT NOT NULL,
            fecha_actualizacion TEXT NOT NULL,
            fecha_aceptacion   TEXT,
            usuario            TEXT,
            UNIQUE (proveedor, tipo_comprobante, serie, numero),
            FOREIGN KEY (id_venta) REFERENCES ventas(id_venta)
        );

        CREATE TABLE IF NOT EXISTS almacenes (
            id_almacen     TEXT PRIMARY KEY,
            nombre         TEXT NOT NULL,
            descripcion    TEXT DEFAULT '',
            es_principal   INTEGER NOT NULL DEFAULT 0,
            estado         INTEGER NOT NULL DEFAULT 1,
            fecha_creacion TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_almacen (
            id_almacen    TEXT NOT NULL,
            id_producto   TEXT NOT NULL,
            stock_actual  REAL NOT NULL DEFAULT 0,
            stock_minimo  REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (id_almacen, id_producto),
            FOREIGN KEY (id_almacen) REFERENCES almacenes(id_almacen),
            FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
        );

        CREATE TABLE IF NOT EXISTS devoluciones (
            id_devolucion TEXT PRIMARY KEY,
            id_venta      TEXT NOT NULL,
            fecha_hora    TEXT NOT NULL,
            motivo        TEXT NOT NULL,
            total         REAL NOT NULL DEFAULT 0,
            usuario       TEXT,
            requiere_nota_credito INTEGER NOT NULL DEFAULT 0,
            estado        TEXT NOT NULL DEFAULT 'REGISTRADA',
            FOREIGN KEY (id_venta) REFERENCES ventas(id_venta)
        );

        CREATE TABLE IF NOT EXISTS detalle_devoluciones (
            id_detalle       TEXT PRIMARY KEY,
            id_devolucion    TEXT NOT NULL,
            id_detalle_venta TEXT NOT NULL,
            id_producto      TEXT NOT NULL,
            nombre_producto  TEXT NOT NULL,
            cantidad         REAL NOT NULL,
            precio_unitario  REAL NOT NULL,
            subtotal_linea   REAL NOT NULL,
            FOREIGN KEY (id_devolucion) REFERENCES devoluciones(id_devolucion),
            FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
        );

        CREATE TABLE IF NOT EXISTS proveedores (
            id_proveedor   TEXT PRIMARY KEY,
            razon_social   TEXT NOT NULL,
            ruc            TEXT,
            direccion      TEXT DEFAULT '',
            telefono       TEXT DEFAULT '',
            email          TEXT DEFAULT '',
            estado         INTEGER NOT NULL DEFAULT 1,
            fecha_creacion TEXT NOT NULL
        );

        CREATE TRIGGER IF NOT EXISTS prevent_negative_stock
        BEFORE UPDATE ON productos
        WHEN NEW.stock_actual < 0
        BEGIN
            SELECT RAISE(ABORT, 'Stock insuficiente o negativo');
        END;

        CREATE TRIGGER IF NOT EXISTS prevent_negative_stock_almacen
        BEFORE UPDATE ON stock_almacen
        WHEN NEW.stock_actual < 0
        BEGIN
            SELECT RAISE(ABORT, 'Stock en almacén insuficiente o negativo');
        END;

        CREATE TABLE IF NOT EXISTS categorias (
            id_categoria   INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre         TEXT NOT NULL UNIQUE,
            icono          TEXT NOT NULL DEFAULT '📦',
            activo         INTEGER NOT NULL DEFAULT 1,
            orden          INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS unidades (
            id_unidad INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre    TEXT NOT NULL UNIQUE,
            activo    INTEGER NOT NULL DEFAULT 1,
            orden     INTEGER NOT NULL DEFAULT 0
        );
    `);

    // ── Poblar config base si la tabla quedó vacía (instalación nueva) ────────
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM config').get();
    if (c === 0) {
        const configInicial = db.prepare(
            `INSERT INTO config (clave, valor) VALUES (@clave, @valor)`
        );
        const defaults = [
            ['empresa_nombre',       'Mi Empresa'],
            ['empresa_nombre_corto', 'Mi Empresa'],
            ['empresa_ruc',          ''],
            ['empresa_direccion',    ''],
            ['empresa_distrito',     ''],
            ['empresa_provincia',    ''],
            ['empresa_departamento', ''],
            ['empresa_telefono',     ''],
            ['empresa_email',        ''],
            ['serie_boleta',         'B001'],
            ['serie_factura',        'F001'],
            ['correlativo_boleta',   '1'],
            ['correlativo_factura',  '1'],
            ['moneda',               'SOLES'],
            ['igv',                  '18'],
            ['sunat_activo',  '0'],
            ['sunat_token',   ''],
            ['sunat_url',     ''],
            ['sunat_modo',    'demo'],
            ['cpe_proveedor', 'nubefact'],
            ['cpe_envio_email_cliente', '1'],
            ['cpe_formato_pdf', 'A4'],
        ];
        db.transaction(() => {
            for (const [clave, valor] of defaults) {
                configInicial.run({ clave, valor });
            }
        })();
        console.log('[DB] Base de datos inicializada con configuración por defecto.');
    }

    // ── Poblar categorías base si la tabla quedó vacía ────────────────────────
    const { cc } = db.prepare('SELECT COUNT(*) AS cc FROM categorias').get();
    if (cc === 0) {
        const insertCat = db.prepare(
            `INSERT INTO categorias (nombre, icono, orden) VALUES (@nombre, @icono, @orden)`
        );
        db.transaction(() => {
            for (const cat of CATEGORIAS_DEFAULT) insertCat.run(cat);
        })();
        console.log('[DB] Categorías por defecto creadas.');
    }

    // ── Poblar unidades base si la tabla quedó vacía ──────────────────────────
    const { cu } = db.prepare('SELECT COUNT(*) AS cu FROM unidades').get();
    if (cu === 0) {
        const insertUnidad = db.prepare(
            `INSERT INTO unidades (nombre, orden) VALUES (@nombre, @orden)`
        );
        db.transaction(() => {
            for (const u of UNIDADES_DEFAULT) insertUnidad.run(u);
        })();
        console.log('[DB] Unidades por defecto creadas.');
    }
    // El administrador inicial se crea desde /api/setup/admin-inicial.
}

// Ejecutar siempre al arrancar — es idempotente (IF NOT EXISTS)
_dbMark('antes de inicializarBaseDeDatos()');
inicializarBaseDeDatos();
_dbMark('despues de inicializarBaseDeDatos()');

// ══════════════════════════════════════════════════════════════════════════════
//  MIGRACIONES SEGURAS, SECUENCIALES Y ATÓMICAS (migrador.js)
// ══════════════════════════════════════════════════════════════════════════════
_dbMark('antes de ejecutarMigracionesSeguras()');
ejecutarMigracionesSeguras(db, dbPath);
_dbMark('despues de ejecutarMigracionesSeguras()');

// ── Claves de configuración nuevas (SUNAT/NubeFact/Almacenes) ───────
const configNuevas = [
    ['sunat_activo', '0'],
    ['sunat_token',  ''],
    ['sunat_url',    ''],
    ['sunat_modo',   'demo'],
    ['cpe_proveedor', 'nubefact'],
    ['cpe_formato_pdf', 'A4'],
    ['cpe_envio_email_cliente', '1'],
    ['almacen_principal_id', 'alm-principal'],
    ['almacen_tienda_id', 'alm-principal'],
    ['almacen_deposito_id', ''],
    ['backup_externo_dir', ''],
    ['backup_externo_activo', '0'],
];
const insConfig = db.prepare(`INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)`);
for (const [clave, valor] of configNuevas) {
    insConfig.run(clave, valor);
}

// Crea "Tienda" y "Almacén" (Depósito) si no existen, y sincroniza su stock inicial.
function asegurarAlmacenesPorDefecto() {
    db.transaction(() => {
        // 1. Renombrar "Tienda Principal" a "Tienda" si existe
        const principal = db.prepare(`SELECT * FROM almacenes WHERE id_almacen = ?`).get('alm-principal');
        if (!principal) {
            db.prepare(`
                INSERT INTO almacenes (id_almacen, nombre, descripcion, es_principal, estado, fecha_creacion)
                VALUES ('alm-principal', 'Tienda', 'Punto de venta', 1, 1, ?)
            `).run(new Date().toISOString());
        } else if (principal.nombre === 'Tienda Principal') {
            db.prepare(`UPDATE almacenes SET nombre = 'Tienda' WHERE id_almacen = 'alm-principal'`).run();
        }
        db.prepare(`INSERT OR REPLACE INTO config (clave, valor) VALUES ('almacen_tienda_id', 'alm-principal')`).run();

        // 2. Crear almacén nuevo "Almacén" (Depósito) si no existe
        let depositoRow = db.prepare(`SELECT valor FROM config WHERE clave = 'almacen_deposito_id'`).get();
        let depositoId = depositoRow ? depositoRow.valor : '';
        if (!depositoId) {
            const existeDep = db.prepare(`SELECT id_almacen FROM almacenes WHERE nombre = 'Almacén' AND es_principal = 0`).get();
            if (existeDep) {
                depositoId = existeDep.id_almacen;
            } else {
                depositoId = require('crypto').randomUUID();
                db.prepare(`
                    INSERT INTO almacenes (id_almacen, nombre, descripcion, es_principal, estado, fecha_creacion)
                    VALUES (?, 'Almacén', 'Depósito de mercadería', 0, 1, ?)
                `).run(depositoId, new Date().toISOString());
            }
            db.prepare(`INSERT OR REPLACE INTO config (clave, valor) VALUES ('almacen_deposito_id', ?)`).run(depositoId);
        }

        const productosStock = db.prepare(`SELECT id_producto, stock_actual, stock_minimo FROM productos`).all();
        const insStock = db.prepare(`
            INSERT OR IGNORE INTO stock_almacen (id_almacen, id_producto, stock_actual, stock_minimo)
            VALUES ('alm-principal', @id_producto, @stock_actual, @stock_minimo)
        `);
        for (const p of productosStock) insStock.run(p);
    })();
}
asegurarAlmacenesPorDefecto();
_dbMark('FIN inicializacion y migraciones');

// ══════════════════════════════════════════════════════════════════════════════
//  PRODUCTOS
// ══════════════════════════════════════════════════════════════════════════════
const productos = {

  adjuntarStockMultialmacen: (prods) => {
    if (!prods) return prods;
    const esArray = Array.isArray(prods);
    const lista = esArray ? prods : [prods];
    if (lista.length === 0) return esArray ? [] : null;

    const almacenesActivos = db.prepare(
      `SELECT id_almacen, nombre, es_principal FROM almacenes WHERE estado = 1 ORDER BY es_principal DESC, nombre ASC`
    ).all();

    const idsProductos = lista.map(p => p.id_producto);
    const placeholders = idsProductos.map(() => '?').join(',');
    const stocks = db.prepare(
      `SELECT id_almacen, id_producto, stock_actual FROM stock_almacen WHERE id_producto IN (${placeholders})`
    ).all(...idsProductos);

    const stockMap = {};
    for (const s of stocks) {
      if (!stockMap[s.id_producto]) stockMap[s.id_producto] = {};
      stockMap[s.id_producto][s.id_almacen] = s.stock_actual;
    }

    const tiendaId = config.obtener('almacen_tienda_id') || config.obtener('almacen_principal_id') || 'alm-principal';
    const depositoId = config.obtener('almacen_deposito_id') || '';

    for (const p of lista) {
      const pStocks = stockMap[p.id_producto] || {};
      p.stock_por_almacen = almacenesActivos.map(a => ({
        id_almacen: a.id_almacen,
        nombre: a.nombre,
        es_principal: Boolean(a.es_principal),
        stock_actual: pStocks[a.id_almacen] ?? 0,
      }));
      p.stock_tienda = pStocks[tiendaId] ?? 0;
      p.stock_deposito = pStocks[depositoId] ?? 0;
    }

    return esArray ? lista : lista[0];
  },

  listar: ({ limite = null, offset = 0, soloActivos = false } = {}) => {
    let sql = `SELECT * FROM productos WHERE eliminado = 0`;
    if (soloActivos) sql += ` AND estado = 1`;
    sql += ` ORDER BY nombre COLLATE NOCASE ASC`;
    const params = [];
    if (limite != null) { sql += ` LIMIT ? OFFSET ?`; params.push(limite, offset); }
    const rows = db.prepare(sql).all(...params);
    return productos.adjuntarStockMultialmacen(rows);
  },

  buscar: (termino) => {
    const q = `%${termino}%`;
    const rows = db.prepare(`
      SELECT * FROM productos
      WHERE estado = 1 AND eliminado = 0
        AND (nombre LIKE ? OR sku LIKE ? OR codigo_barras LIKE ? OR categoria LIKE ?)
      ORDER BY nombre COLLATE NOCASE ASC
      LIMIT 50
    `).all(q, q, q, q);
    return productos.adjuntarStockMultialmacen(rows);
  },

  obtener: (id) => {
    const p = db.prepare(`SELECT * FROM productos WHERE id_producto = ?`).get(id);
    if (!p) return null;
    return productos.adjuntarStockMultialmacen(p);
  },

  obtenerPorSku: (sku) =>
    db.prepare(`SELECT * FROM productos WHERE sku = ?`).get(sku),

  stockBajo: () =>
    db.prepare(`
      SELECT id_producto, sku, nombre, stock_actual, stock_minimo, categoria
      FROM productos
      WHERE estado = 1 AND eliminado = 0 AND stock_actual <= stock_minimo
      ORDER BY (stock_actual - stock_minimo) ASC
    `).all(),

  crear: (p) => {
    const idAlmacen = p.id_almacen || config.obtener('almacen_principal_id') || 'alm-principal';
    db.transaction(() => {
      db.prepare(`
        INSERT INTO productos
          (id_producto, sku, codigo_barras, nombre, categoria, id_categoria, unidad_medida, precio_compra,
           precio_venta, stock_actual, stock_minimo, descripcion, imagen_url,
           codigo_producto_sunat, tipo_igv, estado, fecha_creacion, fecha_actualizacion)
        VALUES
          (@id_producto, @sku, @codigo_barras, @nombre, @categoria, @id_categoria, @unidad_medida, @precio_compra,
           @precio_venta, @stock_actual, @stock_minimo, @descripcion, @imagen_url,
           @codigo_producto_sunat, @tipo_igv, @estado, @fecha_creacion, @fecha_actualizacion)
      `).run({ ...p, codigo_barras: p.codigo_barras || null, codigo_producto_sunat: p.codigo_producto_sunat || '', tipo_igv: Number(p.tipo_igv) || 1, id_categoria: p.id_categoria ?? null });

      db.prepare(`
        INSERT INTO stock_almacen (id_almacen, id_producto, stock_actual, stock_minimo)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(id_almacen, id_producto) DO UPDATE SET stock_actual = excluded.stock_actual
      `).run(idAlmacen, p.id_producto, Number(p.stock_actual) || 0);
    })();
  },

  actualizar: (p) =>
    db.prepare(`
      UPDATE productos SET
        sku = @sku, codigo_barras = @codigo_barras, nombre = @nombre, categoria = @categoria,
        id_categoria = @id_categoria,
        unidad_medida = @unidad_medida, precio_compra = @precio_compra,
        precio_venta = @precio_venta, stock_minimo = @stock_minimo,
        descripcion = @descripcion, imagen_url = @imagen_url,
        codigo_producto_sunat = @codigo_producto_sunat,
        tipo_igv = @tipo_igv,
        estado = @estado, fecha_actualizacion = @fecha_actualizacion
      WHERE id_producto = @id_producto
    `).run({ ...p, codigo_barras: p.codigo_barras || null, codigo_producto_sunat: p.codigo_producto_sunat || '', tipo_igv: Number(p.tipo_igv) || 1, id_categoria: p.id_categoria ?? null }),

  // Fuente de verdad: stock_almacen. Aplica un delta y mantiene productos.stock_actual sincronizado
  // (mismo patrón que ya usan ventas.registrar / compras.registrar).
  ajustarStock: (id_producto, id_almacen, delta) => {
    db.prepare(`
      INSERT INTO stock_almacen (id_almacen, id_producto, stock_actual, stock_minimo)
      VALUES (?, ?, 0, 0)
      ON CONFLICT(id_almacen, id_producto) DO NOTHING
    `).run(id_almacen, id_producto);
    db.prepare(`
      UPDATE stock_almacen SET stock_actual = stock_actual + ?
      WHERE id_almacen = ? AND id_producto = ?
    `).run(delta, id_almacen, id_producto);
    db.prepare(`
      UPDATE productos SET stock_actual = stock_actual + ?, fecha_actualizacion = datetime('now')
      WHERE id_producto = ?
    `).run(delta, id_producto);
  },

  actualizarStock: (id_producto, stock_nuevo, id_almacen) => {
    const actual = db.prepare(`SELECT stock_actual FROM productos WHERE id_producto = ?`).get(id_producto);
    const delta  = stock_nuevo - (actual ? actual.stock_actual : 0);
    productos.ajustarStock(id_producto, id_almacen || (config.obtener('almacen_principal_id') || 'alm-principal'), delta);
  },

  eliminar: (id_producto) => {
    const enUso = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM detalle_ventas  WHERE id_producto = @id) +
        (SELECT COUNT(*) FROM detalle_compras WHERE id_producto = @id) +
        (SELECT COUNT(*) FROM movimientos     WHERE id_producto = @id) AS c
    `).get({ id: id_producto }).c;

    if (enUso > 0) {
      db.prepare(`UPDATE productos SET eliminado = 1 WHERE id_producto = ?`).run(id_producto);
      return { fisico: false };
    }

    db.transaction(() => {
      db.prepare(`DELETE FROM stock_almacen WHERE id_producto = ?`).run(id_producto);
      db.prepare(`DELETE FROM productos WHERE id_producto = ?`).run(id_producto);
    })();
    return { fisico: true };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
//  CLIENTES
// ══════════════════════════════════════════════════════════════════════════════
const clientes = {

  listar: () =>
    db.prepare(`
      SELECT id_cliente, tipo_cliente, nombre_razon_social,
             tipo_documento, numero_documento, telefono, estado
      FROM clientes WHERE eliminado = 0 ORDER BY nombre_razon_social ASC
    `).all(),

  buscar: (termino) =>
    db.prepare(`
      SELECT id_cliente, nombre_razon_social, tipo_documento, numero_documento, telefono
      FROM clientes
      WHERE estado = 1 AND eliminado = 0
        AND (nombre_razon_social LIKE @q OR numero_documento LIKE @q)
      LIMIT 20
    `).all({ q: `%${termino}%` }),

  obtener: (id) =>
    db.prepare(`SELECT * FROM clientes WHERE id_cliente = ?`).get(id),

  crear: (c) =>
    db.prepare(`
      INSERT INTO clientes
        (id_cliente, tipo_cliente, nombre_razon_social, tipo_documento,
         numero_documento, direccion, telefono, email, estado, fecha_registro,
         fecha_nacimiento, sexo, ocupacion, observaciones)
      VALUES
        (@id_cliente, @tipo_cliente, @nombre_razon_social, @tipo_documento,
         @numero_documento, @direccion, @telefono, @email, @estado, @fecha_registro,
         @fecha_nacimiento, @sexo, @ocupacion, @observaciones)
    `).run({
      ...c,
      fecha_nacimiento: c.fecha_nacimiento ?? null,
      sexo:             c.sexo ?? null,
      ocupacion:        c.ocupacion ?? null,
      observaciones:    c.observaciones ?? null,
    }),

  actualizar: (c) =>
    db.prepare(`
      UPDATE clientes SET
        tipo_cliente = @tipo_cliente, nombre_razon_social = @nombre_razon_social,
        tipo_documento = @tipo_documento, numero_documento = @numero_documento,
        direccion = @direccion, telefono = @telefono,
        email = @email, estado = @estado,
        fecha_nacimiento = @fecha_nacimiento, sexo = @sexo,
        ocupacion = @ocupacion, observaciones = @observaciones
      WHERE id_cliente = @id_cliente
    `).run({
      ...c,
      fecha_nacimiento: c.fecha_nacimiento ?? null,
      sexo:             c.sexo ?? null,
      ocupacion:        c.ocupacion ?? null,
      observaciones:    c.observaciones ?? null,
    }),

  eliminar: (id_cliente) => {
    const enUso = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM ventas          WHERE id_cliente = @id) +
        (SELECT COUNT(*) FROM creditos        WHERE id_cliente = @id) +
        (SELECT COUNT(*) FROM recetas         WHERE id_cliente = @id) +
        (SELECT COUNT(*) FROM ordenes_trabajo WHERE id_cliente = @id) AS c
    `).get({ id: id_cliente }).c;

    if (enUso > 0) {
      db.prepare(`UPDATE clientes SET eliminado = 1 WHERE id_cliente = ?`).run(id_cliente);
      return { fisico: false };
    }

    db.prepare(`DELETE FROM clientes WHERE id_cliente = ?`).run(id_cliente);
    return { fisico: true };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
//  VENTAS
// ══════════════════════════════════════════════════════════════════════════════
const ventas = {

  listar: ({ limite = 50, offset = 0 } = {}) => {
      const ventas = db.prepare(`
          SELECT v.*,
                c.nombre_razon_social  AS cliente_nombre,
                c.tipo_documento       AS cliente_tipo_doc,
                c.numero_documento     AS cliente_num_doc,
                c.tipo_cliente         AS cliente_tipo
          FROM ventas v
          LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
          ORDER BY v.fecha_hora DESC
          LIMIT @limite OFFSET @offset
      `).all({ limite, offset });

      ventas.forEach(v => {
          const detalles = db.prepare(`
              SELECT nombre_producto, cantidad FROM detalle_ventas WHERE id_venta = ?
          `).all(v.id_venta);
          v.productos_resumen = detalles.map(d => `${d.nombre_producto} x${d.cantidad}`).join(' | ');
          v.cliente = v.id_cliente ? {
              nombre_razon_social: v.cliente_nombre,
              tipo_documento:      v.cliente_tipo_doc,
              numero_documento:    v.cliente_num_doc,
          } : null;
      });

      return ventas;
  },

  obtener: (id) => {
      const venta = db.prepare(`
          SELECT v.*,
                 nc.enlace_pdf AS nota_credito_enlace_pdf,
                 nc.codigo_hash AS nota_credito_hash
          FROM ventas v
          LEFT JOIN cpe_documentos nc
              ON nc.id_venta = v.id_venta
             AND nc.tipo_comprobante = 'NOTA_CREDITO'
             AND nc.fecha_creacion = (
                  SELECT MAX(fecha_creacion) FROM cpe_documentos
                  WHERE id_venta = v.id_venta AND tipo_comprobante = 'NOTA_CREDITO'
             )
          WHERE v.id_venta = ?
      `).get(id);
      if (!venta) return null;
      if (venta.forma_pago === 'CREDITO') {
          const credito = db.prepare(`SELECT * FROM creditos WHERE id_venta = ? LIMIT 1`).get(id) || null;
          if (credito) {
              const abonos = db.prepare(`SELECT * FROM abonos WHERE id_credito = ? ORDER BY fecha_abono ASC`).all(credito.id_credito);
              const totalAbonado = abonos.reduce((sum, a) => sum + Number(a.monto_abonado), 0);
              const adelanto = abonos.find(a => a.notas === 'Adelanto al momento de la venta') || null;
              venta.credito = {
                  ...credito,
                  total_abonado:       Math.round(totalAbonado * 100) / 100,
                  saldo_pendiente:     Math.round((credito.monto_total - totalAbonado) * 100) / 100,
                  monto_adelanto:      adelanto ? Number(adelanto.monto_abonado) : 0,
                  medio_pago_adelanto: adelanto ? adelanto.medio_pago : null,
              };
          }
      }
      return venta;
  },

  obtenerDetalle: (id_venta) =>
    db.prepare(`SELECT * FROM detalle_ventas WHERE id_venta = ?`).all(id_venta),

  /**
   * Registra una venta completa (venta + detalle + stock + movimientos)
   * NOTA: monto_tarjeta ya no se usa, se guarda como 0 siempre.
   */
  registrar: db.transaction((venta, detalles) => {
    const idAlmacen = config.obtener('almacen_tienda_id') || config.obtener('almacen_principal_id') || 'alm-principal';
    venta.id_almacen = idAlmacen;
    // ── Validar stock DENTRO de la transacción para evitar race conditions ──
    for (const d of detalles) {
      const prod = db.prepare(
        `SELECT stock_actual, nombre FROM productos WHERE id_producto = ?`
      ).get(d.id_producto);
      if (!prod) throw new Error(`Producto no encontrado: ${d.id_producto}`);
      const stockAlmacen = db.prepare(
        `SELECT stock_actual FROM stock_almacen WHERE id_almacen = ? AND id_producto = ?`
      ).get(idAlmacen, d.id_producto);
      const disponible = stockAlmacen ? Number(stockAlmacen.stock_actual) : 0;
      if (disponible < d.cantidad) {
        throw new Error(`Stock insuficiente para ${prod.nombre}. Disponible: ${disponible}`);
      }
    }

    db.prepare(`
      INSERT INTO ventas
        (id_venta, numero_venta, fecha_hora, id_cliente, tipo_comprobante,
         numero_comprobante, subtotal, igv, descuento, total,
         forma_pago, monto_efectivo, monto_tarjeta, monto_yape_plin,
         estado, usuario, notas, id_sesion_caja, id_almacen)
      VALUES
        (@id_venta, @numero_venta, @fecha_hora, @id_cliente, @tipo_comprobante,
         @numero_comprobante, @subtotal, @igv, @descuento, @total,
         @forma_pago, @monto_efectivo, 0, @monto_yape_plin,
         @estado, @usuario, @notas, @id_sesion_caja, @id_almacen)
    `).run(venta);

    const insDetalle = db.prepare(`
      INSERT INTO detalle_ventas
        (id_detalle, id_venta, id_producto, nombre_producto,
         cantidad, precio_unitario, descuento_linea, subtotal_linea, costo_unitario)
      VALUES
        (@id_detalle, @id_venta, @id_producto, @nombre_producto,
         @cantidad, @precio_unitario, @descuento_linea, @subtotal_linea, @costo_unitario)
    `);

    const insMov = db.prepare(`
      INSERT INTO movimientos
        (id_movimiento, fecha_hora, id_producto, nombre_producto,
         tipo_movimiento, cantidad, stock_anterior, stock_nuevo,
         referencia, motivo, usuario, id_almacen)
      VALUES
        (@id_movimiento, @fecha_hora, @id_producto, @nombre_producto,
         @tipo_movimiento, @cantidad, @stock_anterior, @stock_nuevo,
         @referencia, @motivo, @usuario, @id_almacen)
    `);

    for (const d of detalles) {
      insDetalle.run(d);

      const prod = db.prepare(
        `SELECT stock_actual FROM productos WHERE id_producto = ?`
      ).get(d.id_producto);

      const stock_anterior = prod ? prod.stock_actual : 0;
      productos.ajustarStock(d.id_producto, idAlmacen, -d.cantidad);

      const prodNuevo = db.prepare(
        `SELECT stock_actual FROM productos WHERE id_producto = ?`
      ).get(d.id_producto);
      const stock_nuevo = prodNuevo ? prodNuevo.stock_actual : stock_anterior - d.cantidad;

      insMov.run({
        id_movimiento  : d.id_detalle + '-mov',
        fecha_hora     : venta.fecha_hora,
        id_producto    : d.id_producto,
        nombre_producto: d.nombre_producto,
        tipo_movimiento: 'SALIDA',
        cantidad       : d.cantidad,
        stock_anterior,
        stock_nuevo,
        referencia     : venta.numero_venta,
        motivo         : '',
        usuario        : venta.usuario,
        id_almacen     : idAlmacen,
      });
    }

    return { ok: true, id_venta: venta.id_venta };
  }),

  resumenDiario: (dias = 30) =>
    db.prepare(`
      SELECT DATE(fecha_hora) AS dia,
             COUNT(*)         AS cantidad,
             SUM(total)       AS total
      FROM ventas
      WHERE estado = 'ACTIVA'
        AND fecha_hora >= DATE('now', '-' || @dias || ' days')
      GROUP BY dia
      ORDER BY dia DESC
    `).all({ dias }),
};

// ══════════════════════════════════════════════════════════════════════════════
//  COMPRAS
// ══════════════════════════════════════════════════════════════════════════════
const compras = {

  listar: ({ limite = 50, offset = 0 } = {}) =>
    db.prepare(`
      SELECT id_compra, numero_oc, fecha_hora, id_proveedor, proveedor, ruc_proveedor,
             doc_proveedor, subtotal, igv, total, estado, notas, id_almacen
      FROM compras
      ORDER BY fecha_hora DESC
      LIMIT @limite OFFSET @offset
    `).all({ limite, offset }),

  obtener: (id) =>
    db.prepare(`SELECT * FROM compras WHERE id_compra = ?`).get(id),

  obtenerDetalle: (id_compra) =>
    db.prepare(`
      SELECT dc.*, p.sku
      FROM detalle_compras dc
      LEFT JOIN productos p ON p.id_producto = dc.id_producto
      WHERE dc.id_compra = ?
    `).all(id_compra),

  registrar: db.transaction((compra, detalles) => {
    const idAlmacen = compra.id_almacen || config.obtener('almacen_deposito_id') || config.obtener('almacen_principal_id') || 'alm-principal';
    compra.id_almacen = idAlmacen;
    db.prepare(`
      INSERT INTO compras
        (id_compra, numero_oc, fecha_hora, id_proveedor, proveedor, ruc_proveedor,
         doc_proveedor, subtotal, igv, total, estado, usuario, notas, id_almacen)
      VALUES
        (@id_compra, @numero_oc, @fecha_hora, @id_proveedor, @proveedor, @ruc_proveedor,
         @doc_proveedor, @subtotal, @igv, @total, @estado, @usuario, @notas, @id_almacen)
    `).run(compra);

    const insDetalle = db.prepare(`
      INSERT INTO detalle_compras
        (id_detalle, id_compra, id_producto, nombre_producto,
         cantidad, precio_unitario, subtotal_linea)
      VALUES
        (@id_detalle, @id_compra, @id_producto, @nombre_producto,
         @cantidad, @precio_unitario, @subtotal_linea)
    `);

    const insMov = db.prepare(`
      INSERT INTO movimientos
        (id_movimiento, fecha_hora, id_producto, nombre_producto,
         tipo_movimiento, cantidad, stock_anterior, stock_nuevo,
         referencia, motivo, usuario, id_almacen)
      VALUES
        (@id_movimiento, @fecha_hora, @id_producto, @nombre_producto,
         @tipo_movimiento, @cantidad, @stock_anterior, @stock_nuevo,
         @referencia, @motivo, @usuario, @id_almacen)
    `);

    for (const d of detalles) {
      insDetalle.run(d);

      const prod = db.prepare(
        `SELECT stock_actual FROM productos WHERE id_producto = ?`
      ).get(d.id_producto);

      const stock_anterior = prod ? prod.stock_actual : 0;
      productos.ajustarStock(d.id_producto, idAlmacen, d.cantidad);

      const prodNuevo = db.prepare(
        `SELECT stock_actual FROM productos WHERE id_producto = ?`
      ).get(d.id_producto);
      const stock_nuevo = prodNuevo ? prodNuevo.stock_actual : stock_anterior + d.cantidad;

      insMov.run({
        id_movimiento  : d.id_detalle + '-mov',
        fecha_hora     : compra.fecha_hora,
        id_producto    : d.id_producto,
        nombre_producto: d.nombre_producto,
        tipo_movimiento: 'ENTRADA',
        cantidad       : d.cantidad,
        stock_anterior,
        stock_nuevo,
        referencia     : compra.numero_oc,
        motivo         : '',
        usuario        : compra.usuario,
        id_almacen     : idAlmacen,
      });
    }
    return { ok: true };
  }),

  editar: db.transaction((id_compra, cambios, nuevosDetalles) => {
    const compraActual = db.prepare(`SELECT * FROM compras WHERE id_compra = ?`).get(id_compra);
    if (!compraActual) throw new Error('Compra no encontrada');
    if (compraActual.estado !== 'ACTIVA') throw new Error('Solo se puede editar una compra ACTIVA');

    const idAlmacen = compraActual.id_almacen || config.obtener('almacen_principal_id') || 'alm-principal';
    const detallesAnteriores = db.prepare(`SELECT * FROM detalle_compras WHERE id_compra = ?`).all(id_compra);
    const cantidadAnteriorPorProducto = {};
    for (const d of detallesAnteriores) {
      cantidadAnteriorPorProducto[d.id_producto] = (cantidadAnteriorPorProducto[d.id_producto] || 0) + d.cantidad;
    }

    const cantidadNuevaPorProducto = {};
    for (const it of nuevosDetalles) {
      cantidadNuevaPorProducto[it.id_producto] = (cantidadNuevaPorProducto[it.id_producto] || 0) + it.cantidad;
    }

    const idsAfectados = new Set([...Object.keys(cantidadAnteriorPorProducto), ...Object.keys(cantidadNuevaPorProducto)]);

    // Validar stock disponible ANTES de aplicar ningún cambio
    for (const id_producto of idsAfectados) {
      const antes = cantidadAnteriorPorProducto[id_producto] || 0;
      const ahora = cantidadNuevaPorProducto[id_producto] || 0;
      const delta = ahora - antes;
      if (delta < 0) {
        const prod = db.prepare(`SELECT nombre, stock_actual FROM productos WHERE id_producto = ?`).get(id_producto);
        if (prod && (prod.stock_actual + delta) < 0) {
          const yaVendido = antes - prod.stock_actual;
          throw new Error(`No se puede reducir "${prod.nombre}": ya se vendieron/movieron unidades de esta compra (stock actual: ${prod.stock_actual}, reducción solicitada: ${-delta})`);
        }
      }
    }

    const insMov = db.prepare(`
      INSERT INTO movimientos
        (id_movimiento, fecha_hora, id_producto, nombre_producto,
         tipo_movimiento, cantidad, stock_anterior, stock_nuevo,
         referencia, motivo, usuario, id_almacen)
      VALUES
        (@id_movimiento, @fecha_hora, @id_producto, @nombre_producto,
         @tipo_movimiento, @cantidad, @stock_anterior, @stock_nuevo,
         @referencia, @motivo, @usuario, @id_almacen)
    `);
    const ahoraISO = new Date().toISOString();

    for (const id_producto of idsAfectados) {
      const antes = cantidadAnteriorPorProducto[id_producto] || 0;
      const ahora = cantidadNuevaPorProducto[id_producto] || 0;
      const delta = ahora - antes;
      if (delta === 0) continue;

      const prod = db.prepare(`SELECT nombre, stock_actual FROM productos WHERE id_producto = ?`).get(id_producto);
      const stockAnterior = prod ? prod.stock_actual : 0;
      productos.ajustarStock(id_producto, idAlmacen, delta);
      const stockNuevoRow = db.prepare(`SELECT stock_actual FROM productos WHERE id_producto = ?`).get(id_producto);

      insMov.run({
        id_movimiento:   require('crypto').randomUUID(),
        fecha_hora:      ahoraISO,
        id_producto,
        nombre_producto: prod ? prod.nombre : '',
        tipo_movimiento: 'AJUSTE',
        cantidad:        Math.abs(delta),
        stock_anterior:  stockAnterior,
        stock_nuevo:     stockNuevoRow ? stockNuevoRow.stock_actual : stockAnterior + delta,
        referencia:      `EDICION-${compraActual.numero_oc}`,
        motivo:          cambios.motivo_edicion || 'Edición de compra',
        usuario:         cambios.usuario || compraActual.usuario,
        id_almacen:      idAlmacen,
      });
    }

    db.prepare(`DELETE FROM detalle_compras WHERE id_compra = ?`).run(id_compra);
    const insDetalle = db.prepare(`
      INSERT INTO detalle_compras
        (id_detalle, id_compra, id_producto, nombre_producto,
         cantidad, precio_unitario, subtotal_linea)
      VALUES
        (@id_detalle, @id_compra, @id_producto, @nombre_producto,
         @cantidad, @precio_unitario, @subtotal_linea)
    `);
    let subtotalCompra = 0;
    for (const it of nuevosDetalles) {
      subtotalCompra += it.subtotal_linea;
      insDetalle.run(it);
    }
    const igv = Math.round(subtotalCompra * 0.18 * 100) / 100;

    db.prepare(`
      UPDATE compras
      SET proveedor = @proveedor, ruc_proveedor = @ruc_proveedor, doc_proveedor = @doc_proveedor,
          subtotal = @subtotal, igv = @igv, total = @total, notas = @notas
      WHERE id_compra = @id_compra
    `).run({
      id_compra,
      proveedor:     cambios.proveedor,
      ruc_proveedor: cambios.ruc_proveedor,
      doc_proveedor: cambios.doc_proveedor,
      subtotal:      subtotalCompra,
      igv,
      total:         subtotalCompra + igv,
      notas:         compraActual.notas,
    });

    return db.prepare(`SELECT * FROM compras WHERE id_compra = ?`).get(id_compra);
  }),
};

// ══════════════════════════════════════════════════════════════════════════════
//  MOVIMIENTOS
// ══════════════════════════════════════════════════════════════════════════════
const movimientos = {

  listar: ({ limite = 100, offset = 0, id_producto, id_almacen, fecha_desde, fecha_hasta } = {}) => {
    let sql = `
      SELECT m.*, a.nombre AS nombre_almacen
      FROM movimientos m
      LEFT JOIN almacenes a ON a.id_almacen = m.id_almacen
      WHERE 1=1
    `;
    const params = { limite, offset };

    if (id_producto) {
      sql += ` AND m.id_producto = @id_producto`;
      params.id_producto = id_producto;
    }
    if (id_almacen) {
      sql += ` AND m.id_almacen = @id_almacen`;
      params.id_almacen = id_almacen;
    }
    if (fecha_desde) {
      sql += ` AND m.fecha_hora >= @fecha_desde`;
      params.fecha_desde = new Date(fecha_desde + 'T00:00:00.000Z').getTime() - (-300 * 60 * 1000);
      params.fecha_desde = new Date(params.fecha_desde).toISOString();
    }
    if (fecha_hasta) {
      sql += ` AND m.fecha_hora <= @fecha_hasta`;
      params.fecha_hasta = new Date(fecha_hasta + 'T23:59:59.999Z').getTime() - (-300 * 60 * 1000);
      params.fecha_hasta = new Date(params.fecha_hasta).toISOString();
    }

    sql += ` ORDER BY m.fecha_hora DESC LIMIT @limite OFFSET @offset`;
    return db.prepare(sql).all(params);
  },
};

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════════════════════
const config = {

  obtenerTodo: () => {
    const rows = db.prepare(`SELECT clave, valor FROM config`).all();
    return Object.fromEntries(rows.map(r => [r.clave, r.valor]));
  },

  obtener: (clave) => {
    const row = db.prepare(`SELECT valor FROM config WHERE clave = ?`).get(clave);
    return row ? row.valor : null;
  },

  guardar: (clave, valor) =>
    db.prepare(
      `INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)`
    ).run(clave, String(valor)),

  guardarTodo: db.transaction((obj) => {
    const ins = db.prepare(
      `INSERT OR REPLACE INTO config (clave, valor) VALUES (@clave, @valor)`
    );
    for (const [clave, valor] of Object.entries(obj)) {
      ins.run({ clave, valor: String(valor) });
    }
  }),
};

// ══════════════════════════════════════════════════════════════════════════════
//  CAJA — Sesiones de apertura/cierre y movimientos manuales
// ══════════════════════════════════════════════════════════════════════════════
const caja = {

  obtenerSesionAbierta: () =>
    db.prepare(`SELECT * FROM sesiones_caja WHERE estado = 'ABIERTA' LIMIT 1`).get() || null,

  obtenerSesion: (id_sesion) =>
    db.prepare(`SELECT * FROM sesiones_caja WHERE id_sesion = ?`).get(id_sesion),

  listarSesiones: ({ limite = 50, offset = 0 } = {}) =>
    db.prepare(`
      SELECT * FROM sesiones_caja
      ORDER BY fecha_apertura DESC
      LIMIT @limite OFFSET @offset
    `).all({ limite, offset }),

  abrir: (sesion) =>
    db.prepare(`
      INSERT INTO sesiones_caja
        (id_sesion, usuario, fecha_apertura, monto_apertura, estado)
      VALUES
        (@id_sesion, @usuario, @fecha_apertura, @monto_apertura, 'ABIERTA')
    `).run(sesion),

  /**
   * Cierra la sesión activa.
   * total_tarjeta se pasa como 0 — se mantiene la columna por compatibilidad histórica.
   */
  cerrar: (datos) =>
    db.prepare(`
      UPDATE sesiones_caja SET
        fecha_cierre      = @fecha_cierre,
        monto_cierre_real = @monto_cierre_real,
        monto_esperado    = @monto_esperado,
        diferencia        = @diferencia,
        total_ventas      = @total_ventas,
        total_efectivo    = @total_efectivo,
        total_tarjeta     = 0,
        total_yape_plin   = @total_yape_plin,
        total_otros       = @total_otros,
        cantidad_ventas   = @cantidad_ventas,
        notas_cierre      = @notas_cierre,
        estado            = 'CERRADA'
      WHERE id_sesion = @id_sesion
    `).run(datos),

  obtenerVentasDeSesion: (id_sesion) =>
    db.prepare(`
      SELECT v.*, c.nombre_razon_social AS cliente
      FROM ventas v
      LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
      WHERE v.id_sesion_caja = ?
      ORDER BY v.fecha_hora DESC
    `).all(id_sesion),

  /**
   * Calcula los totales de ventas por medio de pago para una sesión.
   * Canales: EFECTIVO, YAPE_PLIN, TRANSFERENCIA (en total_otros), MIXTO.
   */
  calcularTotalesSesion: (id_sesion) => {
    // ── Totales de ventas directas ────────────────────────────────────────
    const ventasRow = db.prepare(`
      SELECT
        COUNT(*)                              AS cantidad_ventas,
        COALESCE(SUM(total), 0)              AS total_ventas,
        COALESCE(SUM(
          CASE
            WHEN monto_efectivo > 0 THEN monto_efectivo
            WHEN forma_pago = 'EFECTIVO' THEN total
            ELSE 0
          END), 0)                            AS total_efectivo,
        COALESCE(SUM(
          CASE
            WHEN monto_yape_plin > 0 THEN monto_yape_plin
            WHEN forma_pago IN ('YAPE_PLIN','YAPE','PLIN') THEN total
            ELSE 0
          END), 0)                            AS total_yape_plin,
        COALESCE(SUM(
          CASE
            WHEN monto_efectivo = 0 AND monto_yape_plin = 0
             AND forma_pago NOT IN ('EFECTIVO','YAPE_PLIN','YAPE','PLIN','CREDITO','MIXTO')
            -- TRANSFERENCIA cae aquí (total_otros)
            THEN total
            ELSE 0
          END), 0)                            AS total_otros
      FROM ventas
      WHERE id_sesion_caja = ? AND estado = 'ACTIVA'
    `).get(id_sesion);

    // ── Abonos de crédito cobrados en esta sesión, desglosados por canal ─
    const abonos = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN mc.medio_pago = 'EFECTIVO'                       THEN mc.monto ELSE 0 END), 0) AS ef,
        COALESCE(SUM(CASE WHEN mc.medio_pago IN ('YAPE_PLIN','YAPE','PLIN')     THEN mc.monto ELSE 0 END), 0) AS yp,
        COALESCE(SUM(CASE WHEN mc.medio_pago NOT IN ('EFECTIVO','YAPE_PLIN','YAPE','PLIN') THEN mc.monto ELSE 0 END), 0) AS ot
      FROM movimientos_caja mc
      WHERE mc.id_sesion = ?
        AND mc.tipo = 'INGRESO'
        AND mc.referencia_tipo = 'ABONO_CREDITO'
    `).get(id_sesion);

    return {
      cantidad_ventas: ventasRow.cantidad_ventas,
      total_ventas:    ventasRow.total_ventas,
      total_efectivo:  ventasRow.total_efectivo  + abonos.ef,
      total_yape_plin: ventasRow.total_yape_plin + abonos.yp,
      total_otros:     ventasRow.total_otros     + abonos.ot,
    };
  },

  // ── Movimientos manuales de caja (ingresos/egresos) ─────────────────

  registrarMovimiento: (mov) =>
    db.prepare(`
      INSERT INTO movimientos_caja
        (id_movimiento_caja, id_sesion, tipo, monto, concepto, medio_pago, referencia_tipo, referencia_id, fecha_hora, usuario)
      VALUES
        (@id_movimiento_caja, @id_sesion, @tipo, @monto, @concepto, @medio_pago, @referencia_tipo, @referencia_id, @fecha_hora, @usuario)
    `).run({ medio_pago: 'EFECTIVO', referencia_tipo: null, referencia_id: null, ...mov }),

  listarMovimientos: (id_sesion) =>
    db.prepare(`
      SELECT * FROM movimientos_caja
      WHERE id_sesion = ?
      ORDER BY fecha_hora ASC
    `).all(id_sesion),

  calcularMovimientosManuales: (id_sesion) => {
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE 0 END), 0) AS total_ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'EGRESO'  THEN monto ELSE 0 END), 0) AS total_egresos
      FROM movimientos_caja
      WHERE id_sesion = ?
        AND (referencia_tipo IS NULL OR referencia_tipo NOT IN ('ABONO_CREDITO','REVERSA_ABONO'))
    `).get(id_sesion);
    return row;
  },
};

// ══════════════════════════════════════════════════════════════════════════════
//  USUARIOS
// ══════════════════════════════════════════════════════════════════════════════
const usuarios = {
  listar: () =>
    db.prepare(`SELECT id_usuario, username, nombre_completo, rol, estado, token_version, fecha_creacion FROM usuarios ORDER BY nombre_completo ASC`).all(),

  obtenerPorId: (id) =>
    db.prepare(`SELECT id_usuario, username, nombre_completo, rol, estado, token_version, fecha_creacion FROM usuarios WHERE id_usuario = ?`).get(id),

  obtenerPorUsernameConPassword: (username) =>
    db.prepare(`SELECT * FROM usuarios WHERE username = ? COLLATE NOCASE`).get(username),

  crear: (u) =>
    db.prepare(`
      INSERT INTO usuarios (id_usuario, username, password_hash, nombre_completo, rol, estado, token_version, fecha_creacion)
      VALUES (@id_usuario, @username, @password_hash, @nombre_completo, @rol, @estado, COALESCE(@token_version, 0), @fecha_creacion)
    `).run({ token_version: 0, ...u }),

  actualizarInfo: (u) =>
    db.prepare(`
      UPDATE usuarios SET
        username = @username,
        nombre_completo = @nombre_completo,
        rol = @rol,
        estado = @estado,
        token_version = token_version + CASE WHEN estado != @estado THEN 1 ELSE 0 END
      WHERE id_usuario = @id_usuario
    `).run(u),

  actualizarPassword: (id_usuario, password_hash) =>
    db.prepare(`UPDATE usuarios SET password_hash = ?, token_version = token_version + 1 WHERE id_usuario = ?`).run(password_hash, id_usuario),
  eliminar: (id_usuario) =>
      db.prepare(`DELETE FROM usuarios WHERE id_usuario = ?`).run(id_usuario),
};

  

// ══════════════════════════════════════════════════════════════════════════════
//  LOGS (AUDITORÍA)
// ══════════════════════════════════════════════════════════════════════════════
const logs = {
  // ── listar ────────────────────────────────────────────────────────────────
  // Parámetros: limite, offset, modulo, usuario, accion, desde, hasta
  // Retorna los registros y un flag hayMas para paginación en el cliente.
  listar: ({ limite = 50, offset = 0, modulo = null, usuario = null, accion = null, desde = null, hasta = null } = {}) => {
    // LEFT JOIN con sesiones_caja cuando el log referencia una sesión (tipo_referencia = 'SESION_CAJA')
    let sql = `
      SELECT
        l.*,
        sc.estado              AS sesion_estado,
        sc.fecha_apertura      AS sesion_apertura,
        sc.fecha_cierre        AS sesion_cierre,
        sc.monto_apertura      AS sesion_monto_apertura,
        sc.monto_cierre_real   AS sesion_monto_cierre,
        sc.diferencia          AS sesion_diferencia,
        sc.cantidad_ventas     AS sesion_cantidad_ventas,
        sc.total_ventas        AS sesion_total_ventas,
        v.numero_venta         AS ref_numero_venta,
        c.nombre_razon_social  AS ref_nombre_cliente,
        c.numero_documento     AS ref_documento_cliente,
        u2.username             AS ref_username,
        u2.nombre_completo      AS ref_nombre_usuario
      FROM logs l
      LEFT JOIN sesiones_caja sc
        ON sc.id_sesion = l.id_referencia
       AND l.tipo_referencia = 'SESION_CAJA'
      LEFT JOIN ventas v
        ON v.id_venta = l.id_referencia
       AND l.tipo_referencia IN ('VENTA', 'DEVOLUCION')
      LEFT JOIN clientes c
        ON c.id_cliente = l.id_referencia
       AND l.tipo_referencia = 'CLIENTE'
      LEFT JOIN usuarios u2
        ON u2.id_usuario = l.id_referencia
       AND l.tipo_referencia = 'USUARIO'
      WHERE 1=1
    `;
    let params = { limite: limite + 1, offset }; // pedimos 1 extra para detectar hayMas

    if (modulo) {
      sql += ` AND l.modulo = @modulo `;
      params.modulo = modulo;
    }

    if (usuario) {
      sql += ` AND l.usuario = @usuario `;
      params.usuario = usuario;
    }

    // M6: filtro por tipo de acción (CREAR / MODIFICAR / ELIMINAR / LOGIN / APERTURA / CIERRE / ANULAR ...)
    if (accion) {
      sql += ` AND l.accion = @accion `;
      params.accion = accion.toUpperCase();
    }

    if (desde) {
      // desde es 'YYYY-MM-DD' hora negocio (UTC-5) → convertir a UTC sumando 5h
      sql += ` AND l.fecha_hora >= @desde `;
      params.desde = desde + 'T05:00:00.000Z';
    }

    if (hasta) {
      // fin del día del negocio (UTC-5): cubre hasta las 04:59:59.999Z del día siguiente
      sql += ` AND l.fecha_hora <= @hasta `;
      const diaFin = new Date(new Date(hasta + 'T05:00:00.000Z').getTime() + 86400000 - 1);
      params.hasta = diaFin.toISOString();
    }

    sql += ` ORDER BY l.fecha_hora DESC LIMIT @limite OFFSET @offset`;

    const rows = db.prepare(sql).all(params);
    const hayMas = rows.length > limite;
    return { logs: hayMas ? rows.slice(0, limite) : rows, hayMas };
  },

  // ── contar ────────────────────────────────────────────────────────────────
  // Cuenta el total de registros sin traerlos (para paginación)
  contar: ({ modulo = null, usuario = null, accion = null, desde = null, hasta = null } = {}) => {
    let sql = `SELECT COUNT(*) AS total FROM logs WHERE 1=1 `;
    let params = {};
    if (modulo)  { sql += ` AND modulo  = @modulo  `; params.modulo  = modulo; }
    if (usuario) { sql += ` AND usuario = @usuario `; params.usuario = usuario; }
    if (accion)  { sql += ` AND accion  = @accion  `; params.accion  = accion.toUpperCase(); }
    if (desde)   { sql += ` AND fecha_hora >= @desde `; params.desde = desde + 'T05:00:00.000Z'; }
    if (hasta)   {
      sql += ` AND fecha_hora <= @hasta `;
      const diaFin = new Date(new Date(hasta + 'T05:00:00.000Z').getTime() + 86400000 - 1);
      params.hasta = diaFin.toISOString();
    }
    return db.prepare(sql).get(params)?.total ?? 0;
  },

  // ── registrar ─────────────────────────────────────────────────────────────
  // M4: acepta id_referencia y tipo_referencia opcionales
  registrar: ({ usuario, accion, modulo, detalles, ip, fecha_hora, id_referencia = null, tipo_referencia = null }) => {
    const { randomUUID } = require('crypto');
    return db.prepare(`
      INSERT INTO logs (id_log, fecha_hora, usuario, accion, modulo, detalles, ip, id_referencia, tipo_referencia)
      VALUES (@id_log, @fecha_hora, @usuario, @accion, @modulo, @detalles, @ip, @id_referencia, @tipo_referencia)
    `).run({
      id_log:          randomUUID(),
      fecha_hora:      fecha_hora || new Date().toISOString(),
      usuario:         usuario    || 'sistema',
      accion,
      modulo,
      detalles:        detalles        || null,
      ip:              ip              || null,
      id_referencia:   id_referencia   || null,
      tipo_referencia: tipo_referencia || null,
    });
  },
};

// ══════════════════════════════════════════════════════════════════════════════
//  CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════════════
const categorias = {
    listar: () =>
        db.prepare(`SELECT * FROM categorias ORDER BY orden ASC, nombre ASC`).all(),

    crear: ({ nombre, icono = '📦', id_categoria_padre = null }) => {
        const { maxOrden } = db.prepare(`SELECT COALESCE(MAX(orden), -1) AS maxOrden FROM categorias`).get();
        return db.prepare(
            `INSERT INTO categorias (nombre, icono, orden, id_categoria_padre) VALUES (@nombre, @icono, @orden, @id_categoria_padre)`
        ).run({ nombre: nombre.trim(), icono, orden: maxOrden + 1, id_categoria_padre });
    },

    actualizar: ({ id_categoria, nombre, icono, activo, id_categoria_padre = null }) =>
        db.prepare(
            `UPDATE categorias SET nombre = @nombre, icono = @icono, activo = @activo, id_categoria_padre = @id_categoria_padre WHERE id_categoria = @id_categoria`
        ).run({ id_categoria, nombre: nombre.trim(), icono, activo, id_categoria_padre }),

    restablecerDefaults: () => {
        const insertCat = db.prepare(
            `INSERT INTO categorias (nombre, icono, orden) VALUES (@nombre, @icono, @orden)`
        );
        const restablecer = db.transaction(() => {
            db.prepare(`DELETE FROM categorias`).run();
            for (const cat of CATEGORIAS_DEFAULT) insertCat.run(cat);
        });
        restablecer();
    },

    eliminar: (id_categoria) => {
        const conSubcategorias = db.prepare(
            `SELECT COUNT(*) AS c FROM categorias WHERE id_categoria_padre = ?`
        ).get(id_categoria);
        if (conSubcategorias.c > 0) {
            throw new Error(`No se puede eliminar: tiene ${conSubcategorias.c} subcategoría(s) asociada(s)`);
        }

        const enUso = db.prepare(
            `SELECT COUNT(*) AS c FROM productos WHERE categoria = (SELECT nombre FROM categorias WHERE id_categoria = ?)`
        ).get(id_categoria);
        if (enUso.c > 0) throw new Error(`No se puede eliminar: ${enUso.c} producto(s) usan esta categoría`);
        return db.prepare(`DELETE FROM categorias WHERE id_categoria = ?`).run(id_categoria);
    },
};

// ══════════════════════════════════════════════════════════════════════════════
//  UNIDADES DE MEDIDA
// ══════════════════════════════════════════════════════════════════════════════
const unidades = {
    listar: () =>
        db.prepare(`SELECT * FROM unidades ORDER BY orden ASC, nombre ASC`).all(),

    crear: ({ nombre }) => {
        const { maxOrden } = db.prepare(`SELECT COALESCE(MAX(orden), -1) AS maxOrden FROM unidades`).get();
        return db.prepare(
            `INSERT INTO unidades (nombre, orden) VALUES (@nombre, @orden)`
        ).run({ nombre: nombre.trim(), orden: maxOrden + 1 });
    },

    actualizar: ({ id_unidad, nombre, activo }) =>
        db.prepare(
            `UPDATE unidades SET nombre = @nombre, activo = @activo WHERE id_unidad = @id_unidad`
        ).run({ id_unidad, nombre: nombre.trim(), activo }),

    eliminar: (id_unidad) => {
        const enUso = db.prepare(
            `SELECT COUNT(*) AS c FROM productos WHERE unidad_medida = (SELECT nombre FROM unidades WHERE id_unidad = ?)`
        ).get(id_unidad);
        if (enUso.c > 0) throw new Error(`No se puede eliminar: ${enUso.c} producto(s) usan esta unidad`);
        return db.prepare(`DELETE FROM unidades WHERE id_unidad = ?`).run(id_unidad);
    },
};

// ══════════════════════════════════════════════════════════════════════════════
//  REPORTES — Agregaciones en SQL (evita cargar tablas completas en JS)
// ══════════════════════════════════════════════════════════════════════════════
const reportes = {
  // ── Ventas: totales desde una fecha (dashboard: hoy / mes) ────────────────
  ventasResumenDesde: (desde) =>
    db.prepare(`
      SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
      FROM ventas
      WHERE estado = 'ACTIVA' AND fecha_hora >= @desde
    `).get({ desde }),

  // ── Ventas: totales en un rango [desde, hasta] (ambos opcionales) ─────────
  ventasResumenRango: ({ desde = null, hasta = null } = {}) => {
    let sql = `
      SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(igv), 0) AS igv
      FROM ventas
      WHERE estado = 'ACTIVA'
    `;
    const params = {};
    if (desde) { sql += ` AND fecha_hora >= @desde`; params.desde = desde; }
    if (hasta) { sql += ` AND fecha_hora <= @hasta`; params.hasta = hasta; }
    return db.prepare(sql).get(params);
  },

  // ── Utilidad y margen en un rango [desde, hasta] (ambos opcionales) ───────
  // SUM() en SQLite ignora costo_unitario nulo — si una línea no tiene costo
  // registrado, no resta del cálculo (puede inflar levemente la utilidad).
  utilidadResumenRango: ({ desde = null, hasta = null } = {}) => {
    let sql = `
      SELECT COALESCE(SUM(d.subtotal_linea), 0) AS ventas,
             COALESCE(SUM(d.cantidad * d.costo_unitario), 0) AS costo
      FROM detalle_ventas d
      JOIN ventas v ON v.id_venta = d.id_venta
      WHERE v.estado = 'ACTIVA'
    `;
    const params = {};
    if (desde) { sql += ` AND v.fecha_hora >= @desde`; params.desde = desde; }
    if (hasta) { sql += ` AND v.fecha_hora <= @hasta`; params.hasta = hasta; }
    const row = db.prepare(sql).get(params);
    const utilidad = row.ventas - row.costo;
    const margen = row.ventas > 0 ? (utilidad / row.ventas) * 100 : 0;
    return { ventas: row.ventas, costo: row.costo, utilidad, margen };
  },

  // ── Ventas: listado en un rango, paginado (para el detalle del reporte) ───
  ventasRango: ({ desde = null, hasta = null, limite = null, offset = 0 } = {}) => {
    let sql = `SELECT * FROM ventas WHERE estado = 'ACTIVA'`;
    const params = {};
    if (desde) { sql += ` AND fecha_hora >= @desde`; params.desde = desde; }
    if (hasta) { sql += ` AND fecha_hora <= @hasta`; params.hasta = hasta; }
    sql += ` ORDER BY fecha_hora DESC`;
    if (limite != null) { sql += ` LIMIT @limite OFFSET @offset`; params.limite = limite; params.offset = offset; }
    return db.prepare(sql).all(params);
  },

  // ── Top clientes por compras en un rango ───────────────────────────────
  // Solo considera ventas con cliente identificado (id_cliente no nulo);
  // las ventas de mostrador sin cliente registrado quedan fuera del ranking.
  topClientesCompra: ({ desde = null, hasta = null, limite = 5 } = {}) => {
    let sql = `
      SELECT c.id_cliente,
             c.nombre_razon_social AS nombre,
             COUNT(DISTINCT v.id_venta) AS numeroCompras,
             SUM(d.subtotal_linea) AS total,
             SUM(d.cantidad * d.costo_unitario) AS costo
      FROM detalle_ventas d
      JOIN ventas v ON v.id_venta = d.id_venta
      JOIN clientes c ON c.id_cliente = v.id_cliente
      WHERE v.estado = 'ACTIVA' AND v.id_cliente IS NOT NULL
    `;
    const params = {};
    if (desde) { sql += ` AND v.fecha_hora >= @desde`; params.desde = desde; }
    if (hasta) { sql += ` AND v.fecha_hora <= @hasta`; params.hasta = hasta; }
    sql += ` GROUP BY v.id_cliente ORDER BY numeroCompras DESC`;
    if (limite != null) { sql += ` LIMIT @limite`; params.limite = limite; }
    const rows = db.prepare(sql).all(params);
    return rows.map(r => {
      const costo = r.costo || 0;
      const utilidad = r.total - costo;
      const margen = r.total > 0 ? (utilidad / r.total) * 100 : 0;
      return { nombre: r.nombre, numeroCompras: r.numeroCompras, total: r.total, costo, utilidad, margen };
    });
  },
  
  // ── Ventas agrupadas por día en un rango (tendencia, ajustado a hora Perú) ─
  ventasPorDiaRango: ({ desde = null, hasta = null } = {}) => {
    let sql = `
      SELECT date(fecha_hora, '-5 hours') AS fecha, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
      FROM ventas WHERE estado = 'ACTIVA'
    `;
    const params = {};
    if (desde) { sql += ` AND fecha_hora >= @desde`; params.desde = desde; }
    if (hasta) { sql += ` AND fecha_hora <= @hasta`; params.hasta = hasta; }
    sql += ` GROUP BY date(fecha_hora, '-5 hours') ORDER BY fecha ASC`;
    return db.prepare(sql).all(params);
  },

  // ── Comprobantes electrónicos: pendientes y rechazados (dashboard) ────────
  cpeEstadoContadores: () => {
    const pendientes = db.prepare(`
      SELECT COUNT(*) AS c FROM ventas
      WHERE estado = 'ACTIVA' AND (cpe_estado = 'PENDIENTE' OR cpe_estado = 'ENVIANDO' OR cpe_estado = 'ENVIADO_PENDIENTE_SUNAT')
    `).get();
    const rechazados = db.prepare(`
      SELECT COUNT(*) AS c FROM ventas WHERE cpe_estado = 'RECHAZADO'
    `).get();
    return { pendientes: pendientes?.c || 0, rechazados: rechazados?.c || 0 };
  },

  // ── Comprobantes electrónicos: pendientes y rechazados DE HOY (widget) ────
  // A diferencia de cpeEstadoContadores() (global/histórico, usado por el
  // dashboard), esta se acota al día de negocio para igualar el criterio de
  // NubeFact, que también reporta solo lo del día — evita que el widget
  // muestre un número que no coincide con lo que el usuario ve en NubeFact.
  cpeEstadoContadoresHoy: (desdeHoy) => {
    const pendientes = db.prepare(`
      SELECT COUNT(*) AS c FROM ventas
      WHERE estado = 'ACTIVA' AND fecha_hora >= @desde
        AND (cpe_estado = 'PENDIENTE' OR cpe_estado = 'ENVIANDO' OR cpe_estado = 'ENVIADO_PENDIENTE_SUNAT')
    `).get({ desde: desdeHoy });
    const rechazados = db.prepare(`
      SELECT COUNT(*) AS c FROM ventas WHERE fecha_hora >= @desde AND cpe_estado = 'RECHAZADO'
    `).get({ desde: desdeHoy });
    return { pendientes: pendientes?.c || 0, rechazados: rechazados?.c || 0 };
  },

  // ── Comprobantes electrónicos: emitidos desde una fecha (mes) ──
  cpeEmitidosMes: (desde) => {
    const row = db.prepare(`
      SELECT COUNT(*) AS c FROM cpe_documentos
      WHERE (
        (estado = 'ACEPTADO' AND (fecha_aceptacion >= @desde OR fecha_creacion >= @desde))
        OR (estado = 'ENVIADO_PENDIENTE_SUNAT' AND fecha_creacion >= @desde)
      )
    `).get({ desde });
    return row?.c || 0;
  },

  // ── Comprobantes electrónicos: historial por mes, tipo y estado ───────────
  // Agrupa por fecha_creacion (no fecha_aceptacion) porque los RECHAZADO y
  // PENDIENTE no tienen fecha de aceptación y quedarían fuera del historial.
  // El '-5 hours' alinea el corte de mes con la medianoche peruana.
  cpeHistorialMeses: (desde) => {
    return db.prepare(`
      SELECT strftime('%Y-%m', datetime(fecha_creacion, '-5 hours')) AS mes,
             tipo_comprobante,
             estado,
             COUNT(*) AS cantidad
      FROM cpe_documentos
      WHERE fecha_creacion >= @desde
      GROUP BY mes, tipo_comprobante, estado
      ORDER BY mes DESC
    `).all({ desde });
  },

  // ── Últimas N ventas activas ────────────────────────────────────────────
  ultimasVentasActivas: (limite = 5) =>
    db.prepare(`
      SELECT * FROM ventas WHERE estado = 'ACTIVA'
      ORDER BY fecha_hora DESC LIMIT @limite
    `).all({ limite }),

  // ── Top productos más vendidos en un rango ─────────────────────────────
  // agruparPorId=true agrupa por id_producto (dashboard); false agrupa por
  // nombre_producto (reporte de ventas por periodo) — replica el comportamiento
  // original de cada endpoint, que agrupaban de forma distinta.
    topProductosVendidos: ({ desde = null, hasta = null, limite = 5, agruparPorId = true } = {}) => {
    const campoAgrupacion = agruparPorId ? 'd.id_producto' : 'd.nombre_producto';
    let sql = `
      SELECT d.nombre_producto AS nombre,
             SUM(d.cantidad) AS cantidad,
             SUM(d.subtotal_linea) AS total,
             SUM(d.cantidad * d.costo_unitario) AS costo
      FROM detalle_ventas d
      JOIN ventas v ON v.id_venta = d.id_venta
      WHERE v.estado = 'ACTIVA'
    `;
    const params = {};
    if (desde) { sql += ` AND v.fecha_hora >= @desde`; params.desde = desde; }
    if (hasta) { sql += ` AND v.fecha_hora <= @hasta`; params.hasta = hasta; }
    sql += ` GROUP BY ${campoAgrupacion} ORDER BY cantidad DESC`;
    // limite = null trae todos los productos vendidos en el rango (necesario
    // para que el selector de métrica en el dashboard sea exacto, no solo
    // un reordenamiento del top-N por unidades).
    if (limite != null) { sql += ` LIMIT @limite`; params.limite = limite; }
    const rows = db.prepare(sql).all(params);
    return rows.map(r => {
      const costo = r.costo || 0;
      const utilidad = r.total - costo;
      const margen = r.total > 0 ? (utilidad / r.total) * 100 : 0;
      return { nombre: r.nombre, cantidad: r.cantidad, total: r.total, costo, utilidad, margen };
    });
  },

  // ── Ventas agrupadas por forma de pago en un rango ─────────────────────
  ventasPorFormaPago: ({ desde = null, hasta = null } = {}) => {
    let sql = `
      SELECT forma_pago, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
      FROM ventas WHERE estado = 'ACTIVA'
    `;
    const params = {};
    if (desde) { sql += ` AND fecha_hora >= @desde`; params.desde = desde; }
    if (hasta) { sql += ` AND fecha_hora <= @hasta`; params.hasta = hasta; }
    sql += ` GROUP BY forma_pago`;
    return db.prepare(sql).all(params);
  },

  // ── Ventas agrupadas por categoría de producto en un rango ────────────────
  ventasPorCategoria: ({ desde = null, hasta = null } = {}) => {
    let sql = `
      SELECT COALESCE(p.categoria, 'Sin categoría') AS categoria,
             SUM(d.subtotal_linea) AS total,
             SUM(d.cantidad) AS cantidad
      FROM detalle_ventas d
      JOIN ventas v ON v.id_venta = d.id_venta
      LEFT JOIN productos p ON p.id_producto = d.id_producto
      WHERE v.estado = 'ACTIVA'
    `;
    const params = {};
    if (desde) { sql += ` AND v.fecha_hora >= @desde`; params.desde = desde; }
    if (hasta) { sql += ` AND v.fecha_hora <= @hasta`; params.hasta = hasta; }
    sql += ` GROUP BY categoria ORDER BY total DESC`;
    return db.prepare(sql).all(params);
  }, 

  // ── Stock total agrupado por ubicación (tienda vs almacén/depósito) ───────
  stockPorUbicacion: () => {
    const tiendaId = config.obtener('almacen_tienda_id') || config.obtener('almacen_principal_id') || 'alm-principal';
    const depositoId = config.obtener('almacen_deposito_id') || '';
    const row = db.prepare(`
      SELECT
        COALESCE(SUM((SELECT stock_actual FROM stock_almacen WHERE id_almacen = ? AND id_producto = p.id_producto)), 0) AS stock_tienda,
        COALESCE(SUM((SELECT stock_actual FROM stock_almacen WHERE id_almacen = ? AND id_producto = p.id_producto)), 0) AS stock_deposito
      FROM productos p
      WHERE p.eliminado = 0 AND p.estado = 1
    `).get(tiendaId, depositoId);

    const porAlmacen = db.prepare(`
      SELECT a.id_almacen, a.nombre, a.es_principal,
             COALESCE(SUM(sa.stock_actual), 0) AS stock_total
      FROM almacenes a
      LEFT JOIN stock_almacen sa ON sa.id_almacen = a.id_almacen
      LEFT JOIN productos p ON p.id_producto = sa.id_producto AND p.eliminado = 0 AND p.estado = 1
      WHERE a.estado = 1
      GROUP BY a.id_almacen
      ORDER BY a.es_principal DESC, a.nombre ASC
    `).all();

    return {
      tienda: row?.stock_tienda || 0,
      deposito: row?.stock_deposito || 0,
      por_almacen: porAlmacen,
    };
  },

    // ── Productos con stock que no se han vendido en los últimos N días ───────
  // (o nunca se han vendido). Para detectar sobreinventario / capital inmovilizado.
  productosSinMovimiento: ({ dias = 30 } = {}) => {
    const sql = `
      SELECT p.id_producto, p.sku, p.nombre, p.categoria, p.stock_actual, p.precio_compra,
             MAX(v.fecha_hora) AS ultima_venta
      FROM productos p
      LEFT JOIN detalle_ventas d ON d.id_producto = p.id_producto
      LEFT JOIN ventas v ON v.id_venta = d.id_venta AND v.estado = 'ACTIVA'
      WHERE p.eliminado = 0 AND p.estado = 1 AND p.stock_actual > 0
      GROUP BY p.id_producto
      HAVING ultima_venta IS NULL OR julianday('now') - julianday(ultima_venta) >= @dias
      ORDER BY (ultima_venta IS NULL) DESC, ultima_venta ASC
    `;
    return db.prepare(sql).all({ dias });
  },

  // ── Inventario: resumen agregado (valor, conteos de stock) ────────────
  inventarioResumen: () =>
    db.prepare(`
      SELECT
        COUNT(*) AS total_productos,
        COALESCE(SUM(stock_actual * precio_compra), 0) AS valor_compra,
        COALESCE(SUM(stock_actual * precio_venta), 0)  AS valor_venta,
        SUM(CASE WHEN stock_actual = 0 THEN 1 ELSE 0 END) AS stock_critico,
        SUM(CASE WHEN stock_actual > 0 AND stock_actual <= stock_minimo THEN 1 ELSE 0 END) AS stock_bajo
      FROM productos WHERE estado = 1
    `).get(),

  // ── Productos con stock crítico (0 unidades) ───────────────────────────
  productosStockCritico: (limite = null) => {
    let sql = `SELECT * FROM productos WHERE estado = 1 AND stock_actual = 0 ORDER BY nombre COLLATE NOCASE ASC`;
    const params = {};
    if (limite) { sql += ` LIMIT @limite`; params.limite = limite; }
    return db.prepare(sql).all(params);
  },

  // ── Productos con stock bajo (entre 1 y stock_minimo) ──────────────────
  productosStockBajoNivel: (limite = null) => {
    let sql = `SELECT * FROM productos WHERE estado = 1 AND stock_actual > 0 AND stock_actual <= stock_minimo ORDER BY nombre COLLATE NOCASE ASC`;
    const params = {};
    if (limite) { sql += ` LIMIT @limite`; params.limite = limite; }
    return db.prepare(sql).all(params);
  },

  // ── Inventario agrupado por categoría ──────────────────────────────────
  inventarioPorCategoria: () =>
    db.prepare(`
      SELECT categoria,
             COUNT(*) AS items,
             COALESCE(SUM(stock_actual), 0) AS cantidad,
             COALESCE(SUM(stock_actual * precio_compra), 0) AS valor
      FROM productos WHERE estado = 1
      GROUP BY categoria
    `).all(),
};

// ══════════════════════════════════════════════════════════════════════════════
//  EXPORTAR
// ══════════════════════════════════════════════════════════════════════════════
// ── Módulo óptica (recetas, órdenes de trabajo, talleres) ────────────────────
// Requiere la migración v7 (007_modulo_optica_base).

const numberOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const numberOrZero = (v) => numberOrNull(v) ?? 0;
const nullIfEmpty = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const normalizarReceta = (r) => ({
  id_receta:             r.id_receta,
  id_cliente:            r.id_cliente,
  fecha_receta:          r.fecha_receta,
  od_esfera:             numberOrNull(r.od_esfera),
  od_cilindro:           numberOrNull(r.od_cilindro),
  od_eje:                numberOrNull(r.od_eje),
  od_adicion:            numberOrNull(r.od_adicion),
  od_altura:             numberOrNull(r.od_altura),
  od_prisma:             nullIfEmpty(r.od_prisma),
  od_av_sc:              nullIfEmpty(r.od_av_sc),
  od_av_ae:              nullIfEmpty(r.od_av_ae),
  od_av_cc:              nullIfEmpty(r.od_av_cc),
  oi_esfera:             numberOrNull(r.oi_esfera),
  oi_cilindro:           numberOrNull(r.oi_cilindro),
  oi_eje:                numberOrNull(r.oi_eje),
  oi_adicion:            numberOrNull(r.oi_adicion),
  oi_altura:             numberOrNull(r.oi_altura),
  oi_prisma:             nullIfEmpty(r.oi_prisma),
  oi_av_sc:              nullIfEmpty(r.oi_av_sc),
  oi_av_ae:              nullIfEmpty(r.oi_av_ae),
  oi_av_cc:              nullIfEmpty(r.oi_av_cc),
  dip:                   numberOrNull(r.dip),
  tipo_lente:            nullIfEmpty(r.tipo_lente),
  material_lente:        nullIfEmpty(r.material_lente),
  diagnostico:           nullIfEmpty(r.diagnostico),
  codigo_cie10:          nullIfEmpty(r.codigo_cie10),
  periodo_uso:           nullIfEmpty(r.periodo_uso),
  indicaciones:          nullIfEmpty(r.indicaciones),
  fecha_proximo_control: nullIfEmpty(r.fecha_proximo_control),
  profesional_nombre:    nullIfEmpty(r.profesional_nombre),
  profesional_registro:  nullIfEmpty(r.profesional_registro),
  observaciones:         r.observaciones || '',
  usuario_creador:       nullIfEmpty(r.usuario_creador),
  fecha_registro:        nullIfEmpty(r.fecha_registro) ?? new Date().toISOString(),
});

const recetas = {

  listar: ({ id_cliente = null, activa = true } = {}) => {
    let sql = `SELECT r.*, c.nombre_razon_social AS nombre_cliente, c.tipo_documento, c.numero_documento
               FROM recetas r
               JOIN clientes c ON r.id_cliente = c.id_cliente
               WHERE 1=1`;
    const params = {};
    if (id_cliente) { sql += ' AND r.id_cliente = @id_cliente'; params.id_cliente = id_cliente; }
    if (activa !== undefined) { sql += ' AND r.activa = @activa'; params.activa = activa ? 1 : 0; }
    sql += ' ORDER BY r.fecha_receta DESC';
    return db.prepare(sql).all(params);
  },

  obtener: (id) =>
    db.prepare(`SELECT r.*, c.nombre_razon_social AS nombre_cliente, c.tipo_documento, c.numero_documento
                FROM recetas r
                JOIN clientes c ON r.id_cliente = c.id_cliente
                WHERE r.id_receta = ?`).get(id),

  crear: (r) =>
    db.prepare(`
      INSERT INTO recetas (
        id_receta, id_cliente, fecha_receta,
        od_esfera, od_cilindro, od_eje, od_adicion, od_altura, od_prisma,
        od_av_sc, od_av_ae, od_av_cc,
        oi_esfera, oi_cilindro, oi_eje, oi_adicion, oi_altura, oi_prisma,
        oi_av_sc, oi_av_ae, oi_av_cc,
        dip, tipo_lente, material_lente, diagnostico, codigo_cie10,
        periodo_uso, indicaciones, fecha_proximo_control,
        profesional_nombre, profesional_registro,
        observaciones, usuario_creador, fecha_registro, activa
      ) VALUES (
        @id_receta, @id_cliente, @fecha_receta,
        @od_esfera, @od_cilindro, @od_eje, @od_adicion, @od_altura, @od_prisma,
        @od_av_sc, @od_av_ae, @od_av_cc,
        @oi_esfera, @oi_cilindro, @oi_eje, @oi_adicion, @oi_altura, @oi_prisma,
        @oi_av_sc, @oi_av_ae, @oi_av_cc,
        @dip, @tipo_lente, @material_lente, @diagnostico, @codigo_cie10,
        @periodo_uso, @indicaciones, @fecha_proximo_control,
        @profesional_nombre, @profesional_registro,
        @observaciones, @usuario_creador, @fecha_registro, 1
      )
    `).run(normalizarReceta(r)),

  actualizar: (r) =>
    db.prepare(`
      UPDATE recetas SET
        id_cliente            = @id_cliente,
        fecha_receta          = @fecha_receta,
        od_esfera             = @od_esfera,
        od_cilindro           = @od_cilindro,
        od_eje                = @od_eje,
        od_adicion            = @od_adicion,
        od_altura             = @od_altura,
        od_prisma             = @od_prisma,
        od_av_sc              = @od_av_sc,
        od_av_ae              = @od_av_ae,
        od_av_cc              = @od_av_cc,
        oi_esfera             = @oi_esfera,
        oi_cilindro           = @oi_cilindro,
        oi_eje                = @oi_eje,
        oi_adicion            = @oi_adicion,
        oi_altura             = @oi_altura,
        oi_prisma             = @oi_prisma,
        oi_av_sc              = @oi_av_sc,
        oi_av_ae              = @oi_av_ae,
        oi_av_cc              = @oi_av_cc,
        dip                   = @dip,
        tipo_lente            = @tipo_lente,
        material_lente        = @material_lente,
        diagnostico           = @diagnostico,
        codigo_cie10          = @codigo_cie10,
        periodo_uso           = @periodo_uso,
        indicaciones          = @indicaciones,
        fecha_proximo_control = @fecha_proximo_control,
        profesional_nombre    = @profesional_nombre,
        profesional_registro  = @profesional_registro,
        observaciones         = @observaciones,
        activa                = @activa
      WHERE id_receta = @id_receta
    `).run({
      ...normalizarReceta(r),
      activa: r.activa === false || r.activa === 0 ? 0 : 1,
    }),

  desactivar: (id) =>
    db.prepare('UPDATE recetas SET activa = 0 WHERE id_receta = ?').run(id),
};

const registrarHistorialOrden = (id_orden, estado, { id_taller = null, usuario = null, nota = null } = {}) =>
  db.prepare(`
    INSERT INTO orden_historial (id_historial, id_orden, estado, id_taller, usuario, nota, fecha_hora)
    VALUES (lower(hex(randomblob(16))), @id_orden, @estado, @id_taller, @usuario, @nota, datetime('now','localtime'))
  `).run({ id_orden, estado, id_taller, usuario, nota });

const ordenes = {

  listar: ({ estado = null, id_cliente = null, desde = null, hasta = null } = {}) => {
    let sql = `SELECT o.*, c.nombre_razon_social AS cliente_nombre, t.nombre AS taller_nombre
               FROM ordenes_trabajo o
               JOIN clientes c ON o.id_cliente = c.id_cliente
               LEFT JOIN talleres t ON o.id_taller = t.id_taller
               WHERE 1=1`;
    const params = {};
    if (estado)      { sql += ' AND o.estado = @estado';           params.estado = estado; }
    if (id_cliente)  { sql += ' AND o.id_cliente = @id_cliente';   params.id_cliente = id_cliente; }
    if (desde)       { sql += ' AND o.fecha_entrada >= @desde';    params.desde = desde; }
    if (hasta)       { sql += ' AND o.fecha_entrada <= @hasta';    params.hasta = hasta; }
    sql += ' ORDER BY o.fecha_entrada DESC';
    const lista = db.prepare(sql).all(params);
    if (lista.length === 0) return lista;

    // Adjunta las líneas (materiales) de cada orden para tarjetas y panel de detalle
    const porOrden = {};
    for (let i = 0; i < lista.length; i += 500) {
      const ids = lista.slice(i, i + 500).map(o => o.id_orden);
      const filas = db.prepare(`
        SELECT d.*, p.nombre AS producto_nombre
        FROM detalle_orden d
        LEFT JOIN productos p ON d.id_producto = p.id_producto
        WHERE d.id_orden IN (${ids.map(() => '?').join(',')})
      `).all(...ids);
      for (const d of filas) (porOrden[d.id_orden] ||= []).push(d);
    }
    return lista.map(o => ({ ...o, detalle: porOrden[o.id_orden] || [] }));
  },

  obtener: (id) => {
    const orden = db.prepare(`
      SELECT o.*, c.nombre_razon_social AS cliente_nombre, t.nombre AS taller_nombre
      FROM ordenes_trabajo o
      LEFT JOIN clientes c ON o.id_cliente = c.id_cliente
      LEFT JOIN talleres t ON o.id_taller = t.id_taller
      WHERE o.id_orden = ?
    `).get(id);
    if (!orden) return null;

    const detalle = db.prepare(`
      SELECT d.*, p.nombre AS producto_nombre, p.sku
      FROM detalle_orden d
      LEFT JOIN productos p ON d.id_producto = p.id_producto
      WHERE d.id_orden = ?
    `).all(id);

    const historial = db.prepare(`
      SELECT h.*, t.nombre AS taller_nombre
      FROM orden_historial h
      LEFT JOIN talleres t ON h.id_taller = t.id_taller
      WHERE h.id_orden = ?
      ORDER BY h.fecha_hora ASC
    `).all(id);

    return { ...orden, detalle, historial };
  },

  crear: db.transaction((orden, detalles) => {
    const ordenNormalizada = {
      ...orden,
      id_receta: nullIfEmpty(orden.id_receta),
      id_taller: nullIfEmpty(orden.id_taller),
      fecha_entrada: nullIfEmpty(orden.fecha_entrada),
      fecha_entrega_estimada: nullIfEmpty(orden.fecha_entrega_estimada),
      tipo_trabajo: orden.tipo_trabajo || '',
      observaciones: orden.observaciones || '',
      total_mano_obra: numberOrZero(orden.total_mano_obra),
      usuario_creador: orden.usuario_creador || 'admin',
    };

    db.prepare(`
      INSERT INTO ordenes_trabajo (
        id_orden, id_cliente, id_receta, id_taller, fecha_entrada,
        fecha_entrega_estimada, estado, tipo_trabajo, observaciones,
        total_mano_obra, usuario_creador
      ) VALUES (
        @id_orden, @id_cliente, @id_receta, @id_taller,
        COALESCE(@fecha_entrada, datetime('now','localtime')),
        @fecha_entrega_estimada, 'PENDIENTE', @tipo_trabajo, @observaciones,
        @total_mano_obra, @usuario_creador
      )
    `).run(ordenNormalizada);

    const insDetalle = db.prepare(`
      INSERT INTO detalle_orden
        (id_detalle, id_orden, id_producto, cantidad, precio_venta, ojo)
      VALUES
        (@id_detalle, @id_orden, @id_producto, @cantidad, @precio_venta, @ojo)
    `);
    for (const d of detalles) {
      insDetalle.run({
        ...d,
        id_producto: nullIfEmpty(d.id_producto),
        cantidad: numberOrZero(d.cantidad) || 1,
        precio_venta: numberOrZero(d.precio_venta),
        ojo: nullIfEmpty(d.ojo),
      });
    }

    registrarHistorialOrden(ordenNormalizada.id_orden, 'PENDIENTE', {
      id_taller: ordenNormalizada.id_taller,
      usuario: ordenNormalizada.usuario_creador,
      nota: 'Orden creada',
    });

    return { ok: true, id_orden: ordenNormalizada.id_orden };
  }),

  cambiarEstado: db.transaction((id_orden, estado, { usuario = null, nota = null, id_taller = null } = {}) => {
    const actual = db.prepare('SELECT id_taller FROM ordenes_trabajo WHERE id_orden = ?').get(id_orden);
    if (!actual) return false;

    const tallerNuevo = nullIfEmpty(id_taller);

    db.prepare(`
      UPDATE ordenes_trabajo SET
        estado                 = @estado,
        id_taller              = COALESCE(@id_taller, id_taller),
        fecha_envio_taller     = CASE WHEN @estado = 'EN_TALLER' THEN datetime('now','localtime') ELSE fecha_envio_taller END,
        fecha_recepcion_taller = CASE WHEN @estado = 'RECIBIDO'  THEN datetime('now','localtime') ELSE fecha_recepcion_taller END,
        fecha_entrega_real     = CASE WHEN @estado = 'ENTREGADO' THEN datetime('now','localtime') ELSE fecha_entrega_real END
      WHERE id_orden = @id_orden
    `).run({ id_orden, estado, id_taller: tallerNuevo });

    registrarHistorialOrden(id_orden, estado, {
      id_taller: tallerNuevo ?? actual.id_taller ?? null,
      usuario,
      nota,
    });
    return true;
  }),

  actualizar: (orden) =>
    db.prepare(`
      UPDATE ordenes_trabajo SET
        id_cliente             = @id_cliente,
        id_receta              = @id_receta,
        id_taller              = @id_taller,
        fecha_entrega_estimada = @fecha_entrega_estimada,
        tipo_trabajo           = @tipo_trabajo,
        observaciones          = @observaciones,
        total_mano_obra        = @total_mano_obra
      WHERE id_orden = @id_orden
    `).run({
      ...orden,
      id_receta: nullIfEmpty(orden.id_receta),
      id_taller: nullIfEmpty(orden.id_taller),
      fecha_entrega_estimada: nullIfEmpty(orden.fecha_entrega_estimada),
      tipo_trabajo: orden.tipo_trabajo || '',
      observaciones: orden.observaciones || '',
      total_mano_obra: numberOrZero(orden.total_mano_obra),
    }),
};

const talleres = {

  listar: ({ soloActivos = false } = {}) =>
    db.prepare(`
      SELECT * FROM talleres
      WHERE (@soloActivos = 0 OR activo = 1)
      ORDER BY nombre ASC
    `).all({ soloActivos: soloActivos ? 1 : 0 }),

  obtener: (id) =>
    db.prepare('SELECT * FROM talleres WHERE id_taller = ?').get(id),

  crear: (t) =>
    db.prepare(`
      INSERT INTO talleres
        (id_taller, nombre, contacto, telefono_alt, email, ruc, direccion, especialidad, notas, activo)
      VALUES
        (@id_taller, @nombre, @contacto, @telefono_alt, @email, @ruc, @direccion, @especialidad, @notas, @activo)
    `).run({ activo: 1, ...t }),

  actualizar: (t) =>
    db.prepare(`
      UPDATE talleres SET
        nombre       = @nombre,
        contacto     = @contacto,
        telefono_alt = @telefono_alt,
        email        = @email,
        ruc          = @ruc,
        direccion    = @direccion,
        especialidad = @especialidad,
        notas        = @notas
      WHERE id_taller = @id_taller
    `).run(t),

  toggleActivo: (id, activo) =>
    db.prepare('UPDATE talleres SET activo = ? WHERE id_taller = ?').run(activo ? 1 : 0, id),

  // Si el taller tiene órdenes asociadas solo se desactiva (FK); si no, se borra.
  eliminar: (id) => {
    const enUso = db.prepare('SELECT COUNT(*) AS c FROM ordenes_trabajo WHERE id_taller = ?').get(id).c;
    if (enUso > 0) {
      db.prepare('UPDATE talleres SET activo = 0 WHERE id_taller = ?').run(id);
      return { fisico: false };
    }
    db.prepare('DELETE FROM talleres WHERE id_taller = ?').run(id);
    return { fisico: true };
  },
};

module.exports = { db, productos, clientes, ventas, compras, movimientos, config, caja, usuarios, logs, categorias, unidades, reportes, asegurarAlmacenesPorDefecto, recetas, ordenes, talleres };

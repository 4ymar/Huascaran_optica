/**
 * routes/demo.js
 * Herramientas de datos de prueba: reset y carga de demo.
 * Se monta bajo el mismo prefijo /api/config que routes/config.js,
 * así las URLs para el frontend no cambian (/api/config/reset, /api/config/cargar-demo).
 */
const router = require('express').Router();
const fs     = require('fs');
const path   = require('path');
const { randomUUID } = require('crypto');
const db     = require('../data/database');
const { requireRole } = require('../middleware/auth');
const { generateSeedData } = require('../services/seedData');
const logger = require('../logger');

const MODULOS_DESCARGAS = [
    'AUDITORIA', 'clientes', 'compras', 'comprobantes', 'emision_electronica',
    'inventario', 'productos', 'registro_ventas', 'reportes',
];
const SUBCARPETAS_BACKUPS = ['automaticos', 'diarios', 'manuales'];

function vaciarCarpeta(ruta) {
    if (!fs.existsSync(ruta)) return;
    for (const nombre of fs.readdirSync(ruta)) {
        fs.rmSync(path.join(ruta, nombre), { recursive: true, force: true });
    }
}

router.use(requireRole('ADMIN'));

// ─── POST /api/config/reset ───────────────────────────────────────────────────
router.post('/reset', (req, res) => {
    try {
        const rawDb = db.db;

        // Desactivar FK para evitar errores de orden
        rawDb.pragma('foreign_keys = OFF');

        rawDb.transaction(() => {
            // Primero: tablas hijas (detalles, eventos CPE y movimientos)
            rawDb.prepare('DELETE FROM detalle_ventas').run();
            rawDb.prepare('DELETE FROM detalle_compras').run();
            rawDb.prepare('DELETE FROM detalle_devoluciones').run();
            rawDb.prepare('DELETE FROM abonos').run();
            rawDb.prepare('DELETE FROM movimientos').run();
            rawDb.prepare('DELETE FROM movimientos_caja').run();
            rawDb.prepare('DELETE FROM stock_almacen').run();
            rawDb.prepare('DELETE FROM cpe_eventos').run();
            rawDb.prepare('DELETE FROM cpe_documentos').run();

            // Segundo: tablas intermedias
            rawDb.prepare('DELETE FROM creditos').run();
            rawDb.prepare('DELETE FROM devoluciones').run();
            rawDb.prepare('DELETE FROM ventas').run();
            rawDb.prepare('DELETE FROM compras').run();
            rawDb.prepare('DELETE FROM sesiones_caja').run();

            // Tercero: tablas principales y catálogos
            rawDb.prepare('DELETE FROM clientes').run();
            rawDb.prepare('DELETE FROM productos').run();
            rawDb.prepare('DELETE FROM proveedores').run();
            rawDb.prepare('DELETE FROM almacenes WHERE es_principal = 0').run();
            // Evita que quede apuntando a un almacén ya borrado (rompería
            // ventas/compras/ajustes reales con FOREIGN KEY constraint failed)
            rawDb.prepare(`INSERT OR REPLACE INTO config (clave, valor) VALUES ('almacen_deposito_id', '')`).run();
            rawDb.prepare('DELETE FROM logs').run();

            // Categorías: reset "de fábrica" — vuelve a los defaults genéricos,
            // descarta cualquier categoría creada por el demo o manualmente.
            db.categorias.restablecerDefaults();
        })();

        // Reactivar FK
        rawDb.pragma('foreign_keys = ON');

        // Recrear "Tienda" y "Almacén" (Depósito) — deja el sistema igual que
        // una instalación nueva, sin depender de reiniciar la app.
        db.asegurarAlmacenesPorDefecto();

        // Limpiar archivos generados: PDFs/exports por módulo y backups del periodo anterior
        for (const modulo of MODULOS_DESCARGAS) {
            vaciarCarpeta(path.join(req.app.locals.DESCARGAS_DIR, modulo));
        }
        for (const sub of SUBCARPETAS_BACKUPS) {
            vaciarCarpeta(path.join(req.app.locals.BACKUP_DIR, sub));
        }

        res.json({ ok: true, mensaje: 'Base de datos restablecida correctamente.' });
    } catch (err) {
        // Asegurarse de reactivar FK aunque falle
        try { db.db.pragma('foreign_keys = ON'); } catch (_) {}
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ─── POST /api/config/cargar-demo ─────────────────────────────────────────────
router.post('/cargar-demo', (req, res) => {
    try {
        // Leer series configuradas por el usuario
        const cfg          = db.config.obtenerTodo();
        const serieBoleta  = cfg.serie_boleta  || 'B001';
        const serieFactura = cfg.serie_factura || 'F001';

        const seedData = generateSeedData(serieBoleta, serieFactura);
        const rawDb    = db.db;

        const cargar = rawDb.transaction(() => {
            // 1. Limpiar (respeta config, usuarios, logs, caja)
            rawDb.exec(`
                DELETE FROM abonos;
                DELETE FROM creditos;
                DELETE FROM movimientos;
                DELETE FROM detalle_compras;
                DELETE FROM compras;
                DELETE FROM detalle_ventas;
                DELETE FROM ventas;
                DELETE FROM clientes;
                DELETE FROM productos;
            `);

            // 2. Migraciones seguras
            for (const sql of [
                `ALTER TABLE productos ADD COLUMN codigo_barras TEXT DEFAULT ''`,
                `ALTER TABLE ventas    ADD COLUMN id_sesion_caja TEXT`,
            ]) { try { rawDb.exec(sql); } catch (_) {} }

            // 3. Clientes
            const insC = rawDb.prepare(`INSERT OR IGNORE INTO clientes
                (id_cliente,tipo_cliente,nombre_razon_social,tipo_documento,
                 numero_documento,direccion,telefono,email,estado,fecha_registro)
                VALUES(@id_cliente,@tipo_cliente,@nombre_razon_social,@tipo_documento,
                 @numero_documento,@direccion,@telefono,@email,@estado,@fecha_registro)`);
            for (const c of seedData.clientes) insC.run(c);

            // 4. Categorías propias del demo (rubro ferretería) — no tocan los defaults
            // genéricos de database.js, que son neutrales para cualquier tipo de negocio.
            const CATEGORIAS_DEMO_EXTRA = [
                { nombre: 'Materiales de Construcción', icono: '🧱' },
                { nombre: 'Ferretería General',         icono: '🔨' },
            ];
            const insCat = rawDb.prepare(`INSERT OR IGNORE INTO categorias (nombre, icono) VALUES (@nombre, @icono)`);
            for (const cat of CATEGORIAS_DEMO_EXTRA) insCat.run(cat);

            // Normaliza los nombres de categoría del seed (algunos sin tilde) contra los
            // nombres reales ya registrados en `categorias`.
            const NORMALIZAR_CATEGORIA = {
                'Materiales de Construccion': 'Materiales de Construcción',
                'Plomeria':                   'Plomería',
                'Jardineria':                 'Jardinería',
                'Ferreteria General':         'Ferretería General',
            };
            const mapaIdCategoria = new Map(
                rawDb.prepare(`SELECT id_categoria, nombre FROM categorias`).all().map(c => [c.nombre, c.id_categoria])
            );

            // 5. Productos
            const insP = rawDb.prepare(`INSERT OR IGNORE INTO productos
                (id_producto,sku,codigo_barras,nombre,categoria,id_categoria,unidad_medida,
                 precio_compra,precio_venta,stock_actual,stock_minimo,
                 descripcion,imagen_url,estado,fecha_creacion,fecha_actualizacion)
                VALUES(@id_producto,@sku,@codigo_barras,@nombre,@categoria,@id_categoria,@unidad_medida,
                 @precio_compra,@precio_venta,@stock_actual,@stock_minimo,
                 @descripcion,@imagen_url,@estado,@fecha_creacion,@fecha_actualizacion)`);
            for (const p of seedData.productos) {
                const nombreCat = NORMALIZAR_CATEGORIA[p.categoria] || p.categoria;
                insP.run({ ...p, categoria: nombreCat, id_categoria: mapaIdCategoria.get(nombreCat) ?? null });
            }

                        // Sincronizar stock_almacen con el stock sembrado en productos, repartido
            // entre Tienda y un almacén de Depósito propio del demo (según
            // stock_tienda / stock_deposito) — evita que la primera venta/compra/
            // ajuste "invente" un stock_almacen arrancando en 0, desincronizado
            // del stock real del producto.
            //
            // El Depósito Demo se crea aquí mismo en cada carga, en vez de usar
            // la config almacen_deposito_id: esa config puede no existir o apuntar
            // a un almacén ya borrado (ej. tras un reset), y el demo no debe
            // depender de configuración real del usuario ni modificarla.
            const idAlmacenTienda   = db.config.obtener('almacen_tienda_id') || db.config.obtener('almacen_principal_id') || 'alm-principal';
            const idAlmacenDeposito = randomUUID();
            rawDb.prepare(`
                INSERT INTO almacenes (id_almacen, nombre, descripcion, es_principal, estado, fecha_creacion)
                VALUES (?, 'Depósito Demo', 'Almacén de datos de demostración', 0, 1, ?)
            `).run(idAlmacenDeposito, new Date().toISOString());
            const insSA = rawDb.prepare(`INSERT OR IGNORE INTO stock_almacen
                (id_almacen, id_producto, stock_actual, stock_minimo)
                VALUES (@id_almacen, @id_producto, @stock_actual, @stock_minimo)`);
            for (const p of seedData.productos) {
                insSA.run({
                    id_almacen: idAlmacenTienda,
                    id_producto: p.id_producto,
                    stock_actual: p.stock_tienda,
                    stock_minimo: p.stock_minimo,
                });
                insSA.run({
                    id_almacen: idAlmacenDeposito,
                    id_producto: p.id_producto,
                    stock_actual: p.stock_deposito,
                    stock_minimo: 0,
                });
            }

            // 5. Ventas — se registran en Tienda (mismo criterio que registrarVenta)
            const insV = rawDb.prepare(`INSERT OR IGNORE INTO ventas
                (id_venta,numero_venta,fecha_hora,id_cliente,tipo_comprobante,
                 numero_comprobante,subtotal,igv,descuento,total,
                 forma_pago,estado,usuario,notas,id_sesion_caja,id_almacen)
                VALUES(@id_venta,@numero_venta,@fecha_hora,@id_cliente,@tipo_comprobante,
                 @numero_comprobante,@subtotal,@igv,@descuento,@total,
                 @forma_pago,@estado,@usuario,@notas,@id_sesion_caja,@id_almacen)`);
            for (const v of seedData.ventas) insV.run({ ...v, id_almacen: idAlmacenTienda });

            // 6. Detalle ventas
            const insDV = rawDb.prepare(`INSERT OR IGNORE INTO detalle_ventas
                (id_detalle,id_venta,id_producto,nombre_producto,
                 cantidad,precio_unitario,descuento_linea,subtotal_linea,costo_unitario)
                VALUES(@id_detalle,@id_venta,@id_producto,@nombre_producto,
                 @cantidad,@precio_unitario,@descuento_linea,@subtotal_linea,@costo_unitario)`);
            for (const d of seedData.detalle_ventas) insDV.run(d);

            // 7. Compras — se registran en Almacén/depósito (mismo criterio que registrarCompra)
            const insCO = rawDb.prepare(`INSERT OR IGNORE INTO compras
                (id_compra,numero_oc,fecha_hora,proveedor,ruc_proveedor,
                 doc_proveedor,subtotal,igv,total,estado,usuario,notas,id_almacen)
                VALUES(@id_compra,@numero_oc,@fecha_hora,@proveedor,@ruc_proveedor,
                 @doc_proveedor,@subtotal,@igv,@total,@estado,@usuario,@notas,@id_almacen)`);
            for (const c of seedData.compras) insCO.run({ ...c, id_almacen: idAlmacenDeposito });

            // 8. Detalle compras
            const insDC = rawDb.prepare(`INSERT OR IGNORE INTO detalle_compras
                (id_detalle,id_compra,id_producto,nombre_producto,
                 cantidad,precio_unitario,subtotal_linea)
                VALUES(@id_detalle,@id_compra,@id_producto,@nombre_producto,
                 @cantidad,@precio_unitario,@subtotal_linea)`);
            for (const d of seedData.detalle_compras) insDC.run(d);

            // 9. Movimientos — SALIDA viene de ventas (Tienda), ENTRADA viene de
            // compras (Depósito Demo). Son las dos únicas fuentes en seedData.js.
            const insM = rawDb.prepare(`INSERT OR IGNORE INTO movimientos
                (id_movimiento,fecha_hora,id_producto,nombre_producto,
                 tipo_movimiento,cantidad,stock_anterior,stock_nuevo,
                 referencia,motivo,usuario,id_almacen)
                VALUES(@id_movimiento,@fecha_hora,@id_producto,@nombre_producto,
                 @tipo_movimiento,@cantidad,@stock_anterior,@stock_nuevo,
                 @referencia,@motivo,@usuario,@id_almacen)`);
            for (const m of seedData.movimientos) {
                insM.run({
                    ...m,
                    id_almacen: m.tipo_movimiento === 'SALIDA' ? idAlmacenTienda : idAlmacenDeposito,
                });
            }

            // 10. Créditos
            const insCR = rawDb.prepare(`INSERT OR IGNORE INTO creditos
                (id_credito,id_cliente,id_venta,monto_total,estado,
                 fecha_vencimiento,notas,fecha_creacion)
                VALUES(@id_credito,@id_cliente,@id_venta,@monto_total,@estado,
                 @fecha_vencimiento,@notas,@fecha_creacion)`);
            for (const c of seedData.creditos) insCR.run(c);

            // 11. Abonos
            const insA = rawDb.prepare(`INSERT OR IGNORE INTO abonos
                (id_abono,id_credito,monto_abonado,fecha_abono,
                 medio_pago,notas,fecha_creacion)
                VALUES(@id_abono,@id_credito,@monto_abonado,@fecha_abono,
                 @medio_pago,@notas,@fecha_creacion)`);
            for (const a of seedData.abonos) insA.run(a);

            // 12. Correlativos — continúan desde donde terminó el demo
            const upd = rawDb.prepare(`INSERT OR REPLACE INTO config (clave,valor) VALUES (@clave,@valor)`);
            upd.run({ clave: 'correlativo_boleta',  valor: String(seedData.config.boleta_counter) });
            upd.run({ clave: 'correlativo_factura', valor: String(seedData.config.factura_counter) });
        });

        rawDb.pragma('foreign_keys = OFF');
        cargar();
        rawDb.pragma('foreign_keys = ON');

        const n = t => rawDb.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
        logger.info('DEMO', 'Datos de prueba cargados correctamente');

        res.json({
            ok: true,
            mensaje: 'Datos de demostración cargados correctamente',
            resumen: {
                productos:   n('productos'),
                clientes:    n('clientes'),
                ventas:      n('ventas'),
                compras:     n('compras'),
                movimientos: n('movimientos'),
                creditos:    n('creditos'),
                abonos:      n('abonos'),
            },
        });
    } catch (err) {
        logger.error('DEMO', 'Error al cargar datos de prueba:', err.message);
        try { db.db.pragma('foreign_keys = ON'); } catch (_) {}
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;

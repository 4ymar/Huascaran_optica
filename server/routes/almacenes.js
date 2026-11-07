const router = require('express').Router();
const { randomUUID } = require('crypto');
const db = require('../data/database');
const { requireRole } = require('../middleware/auth');

router.get('/', requireRole('ADMIN', 'ENCARGADO_ALMACEN'), (_req, res) => {
    try {
        const depositoId = db.config.obtener('almacen_deposito_id') || '';
        const rows = db.db.prepare(`
            SELECT a.*,
                   COALESCE(SUM(sa.stock_actual), 0) AS stock_total,
                   COUNT(sa.id_producto) AS productos_con_stock
            FROM almacenes a
            LEFT JOIN stock_almacen sa ON sa.id_almacen = a.id_almacen
            GROUP BY a.id_almacen
            ORDER BY a.es_principal DESC, a.nombre ASC
        `).all().map(r => ({
            ...r,
            es_principal: Boolean(r.es_principal),
            es_deposito: r.id_almacen === depositoId,
        }));
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id/stock', requireRole('ADMIN', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        const rows = db.db.prepare(`
            SELECT sa.*, p.sku, p.nombre, p.categoria, p.unidad_medida
            FROM stock_almacen sa
            JOIN productos p ON p.id_producto = sa.id_producto
            WHERE sa.id_almacen = ?
            ORDER BY p.nombre ASC
        `).all(req.params.id);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireRole('ADMIN'), (req, res) => {
    try {
        const { nombre, descripcion = '' } = req.body;
        if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Nombre obligatorio.' });
        const almacen = {
            id_almacen: randomUUID(),
            nombre: String(nombre).trim(),
            descripcion: String(descripcion || '').trim(),
            fecha_creacion: new Date().toISOString(),
        };
        db.db.prepare(`
            INSERT INTO almacenes (id_almacen, nombre, descripcion, es_principal, estado, fecha_creacion)
            VALUES (@id_almacen, @nombre, @descripcion, 0, 1, @fecha_creacion)
        `).run(almacen);
        res.status(201).json(almacen);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireRole('ADMIN'), (req, res) => {
    try {
        const { nombre, descripcion = '', estado = 1 } = req.body;
        if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Nombre obligatorio.' });
        const result = db.db.prepare(`
            UPDATE almacenes SET nombre = ?, descripcion = ?, estado = ?
            WHERE id_almacen = ? AND es_principal = 0
        `).run(String(nombre).trim(), String(descripcion || '').trim(), estado ? 1 : 0, req.params.id);
        if (!result.changes) return res.status(404).json({ error: 'Almacen no encontrado o no editable.' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/transferir', requireRole('ADMIN', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        const { id_producto, desde_almacen, hacia_almacen, cantidad, motivo = '' } = req.body;
        const qty = Number(cantidad || 0);
        if (!id_producto || !desde_almacen || !hacia_almacen || qty <= 0) {
            return res.status(400).json({ error: 'Producto, almacenes y cantidad son obligatorios.' });
        }
        if (desde_almacen === hacia_almacen) {
            return res.status(400).json({ error: 'Los almacenes deben ser distintos.' });
        }

        const now = new Date().toISOString();
        const result = db.db.transaction(() => {
            const prod = db.db.prepare(`SELECT nombre FROM productos WHERE id_producto = ?`).get(id_producto);
            if (!prod) throw new Error('Producto no encontrado.');

            const almOrigen = db.db.prepare(`SELECT id_almacen, nombre FROM almacenes WHERE id_almacen = ? AND estado = 1`).get(desde_almacen);
            const almDestino = db.db.prepare(`SELECT id_almacen, nombre FROM almacenes WHERE id_almacen = ? AND estado = 1`).get(hacia_almacen);
            if (!almOrigen) throw new Error(`Almacén origen no encontrado o inactivo.`);
            if (!almDestino) throw new Error(`Almacén destino no encontrado o inactivo.`);

            const origenStockRow = db.db.prepare(`
                SELECT COALESCE(stock_actual, 0) AS stock_actual FROM stock_almacen WHERE id_almacen = ? AND id_producto = ?
            `).get(desde_almacen, id_producto);
            const origenStockAnterior = origenStockRow ? Number(origenStockRow.stock_actual) : 0;

            if (origenStockAnterior < qty) {
                throw new Error(`Stock insuficiente en almacén origen (${almOrigen.nombre}). Disponible: ${origenStockAnterior}`);
            }

            const destinoStockRow = db.db.prepare(`
                SELECT COALESCE(stock_actual, 0) AS stock_actual FROM stock_almacen WHERE id_almacen = ? AND id_producto = ?
            `).get(hacia_almacen, id_producto);
            const destinoStockAnterior = destinoStockRow ? Number(destinoStockRow.stock_actual) : 0;

            // Mutar stock vía ajustarStock (neto 0 en productos.stock_actual, -qty en origen, +qty en destino)
            db.productos.ajustarStock(id_producto, desde_almacen, -qty);
            db.productos.ajustarStock(id_producto, hacia_almacen, qty);

            const insMov = db.db.prepare(`
                INSERT INTO movimientos (id_movimiento, fecha_hora, id_producto, nombre_producto,
                tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia, motivo, usuario, id_almacen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const usuario = req.user?.username || 'admin';
            const motivoSalida = motivo ? `Transferencia a ${almDestino.nombre}: ${motivo.trim()}` : `Transferencia a ${almDestino.nombre}`;
            const motivoEntrada = motivo ? `Transferencia desde ${almOrigen.nombre}: ${motivo.trim()}` : `Transferencia desde ${almOrigen.nombre}`;

            // Movimiento 1: SALIDA en origen
            insMov.run(
                randomUUID(), now, id_producto, prod.nombre,
                'SALIDA', qty, origenStockAnterior, origenStockAnterior - qty,
                `TRANSF-SALIDA`, motivoSalida, usuario, desde_almacen
            );

            // Movimiento 2: ENTRADA en destino
            insMov.run(
                randomUUID(), now, id_producto, prod.nombre,
                'ENTRADA', qty, destinoStockAnterior, destinoStockAnterior + qty,
                `TRANSF-ENTRADA`, motivoEntrada, usuario, hacia_almacen
            );

            return { ok: true };
        })();

        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;

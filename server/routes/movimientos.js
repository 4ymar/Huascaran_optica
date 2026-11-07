const router       = require('express').Router();
const db           = require('../data/database');

const BUSINESS_UTC_OFFSET_MINUTES = -300;

const { randomUUID: uuidv4 } = require('crypto');
const { auditLog } = require('../middleware/logger');
const { requireRole } = require('../middleware/auth');

// GET all movements
router.get('/', requireRole('ADMIN', 'ENCARGADO_ALMACEN'), (req, res) => {
  try {
    const { producto, tipo, fecha_desde, fecha_hasta, id_almacen } = req.query;

    let movimientos = db.movimientos.listar({
      limite: 500,
      offset: 0,
      id_almacen: id_almacen || null,
      fecha_desde: fecha_desde || null,
      fecha_hasta: fecha_hasta || null,
    });

    if (producto) movimientos = movimientos.filter(m =>
      m.id_producto === producto ||
      m.nombre_producto.toLowerCase().includes(producto.toLowerCase())
    );
    if (tipo) movimientos = movimientos.filter(m => m.tipo_movimiento === tipo);

    res.json(movimientos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST manual adjustment
router.post('/ajuste', requireRole('ADMIN', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        const { id_producto, cantidad, tipo, motivo, id_almacen } = req.body;

        if (!motivo || !motivo.trim()) {
            return res.status(400).json({ error: 'El motivo del ajuste es obligatorio' });
        }
        if (tipo !== 'ENTRADA' && tipo !== 'SALIDA') {
            return res.status(400).json({ error: 'El tipo debe ser ENTRADA o SALIDA' });
        }

        const cantidadNum = Number(cantidad);
        if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
            return res.status(400).json({ error: 'La cantidad debe ser un número mayor a cero' });
        }

        const LIMITE_MAXIMO_AJUSTE = 100000;
        if (cantidadNum > LIMITE_MAXIMO_AJUSTE) {
            return res.status(400).json({ error: `La cantidad no puede superar ${LIMITE_MAXIMO_AJUSTE.toLocaleString('es-PE')} unidades por ajuste` });
        }

        const idAlmacen = id_almacen || db.config.obtener('almacen_tienda_id') || db.config.obtener('almacen_principal_id') || 'alm-principal';
        const almacenExiste = db.db.prepare(`SELECT 1 FROM almacenes WHERE id_almacen = ? AND estado = 1`).get(idAlmacen);
        if (!almacenExiste) {
            return res.status(400).json({ error: 'Almacén no encontrado o inactivo' });
        }

        const prod = db.productos.obtener(id_producto);
        if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

        const stockAnterior = prod.stock_actual;
        const nuevoStock    = tipo === 'ENTRADA'
            ? stockAnterior + cantidadNum
            : Math.max(0, stockAnterior - cantidadNum);

        if (tipo === 'SALIDA') {
            const stockAlm = db.db.prepare(`SELECT COALESCE(stock_actual, 0) as stock_actual FROM stock_almacen WHERE id_almacen = ? AND id_producto = ?`).get(idAlmacen, id_producto);
            const dispAlm = stockAlm ? Number(stockAlm.stock_actual) : 0;
            if (dispAlm < cantidadNum) {
                return res.status(400).json({ error: `Stock insuficiente en el almacén seleccionado. Disponible: ${dispAlm}` });
            }
        }

        const deltaStock = tipo === 'ENTRADA' ? cantidadNum : -cantidadNum;

        const ajusteTransaccion = db.db.transaction(() => {
            db.productos.ajustarStock(id_producto, idAlmacen, deltaStock);

            const mov = {
                id_movimiento:   uuidv4(),
                fecha_hora:      new Date().toISOString(),
                id_producto,
                nombre_producto: prod.nombre,
                tipo_movimiento: 'AJUSTE',
                cantidad:        cantidadNum,
                stock_anterior:  stockAnterior,
                stock_nuevo:     nuevoStock,
                referencia:      'AJUSTE_MANUAL',
                motivo:          motivo.trim(),
                usuario:         req.user?.username || 'admin',
                id_almacen:      idAlmacen,
            };

            db.db.prepare(`
                INSERT INTO movimientos (id_movimiento, fecha_hora, id_producto, nombre_producto,
                tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia, motivo, usuario, id_almacen)
                VALUES (@id_movimiento, @fecha_hora, @id_producto, @nombre_producto,
                @tipo_movimiento, @cantidad, @stock_anterior, @stock_nuevo, @referencia, @motivo, @usuario, @id_almacen)
            `).run(mov);

            return mov;
        });

        const movGuardado = ajusteTransaccion();

        auditLog(req, 'AJUSTE_STOCK', 'PRODUCTOS',
            `Ajuste de stock — Producto: "${prod.nombre}" | ` +
            `${tipo}: ${cantidadNum} unidades | ` +
            `Stock: ${stockAnterior} → ${nuevoStock} | ` +
            `Motivo: ${motivo.trim()}`,
            { id_referencia: id_producto, tipo_referencia: 'PRODUCTO' }
        );

        res.status(201).json(movGuardado);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

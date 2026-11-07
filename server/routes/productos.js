const router       = require('express').Router();
const db           = require('../data/database');
const { randomUUID: uuidv4 } = require('crypto');
const { auditLog } = require('../middleware/logger');
const { requireRole } = require('../middleware/auth');

// GET all products
router.get('/', (req, res) => {
    try {
        let productos = [];
        const { search, categoria, id_categoria, estado, stock_level } = req.query;

        productos = search ? db.productos.buscar(search) : db.productos.listar();

        if (categoria)             productos = productos.filter(p => p.categoria === categoria);
        if (id_categoria)          productos = productos.filter(p => String(p.id_categoria) === String(id_categoria));
        if (estado !== undefined)  productos = productos.filter(p => p.estado === (estado === 'true' ? 1 : 0));
        if (stock_level === 'critico') productos = productos.filter(p => p.stock_actual === 0);
        if (stock_level === 'bajo')    productos = productos.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo);
        if (stock_level === 'normal')  productos = productos.filter(p => p.stock_actual > p.stock_minimo);

        res.json(productos.map(p => ({ ...p, estado: p.estado === 1 })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET product by barcode
router.get('/barcode/:codigo', (req, res) => {
    try {
        const codigo   = req.params.codigo.trim();
        const producto = db.db.prepare(
            `SELECT * FROM productos WHERE (codigo_barras = ? OR sku = ?) AND estado = 1 AND eliminado = 0 LIMIT 1`
        ).get(codigo, codigo);

        if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ ...producto, estado: producto.estado === 1 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET product by ID
router.get('/:id', requireRole('ADMIN', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        const producto = db.productos.obtener(req.params.id);
        if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ ...producto, estado: producto.estado === 1 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST new product
router.post('/', requireRole('ADMIN'), (req, res) => {
    try {
        const skuColision = db.db.prepare(
            `SELECT id_producto FROM productos WHERE (sku = ? OR codigo_barras = ?) AND estado = 1`
        ).get(req.body.sku, req.body.sku);
        if (skuColision) return res.status(400).json({ error: 'El SKU ya está en uso (como SKU o código de barras de otro producto)' });

        if (req.body.codigo_barras && req.body.codigo_barras.trim()) {
            const barcode = req.body.codigo_barras.trim();
            const barcodeColision = db.db.prepare(
                `SELECT id_producto FROM productos WHERE (codigo_barras = ? OR sku = ?) AND estado = 1`
            ).get(barcode, barcode);
            if (barcodeColision) return res.status(400).json({ error: 'El código de barras ya está en uso (como código de barras o SKU de otro producto)' });
        }
        
        if (req.body.codigo_producto_sunat && !/^\d{8}$/.test(String(req.body.codigo_producto_sunat).trim())) {
            return res.status(400).json({ error: 'El código de producto SUNAT debe tener 8 dígitos numéricos' });
        }

        const now      = new Date().toISOString();
        const producto = {
            id_producto:         uuidv4(),
            ...req.body,
            descripcion:         req.body.descripcion  || '',
            imagen_url:          req.body.imagen_url   || '',
            estado:              1,
            fecha_creacion:      now,
            fecha_actualizacion: now,
        };
        db.productos.crear(producto);

        auditLog(req, 'CREAR', 'PRODUCTOS',
            `Producto creado: "${producto.nombre}" | ` +
            `SKU: ${producto.sku} | ` +
            `Categoría: ${producto.categoria || 'Sin categoría'} | ` +
            `Precio venta: S/ ${Number(producto.precio_venta).toFixed(2)} | ` +
            `Stock inicial: ${producto.stock_actual}`
        );

        res.status(201).json({ ...producto, estado: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT update product
router.put('/:id', requireRole('ADMIN'), (req, res) => {
    try {
        const skuColision = db.db.prepare(
            `SELECT id_producto FROM productos WHERE (sku = ? OR codigo_barras = ?) AND estado = 1`
        ).get(req.body.sku, req.body.sku);
        if (skuColision && skuColision.id_producto !== req.params.id)
            return res.status(400).json({ error: 'El SKU ya está en uso (como SKU o código de barras de otro producto)' });

        if (req.body.codigo_barras && req.body.codigo_barras.trim()) {
            const barcode = req.body.codigo_barras.trim();
            const barcodeColision = db.db.prepare(
                `SELECT id_producto FROM productos WHERE (codigo_barras = ? OR sku = ?) AND estado = 1`
            ).get(barcode, barcode);
            if (barcodeColision && barcodeColision.id_producto !== req.params.id)
                return res.status(400).json({ error: 'El código de barras ya está en uso (como código de barras o SKU de otro producto)' });
        }

        const current = db.productos.obtener(req.params.id);
        if (!current) return res.status(404).json({ error: 'Producto no encontrado' });

        if (req.body.codigo_producto_sunat && !/^\d{8}$/.test(String(req.body.codigo_producto_sunat).trim())) {
            return res.status(400).json({ error: 'El código de producto SUNAT debe tener 8 dígitos numéricos' });
        }
        
        const now     = new Date().toISOString();
        const { stock_actual: _ignorarStock, ...bodySinStock } = req.body;
        const updated = {
            ...current,
            ...bodySinStock,
            descripcion:         req.body.descripcion || current.descripcion || '',
            imagen_url:          req.body.imagen_url  || current.imagen_url  || '',
            estado:              req.body.estado === false ? 0 : 1,
            fecha_actualizacion: now,
        };
        db.productos.actualizar(updated);

        // Construir detalle con solo los campos que cambiaron
        const cambios = [];
        if (current.nombre       !== updated.nombre)       cambios.push(`Nombre: "${current.nombre}" → "${updated.nombre}"`);
        if (current.precio_venta !== updated.precio_venta) cambios.push(`Precio venta: S/ ${Number(current.precio_venta).toFixed(2)} → S/ ${Number(updated.precio_venta).toFixed(2)}`);
        if (current.precio_compra!== updated.precio_compra)cambios.push(`Precio compra: S/ ${Number(current.precio_compra).toFixed(2)} → S/ ${Number(updated.precio_compra).toFixed(2)}`);
        if (current.stock_minimo !== updated.stock_minimo) cambios.push(`Stock mínimo: ${current.stock_minimo} → ${updated.stock_minimo}`);
        if (current.categoria    !== updated.categoria)    cambios.push(`Categoría: "${current.categoria}" → "${updated.categoria}"`);
        if (current.estado       !== updated.estado)       cambios.push(updated.estado === 1 ? 'Producto activado' : 'Producto desactivado');

        auditLog(req, 'MODIFICAR', 'PRODUCTOS',
            `Producto modificado: "${current.nombre}" | ` +
            (cambios.length ? cambios.join(' | ') : 'Sin cambios relevantes')
        );

        res.json({ ...updated, estado: updated.estado === 1 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST ajuste de stock (delta, con motivo obligatorio y almacén)
router.post('/:id/stock', requireRole('ADMIN'), (req, res) => {
    try {
        const { delta, motivo, id_almacen } = req.body;

        if (delta === undefined || delta === null || isNaN(Number(delta)) || Number(delta) === 0) {
            return res.status(400).json({ error: 'El delta debe ser un número distinto de cero' });
        }
        if (!motivo || !motivo.trim()) {
            return res.status(400).json({ error: 'El motivo es obligatorio' });
        }

        const idAlmacen = id_almacen || db.config.obtener('almacen_tienda_id') || db.config.obtener('almacen_principal_id') || 'alm-principal';
        const almacenExiste = db.db.prepare(`SELECT 1 FROM almacenes WHERE id_almacen = ? AND estado = 1`).get(idAlmacen);
        if (!almacenExiste) {
            return res.status(400).json({ error: 'Almacén no encontrado o inactivo' });
        }

        const current = db.productos.obtener(req.params.id);
        if (!current) return res.status(404).json({ error: 'Producto no encontrado' });

        const deltaNum   = Number(delta);
        const stockAntes = current.stock_actual;
        const stockNuevo = stockAntes + deltaNum;

        if (stockNuevo < 0) {
            return res.status(400).json({ error: `Stock total insuficiente. Actual: ${stockAntes}, se intentó restar: ${Math.abs(deltaNum)}` });
        }

        if (deltaNum < 0) {
            const stockAlm = db.db.prepare(`SELECT COALESCE(stock_actual, 0) as stock_actual FROM stock_almacen WHERE id_almacen = ? AND id_producto = ?`).get(idAlmacen, current.id_producto);
            const dispAlm = stockAlm ? Number(stockAlm.stock_actual) : 0;
            if (dispAlm + deltaNum < 0) {
                return res.status(400).json({ error: `Stock insuficiente en el almacén seleccionado. Disponible: ${dispAlm}` });
            }
        }

        db.productos.ajustarStock(current.id_producto, idAlmacen, deltaNum);

        db.db.prepare(`
            INSERT INTO movimientos (id_movimiento, fecha_hora, id_producto, nombre_producto,
            tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia, motivo, usuario, id_almacen)
            VALUES (?, ?, ?, ?, 'AJUSTE', ?, ?, ?, 'AJUSTE_PRODUCTO', ?, ?, ?)
        `).run(uuidv4(), new Date().toISOString(), current.id_producto, current.nombre, Math.abs(deltaNum), stockAntes, stockNuevo, motivo.trim(), req.user?.username || 'admin', idAlmacen);

        const updated = db.productos.obtener(current.id_producto);

        auditLog(req, 'AJUSTE_STOCK', 'PRODUCTOS',
            `Ajuste de stock: "${current.nombre}" (SKU: ${current.sku}) | ` +
            `${stockAntes} → ${stockNuevo} (${deltaNum > 0 ? '+' : ''}${deltaNum}) | ` +
            `Motivo: ${motivo.trim()}`,
            { id_referencia: current.id_producto, tipo_referencia: 'PRODUCTO' }
        );

        res.json({ ...updated, estado: updated.estado === 1 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// DELETE product
router.delete('/:id', requireRole('ADMIN'), (req, res) => {
    try {
        const current = db.productos.obtener(req.params.id);
        if (!current) return res.status(404).json({ error: 'Producto no encontrado' });

        const resultado = db.productos.eliminar(req.params.id);

        auditLog(req, 'ELIMINAR', 'PRODUCTOS',
            `Producto eliminado: "${current.nombre}" (SKU: ${current.sku}) | ` +
            (resultado.fisico ? 'Borrado físico (sin historial)' : 'Marcado como eliminado (tiene ventas/compras/movimientos asociados)'),
            { id_referencia: current.id_producto, tipo_referencia: 'PRODUCTO' }
        );

        res.json({ ok: true, fisico: resultado.fisico });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
module.exports = router;

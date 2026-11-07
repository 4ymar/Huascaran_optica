const router       = require('express').Router();
const db           = require('../data/database');
const { randomUUID: uuidv4 } = require('crypto');
const { auditLog } = require('../middleware/logger');
const { requireRole } = require('../middleware/auth');
const { decryptText } = require('../security/secrets');
const { getProvider } = require('../services/cpe/providerFactory');
const logger = require('../logger');
const fs = require('fs');

// ── Helper: registrar trazabilidad de una operación CPE en cpe_eventos ──
function registrarEventoCpe({ id_venta, operacion, estado, request, response, mensaje, usuario }) {
    try {
        db.db.prepare(`
            INSERT INTO cpe_eventos
                (id_evento, id_venta, operacion, estado, request_json, response_json, mensaje, usuario, fecha_hora)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            uuidv4(),
            id_venta,
            operacion,
            estado,
            request ? JSON.stringify(request) : null,
            response ? JSON.stringify(response) : null,
            mensaje || '',
            usuario || 'sistema',
            new Date().toISOString()
        );
    } catch (err) {
        logger.error('VENTAS', 'No se pudo registrar evento CPE de anulacion:', err.message);
    }
}

// ── Helper: dejar constancia del intento/resultado de la baja en cpe_documentos ──
function registrarDocumentoAnulacion({ venta, proveedor, estado, response, error, usuario }) {
    const ahora = new Date().toISOString();
    const [serie, numero] = String(venta.numero_comprobante || '').split('-');
    const previo = db.db.prepare(`
        SELECT id_cpe FROM cpe_documentos
        WHERE proveedor = ? AND tipo_comprobante = ? AND serie = ? AND numero = ?
    `).get(proveedor, venta.tipo_comprobante, serie, numero);

    if (!previo) return;

    db.db.prepare(`
        UPDATE cpe_documentos SET
            estado = ?,
            response_json = ?,
            ultimo_error = ?,
            intentos = intentos + 1,
            fecha_actualizacion = ?,
            usuario = ?
        WHERE id_cpe = ?
    `).run(estado, response ? JSON.stringify(response) : null, error || '', ahora, usuario || 'sistema', previo.id_cpe);
}

// ── Formas de pago válidas ────────────────────────────────────
// EFECTIVO | YAPE_PLIN | TRANSFERENCIA | MIXTO | CREDITO
const FORMAS_PAGO_VALIDAS = ['EFECTIVO', 'YAPE_PLIN', 'TRANSFERENCIA', 'MIXTO', 'CREDITO'];

// GET all sales
router.get('/', (req, res) => {
    try {
        const { fecha_desde, fecha_hasta, cliente, estado, search, page = 1, limit = 50 } = req.query;

        const limitNum = Math.min(Number(limit) || 50, 1000);
        const pageNum = Math.max(Number(page) || 1, 1);
        const offset = (pageNum - 1) * limitNum;

        let baseQuery = `
            FROM ventas v
            LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
            LEFT JOIN cpe_documentos nc
                ON nc.id_venta = v.id_venta
            AND nc.tipo_comprobante = 'NOTA_CREDITO'
            AND nc.fecha_creacion = (
                    SELECT MAX(fecha_creacion) FROM cpe_documentos
                    WHERE id_venta = v.id_venta AND tipo_comprobante = 'NOTA_CREDITO'
            )
            WHERE 1=1
        `;
        const params = [];

        if (fecha_desde) { baseQuery += ` AND v.fecha_hora >= ?`; params.push(fecha_desde); }
        if (fecha_hasta) { baseQuery += ` AND v.fecha_hora <= ?`; params.push(fecha_hasta + 'T23:59:59'); }
        if (cliente)     { baseQuery += ` AND v.id_cliente = ?`;  params.push(cliente); }
        if (estado)      { baseQuery += ` AND v.estado = ?`;      params.push(estado); }
        if (search) {
            baseQuery += ` AND (v.numero_venta LIKE ? OR v.numero_comprobante LIKE ? OR c.nombre_razon_social LIKE ?)`;
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
        }

        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        const total = db.db.prepare(countQuery).get(...params).total;

        let query = `
            SELECT v.*,
                c.nombre_razon_social  AS cliente_nombre,
                c.tipo_documento       AS cliente_tipo_doc,
                c.numero_documento     AS cliente_num_doc,
                nc.enlace_pdf          AS nota_credito_enlace_pdf,
                nc.codigo_hash         AS nota_credito_hash,
                (SELECT COUNT(*) FROM logs WHERE tipo_referencia = 'VENTA' AND id_referencia = v.id_venta AND accion = 'MODIFICAR') AS veces_editada
            ${baseQuery}
            ORDER BY v.fecha_hora DESC
            LIMIT ? OFFSET ?
        `;

        let ventas = db.db.prepare(query).all(...params, limitNum, offset);

        // Adjuntar cliente como objeto y detalles
        ventas = ventas.map(v => {
            const detalles = db.db.prepare(
                `SELECT nombre_producto, cantidad, precio_unitario, descuento_linea, subtotal_linea 
                 FROM detalle_ventas WHERE id_venta = ?`
            ).all(v.id_venta);

            return {
                ...v,
                cliente: v.id_cliente ? {
                    nombre_razon_social: v.cliente_nombre,
                    tipo_documento:      v.cliente_tipo_doc,
                    numero_documento:    v.cliente_num_doc,
                } : null,
                detalles,
            };
        });

        res.json(ventas);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET sale by ID
router.get('/:id', (req, res) => {
    try {
        const venta = db.ventas.obtener(req.params.id);
        if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
        const detalles = db.ventas.obtenerDetalle(venta.id_venta);
        const cliente  = venta.id_cliente ? db.clientes.obtener(venta.id_cliente) : null;

        let credito = null;
        if (venta.forma_pago === 'CREDITO') {
            credito = db.db.prepare(`SELECT * FROM creditos WHERE id_venta = ? LIMIT 1`).get(venta.id_venta) || null;
            if (credito) {
                const abonos = db.db.prepare(`SELECT * FROM abonos WHERE id_credito = ? ORDER BY fecha_abono ASC`).all(credito.id_credito);
                const totalAbonado = abonos.reduce((sum, a) => sum + Number(a.monto_abonado), 0);
                const adelanto     = abonos.find(a => a.notas === 'Adelanto al momento de la venta') || null;
                credito = {
                    ...credito,
                    total_abonado:      Math.round(totalAbonado * 100) / 100,
                    saldo_pendiente:    Math.round((credito.monto_total - totalAbonado) * 100) / 100,
                    monto_adelanto:     adelanto ? Number(adelanto.monto_abonado) : 0,
                    medio_pago_adelanto: adelanto ? adelanto.medio_pago : null,
                };
            }
        }

        res.json({ ...venta, detalles, cliente, credito });
    } catch (e) {
        logger.error('VENTAS', 'Error al obtener venta:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST new sale
router.post('/', (req, res) => {
    try {
        const {
            items, id_cliente, tipo_comprobante, forma_pago, notas, descuento = 0,
            es_credito, monto_adelanto, medio_pago_adelanto, fecha_vencimiento, notas_credito,
            // Mixto: efectivo + yape/plin (ya NO existe monto_tarjeta)
            monto_efectivo = null, monto_yape_plin = null,
        } = req.body;

        if (!items || items.length === 0)
            return res.status(400).json({ error: 'La venta debe tener al menos un producto' });

        // ── Validar forma de pago ───────────────────────────────
        const _fp = es_credito ? 'CREDITO' : (forma_pago || 'EFECTIVO');
        if (es_credito && !id_cliente)
            return res.status(400).json({ error: 'Se requiere un cliente para venta al fiado' });
        if (!FORMAS_PAGO_VALIDAS.includes(_fp))
            return res.status(400).json({ error: `Forma de pago inválida. Válidas: ${FORMAS_PAGO_VALIDAS.join(', ')}` });

        // (Validación de stock movida a database.js para atomicidad)

        const now     = new Date();
        const mesAnio = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

        const ventasMesRow = db.db.prepare(`SELECT COUNT(*) as c FROM ventas WHERE numero_venta LIKE ?`).get(`VTA-${mesAnio}-%`);
        const numVenta     = `VTA-${mesAnio}-${String((ventasMesRow.c || 0) + 1).padStart(3, '0')}`;

        // ── Correlativo comprobante ─────────────────────────────
        const idVenta = uuidv4();
        let subtotalTotal = 0;
        const detalles = [];

        for (const item of items) {
            const prod = db.productos.obtener(item.id_producto);
            if (!prod) {
                return res.status(400).json({ error: `Producto no encontrado: ${item.id_producto}` });
            }

            const cantidad = Number(item.cantidad);
            if (!Number.isFinite(cantidad) || cantidad <= 0) {
                return res.status(400).json({ error: `Cantidad invalida para ${prod.nombre}` });
            }

            const subtotalLinea = prod.precio_venta * cantidad - (item.descuento_linea || 0);
            subtotalTotal      += subtotalLinea;
            detalles.push({
                id_detalle:      uuidv4(),
                id_venta:        idVenta,
                id_producto:     prod.id_producto,
                nombre_producto: prod.nombre,
                cantidad,
                precio_unitario: prod.precio_venta,
                descuento_linea: item.descuento_linea || 0,
                subtotal_linea:  subtotalLinea,
                costo_unitario:  prod.precio_compra,
            });
        }

        const subtotalSinIgv = Math.round((subtotalTotal / 1.18) * 100) / 100;
        const igv             = Math.round((subtotalTotal - subtotalSinIgv) * 100) / 100;
        const totalFinal      = subtotalTotal - (descuento || 0);
        const sesionCaja      = db.caja.obtenerSesionAbierta();

        // ── Calcular montos por canal ────────────────────────────
        // EFECTIVO | YAPE_PLIN | TRANSFERENCIA | MIXTO (ef+yape) | CREDITO
        let _mEfectivo, _mYape;

        if (_fp === 'EFECTIVO') {
            _mEfectivo = totalFinal;
            _mYape     = 0;
        } else if (_fp === 'YAPE_PLIN') {
            _mEfectivo = 0;
            _mYape     = totalFinal;
        } else if (_fp === 'TRANSFERENCIA') {
            // Se registra en total_otros de caja (canal digital)
            _mEfectivo = 0;
            _mYape     = 0;
        } else if (_fp === 'MIXTO') {
            // MIXTO = efectivo + yape/plin; se valida que sumen el total
            _mEfectivo = monto_efectivo  !== null ? Number(monto_efectivo)  : 0;
            _mYape     = monto_yape_plin !== null ? Number(monto_yape_plin) : 0;
            const sumaM = Math.round((_mEfectivo + _mYape) * 100) / 100;
            if (Math.abs(sumaM - totalFinal) > 0.02)
                return res.status(400).json({
                    error: `Los montos del pago mixto (S/ ${sumaM.toFixed(2)}) no coinciden con el total (S/ ${totalFinal.toFixed(2)})`,
                });
        } else {
            // CREDITO
            _mEfectivo = 0;
            _mYape     = 0;
        }

        // ── Validar Boletas > S/ 700.00 (Exigencia SUNAT) ────────
        if (tipo_comprobante === 'BOLETA' && totalFinal > 700) {
            let numDoc = '';
            if (id_cliente) {
                const cli = db.clientes.obtener(id_cliente);
                if (cli?.numero_documento) numDoc = String(cli.numero_documento).trim();
            }
            if (!numDoc || numDoc === '-' || numDoc.length < 8) {
                return res.status(400).json({
                    error: 'Las Boletas de Venta mayores a S/ 700.00 requieren obligatoriamente identificar al cliente con DNI (8 dígitos) o RUC (11 dígitos) según normativa SUNAT.',
                });
            }
        }

        const ventaData = {
            id_venta:           idVenta,
            numero_venta:       numVenta,
            fecha_hora:         now.toISOString(),
            id_cliente:         id_cliente || null,
            tipo_comprobante,
            numero_comprobante: '', // se asigna dentro de la transacción atómica
            subtotal:           subtotalSinIgv,
            igv,
            descuento:          descuento || 0,
            total:              totalFinal,
            forma_pago:         _fp,
            monto_efectivo:     Math.round(_mEfectivo * 100) / 100,
            monto_yape_plin:    Math.round(_mYape     * 100) / 100,
            estado:             'ACTIVA',
            usuario:            req.user?.username || 'admin',
            notas:              notas || '',
            id_sesion_caja:     sesionCaja ? sesionCaja.id_sesion : null,
        };

        const registrarVentaYCorrelativo = db.db.transaction(() => {
            const cfg        = db.config.obtenerTodo();
            const esFact     = tipo_comprobante === 'FACTURA';
            const serie      = esFact ? (cfg.serie_factura || 'F001') : (cfg.serie_boleta || 'B001');
            const claveCorr  = esFact ? 'correlativo_factura' : 'correlativo_boleta';
            const correlativo = parseInt(cfg[claveCorr] || '1', 10);
            const numComprobante = `${serie}-${String(correlativo).padStart(8, '0')}`;

            ventaData.numero_comprobante = numComprobante;
            db.ventas.registrar(ventaData, detalles);
            db.config.guardar(claveCorr, String(correlativo + 1));
            return numComprobante;
        });

        const numComprobante = registrarVentaYCorrelativo();

        // ── Crédito / fiado ─────────────────────────────────────
        if (es_credito) {
            const adelanto  = Number(monto_adelanto) || 0;
            const ahora     = now.toISOString();
            const idCredito = uuidv4();

            db.db.prepare(`
                INSERT INTO creditos (id_credito, id_cliente, id_venta, monto_total, estado, fecha_vencimiento, notas, fecha_creacion)
                VALUES (?, ?, ?, ?, 'PENDIENTE', ?, ?, ?)
            `).run(idCredito, id_cliente, idVenta, totalFinal, fecha_vencimiento || null, notas_credito || '', ahora);

            if (adelanto > 0) {
                // Validar medio de pago del adelanto (sin tarjeta)
                const medioAdelanto = ['EFECTIVO', 'YAPE_PLIN', 'TRANSFERENCIA'].includes(medio_pago_adelanto)
                    ? medio_pago_adelanto
                    : 'EFECTIVO';

                db.db.prepare(`
                    INSERT INTO abonos (id_abono, id_credito, monto_abonado, fecha_abono, medio_pago, notas, fecha_creacion)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(uuidv4(), idCredito, adelanto, ahora, medioAdelanto, 'Adelanto al momento de la venta', ahora);

                const nuevoEstado = adelanto >= totalFinal - 0.01 ? 'PAGADO_TOTAL' : 'PAGADO_PARCIAL';
                db.db.prepare(`UPDATE creditos SET estado = ? WHERE id_credito = ?`).run(nuevoEstado, idCredito);

                // ── Registrar adelanto en caja activa ──────────────
                try {
                    const sesionAdelanto = db.caja.obtenerSesionAbierta();
                    if (sesionAdelanto) {
                        const clienteNombreAd = db.clientes.obtener(id_cliente)?.nombre_razon_social || 'Cliente';
                        db.caja.registrarMovimiento({
                            id_movimiento_caja: uuidv4(),
                            id_sesion:          sesionAdelanto.id_sesion,
                            tipo:               'INGRESO',
                            monto:              adelanto,
                            concepto:           `Adelanto venta al fiado — ${clienteNombreAd}`,
                            medio_pago:         medioAdelanto,
                            referencia_tipo:    'ABONO_CREDITO',
                            referencia_id:      idCredito,
                            fecha_hora:         ahora,
                            usuario:            req.user?.username || req.user?.nombre_completo || 'sistema',
                        });
                    }
                } catch (cajErr) {
                    logger.error('VENTAS', 'Error al registrar adelanto en caja:', cajErr.message);
                }
            }
        }

        // ── Auditoría ───────────────────────────────────────────
        const cliente         = id_cliente ? db.clientes.obtener(id_cliente) : null;
        const nombreCliente   = cliente?.nombre_razon_social || 'Sin cliente';
        const resumenItems    = detalles.map(d => `${d.nombre_producto} x${d.cantidad}`).join(', ');

        let formaPagoTexto;
        if (es_credito) {
            const medioAd = ['EFECTIVO', 'YAPE_PLIN', 'TRANSFERENCIA'].includes(medio_pago_adelanto) ? medio_pago_adelanto : 'EFECTIVO';
            formaPagoTexto = `Al fiado (adelanto S/ ${Number(monto_adelanto || 0).toFixed(2)} vía ${medioAd})`;
        } else if (_fp === 'MIXTO') {
            formaPagoTexto = `Mixto (Efectivo S/ ${_mEfectivo.toFixed(2)} + Yape/Plin S/ ${_mYape.toFixed(2)})`;
        } else {
            formaPagoTexto = _fp;
        }

        auditLog(req, 'CREAR', 'VENTAS',
            `Venta ${numVenta} (${numComprobante}) — ` +
            `Total: S/ ${totalFinal.toFixed(2)} | ` +
            `Cliente: ${nombreCliente} | ` +
            `Pago: ${formaPagoTexto} | ` +
            `Productos: ${resumenItems}`,
            { id_referencia: ventaData.id_venta, tipo_referencia: 'VENTA' }
        );

        res.status(201).json({ ...ventaData, detalles, cliente });
    } catch (err) {
        logger.error('VENTAS', 'Error al procesar venta:', err);
        if (err.message.includes('Stock insuficiente') || err.message.includes('Producto no encontrado')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Error interno al registrar la venta: ' + err.message });
    }
});

// PUT void sale
router.put('/:id/anular', requireRole('ADMIN', 'CAJERO'), async (req, res) => {
    try {
        const { motivo } = req.body;
        if (!motivo) return res.status(400).json({ error: 'El motivo de anulación es obligatorio' });

        const venta = db.ventas.obtener(req.params.id);
        if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
        if (venta.estado === 'ANULADA') return res.status(400).json({ error: 'La venta ya está anulada' });

        const detalles = db.ventas.obtenerDetalle(venta.id_venta);
        const idAlmacenVenta = venta.id_almacen || db.config.obtener('almacen_tienda_id') || db.config.obtener('almacen_principal_id') || 'alm-principal';

        const anularTransaccion = db.db.transaction(() => {
            const insMov      = db.db.prepare(`
                INSERT INTO movimientos (id_movimiento, fecha_hora, id_producto, nombre_producto,
                tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia, motivo, usuario)
                VALUES (@id_movimiento, @fecha_hora, @id_producto, @nombre_producto,
                @tipo_movimiento, @cantidad, @stock_anterior, @stock_nuevo, @referencia, @motivo, @usuario)
            `);
            const updateStock = db.db.prepare(`UPDATE productos SET stock_actual = ? WHERE id_producto = ?`);
            const getStock    = db.db.prepare(`SELECT stock_actual FROM productos WHERE id_producto = ?`);
            const now         = new Date().toISOString();

            for (const d of detalles) {
                const prod = getStock.get(d.id_producto);
                if (prod) {
                    const nuevoStock = prod.stock_actual + d.cantidad;
                    updateStock.run(nuevoStock, d.id_producto);
                    db.db.prepare(`
                        INSERT INTO stock_almacen (id_almacen, id_producto, stock_actual, stock_minimo)
                        VALUES (?, ?, 0, 0)
                        ON CONFLICT(id_almacen, id_producto) DO NOTHING
                    `).run(idAlmacenVenta, d.id_producto);
                    db.db.prepare(`
                        UPDATE stock_almacen SET stock_actual = stock_actual + ?
                        WHERE id_almacen = ? AND id_producto = ?
                    `).run(d.cantidad, idAlmacenVenta, d.id_producto);
                    insMov.run({
                        id_movimiento:   uuidv4(),
                        fecha_hora:      now,
                        id_producto:     d.id_producto,
                        nombre_producto: d.nombre_producto,
                        tipo_movimiento: 'ENTRADA',
                        cantidad:        d.cantidad,
                        stock_anterior:  prod.stock_actual,
                        stock_nuevo:     nuevoStock,
                        referencia:      `ANULACION-${venta.numero_venta}`,
                        motivo,
                        usuario:         req.user?.username || 'admin',
                    });
                }
            }
            db.db.prepare(`UPDATE ventas SET estado = 'ANULADA', notas = ? WHERE id_venta = ?`)
                .run(`ANULADO: ${motivo}`, venta.id_venta);
        });

        anularTransaccion();

        // ── Comunicación de baja a NubeFact (si tiene CPE emitido) ──
        // Regla de negocio vigente: solo se intenta la baja automática el
        // mismo día de emisión (esMismoDiaLima). SUNAT permite hasta 7 días
        // calendario si más adelante quieren ampliar el criterio.
        let bajaCPE = null;
        if (venta.cpe_estado === 'ACEPTADO' || venta.cpe_estado === 'ENVIADO_PENDIENTE_SUNAT') {
            try {
                const configRows = db.db.prepare(`SELECT clave, valor FROM config`).all();
                const cfg = {};
                configRows.forEach(r => { cfg[r.clave] = r.valor; });

                if (cfg.sunat_activo === '1' && cfg.sunat_token && cfg.sunat_url) {
                    if (!esMismoDiaLima(venta.fecha_hora)) {
                        bajaCPE = { ok: false, motivo: 'fuera_de_plazo' };
                        db.db.prepare(`UPDATE ventas SET cpe_estado = 'NOTA_CREDITO_REQUERIDA' WHERE id_venta = ?`)
                           .run(venta.id_venta);
                        registrarEventoCpe({
                            id_venta: venta.id_venta,
                            operacion: 'ANULAR_CPE',
                            estado: 'NOTA_CREDITO_REQUERIDA',
                            mensaje: 'Fuera del plazo para baja automatica (no es el mismo dia de emision)',
                            usuario: req.user?.username,
                        });
                    } else {
                        const proveedorId = cfg.cpe_proveedor || 'nubefact';
                        const provider = getProvider(proveedorId);
                        const sunatToken = decryptText(cfg.sunat_token);

                        bajaCPE = await provider.anular({
                            venta,
                            config: cfg,
                            token: sunatToken,
                            url: cfg.sunat_url,
                            motivo,
                        });

                        const nuevoEstado = bajaCPE.ok ? 'BAJA_ENVIADA' : 'NOTA_CREDITO_REQUERIDA';
                        db.db.prepare(`UPDATE ventas SET cpe_estado = ? WHERE id_venta = ?`)
                           .run(nuevoEstado, venta.id_venta);

                        registrarDocumentoAnulacion({
                            venta,
                            proveedor: proveedorId,
                            estado: nuevoEstado,
                            response: bajaCPE.raw?.body,
                            error: bajaCPE.ok ? '' : (bajaCPE.errorMensaje || 'NubeFact rechazo o no confirmo la baja'),
                            usuario: req.user?.username,
                        });
                        registrarEventoCpe({
                            id_venta: venta.id_venta,
                            operacion: 'ANULAR_CPE',
                            estado: nuevoEstado,
                            request: bajaCPE.payload,
                            response: bajaCPE.raw?.body,
                            mensaje: bajaCPE.ok ? 'Comunicacion de baja enviada a NubeFact' : 'Baja no confirmada; requiere Nota de Credito',
                            usuario: req.user?.username,
                        });
                    }
                }
            } catch (bajaErr) {
                logger.error('VENTAS', 'Error al enviar baja:', bajaErr.message);
                bajaCPE = { ok: false, motivo: 'error_interno' };
                registrarEventoCpe({
                    id_venta: venta.id_venta,
                    operacion: 'ANULAR_CPE',
                    estado: 'ERROR',
                    mensaje: bajaErr.message,
                    usuario: req.user?.username,
                });
            }
        }

        // ── Auditoría anulación ────────────────────────────────
        const resumenItems = detalles.map(d => `${d.nombre_producto} x${d.cantidad}`).join(', ');
        auditLog(req, 'ANULAR', 'VENTAS',
            `Anulación de venta ${venta.numero_venta} — ` +
            `Total: S/ ${Number(venta.total).toFixed(2)} | ` +
            `Motivo: ${motivo} | ` +
            `Stock revertido: ${resumenItems}`,
            { id_referencia: venta.id_venta, tipo_referencia: 'VENTA' }
        );

        res.json({
            ...venta,
            estado: 'ANULADA',
            notas:  `ANULADO: ${motivo}`,
            baja_cpe: bajaCPE,
        });
    } catch (err) {
        logger.error('VENTAS', 'Error al anular venta:', err);
        res.status(500).json({ error: 'Error al anular: ' + err.message });
    }
});

// ── Helper: ¿la venta fue registrada el mismo día (hora Lima)? ──
function esMismoDiaLima(fechaHoraVenta) {
    const ahoraLima   = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const emisionLima = new Date(new Date(fechaHoraVenta).getTime() - 5 * 60 * 60 * 1000);
    return ahoraLima.toISOString().slice(0, 10) === emisionLima.toISOString().slice(0, 10);
}

// PUT editar venta (solo si no se emitió CPE aceptado y es el mismo día)
router.put('/:id/editar', requireRole('ADMIN', 'CAJERO'), (req, res) => {
    try {
        const {
            motivo, items, id_cliente, forma_pago,
            monto_efectivo = null, monto_yape_plin = null,
            fecha_vencimiento = null, notas_credito = '',
        } = req.body;

        if (!motivo) return res.status(400).json({ error: 'El motivo de la edición es obligatorio' });
        if (!items || items.length === 0) return res.status(400).json({ error: 'La venta debe tener al menos un producto' });
        if (!FORMAS_PAGO_VALIDAS.includes(forma_pago))
            return res.status(400).json({ error: `Forma de pago inválida. Válidas: ${FORMAS_PAGO_VALIDAS.join(', ')}` });
        if (forma_pago === 'CREDITO' && !id_cliente)
            return res.status(400).json({ error: 'Se requiere un cliente para venta al fiado' });

        const venta = db.ventas.obtener(req.params.id);
        if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
        if (venta.estado !== 'ACTIVA') return res.status(400).json({ error: 'Solo se pueden editar ventas activas' });
        if (venta.cpe_estado === 'ACEPTADO' || venta.cpe_estado === 'ENVIADO_PENDIENTE_SUNAT') return res.status(400).json({ error: 'No se puede editar: el comprobante ya fue emitido a NubeFact' });
        if (!esMismoDiaLima(venta.fecha_hora)) return res.status(400).json({ error: 'Solo se puede editar una venta el mismo día en que se registró' });

        const edicionesPrevias = db.db.prepare(
            `SELECT COUNT(*) AS total FROM logs WHERE tipo_referencia = 'VENTA' AND id_referencia = ? AND accion = 'MODIFICAR'`
        ).get(venta.id_venta).total;
        if (edicionesPrevias >= 3) return res.status(400).json({ error: 'Esta venta ya alcanzó el máximo de 3 ediciones permitidas' });
        const detallesAnteriores = db.ventas.obtenerDetalle(venta.id_venta);
        const idAlmacen = venta.id_almacen || db.config.obtener('almacen_tienda_id') || db.config.obtener('almacen_principal_id') || 'alm-principal';

        // ── Construir nuevos detalles y validar productos ──────
        let subtotalTotal = 0;
        const detallesNuevos = [];
        for (const item of items) {
            const prod = db.productos.obtener(item.id_producto);
            if (!prod) return res.status(400).json({ error: `Producto no encontrado: ${item.id_producto}` });
            const cantidad = Number(item.cantidad);
            if (!Number.isFinite(cantidad) || cantidad <= 0)
                return res.status(400).json({ error: `Cantidad inválida para ${prod.nombre}` });

            const subtotalLinea = prod.precio_venta * cantidad - (item.descuento_linea || 0);
            subtotalTotal += subtotalLinea;
            detallesNuevos.push({
                id_detalle:      uuidv4(),
                id_venta:        venta.id_venta,
                id_producto:     prod.id_producto,
                nombre_producto: prod.nombre,
                cantidad,
                precio_unitario: prod.precio_venta,
                descuento_linea: item.descuento_linea || 0,
                subtotal_linea:  subtotalLinea,
                costo_unitario:  prod.precio_compra,
            });
        }

        const subtotalSinIgv = Math.round((subtotalTotal / 1.18) * 100) / 100;
        const igv            = Math.round((subtotalTotal - subtotalSinIgv) * 100) / 100;
        const totalFinal      = subtotalTotal - (venta.descuento || 0);

        // ── Validar montos si es MIXTO ──────────────────────────
        let _mEfectivo = 0, _mYape = 0;
        if (forma_pago === 'EFECTIVO') {
            _mEfectivo = totalFinal;
        } else if (forma_pago === 'YAPE_PLIN') {
            _mYape = totalFinal;
        } else if (forma_pago === 'MIXTO') {
            _mEfectivo = monto_efectivo  !== null ? Number(monto_efectivo)  : 0;
            _mYape     = monto_yape_plin !== null ? Number(monto_yape_plin) : 0;
            const suma = Math.round((_mEfectivo + _mYape) * 100) / 100;
            if (Math.abs(suma - totalFinal) > 0.02)
                return res.status(400).json({ error: `Los montos del pago mixto (S/ ${suma.toFixed(2)}) no coinciden con el total (S/ ${totalFinal.toFixed(2)})` });
        }
        // TRANSFERENCIA y CREDITO quedan en 0/0 (igual que en la creación)

        // ── Validar stock disponible (libera lo revertido antes de aplicar lo nuevo) ──
        const disponiblePorProducto = new Map();
        for (const d of detallesAnteriores) {
            const stockAlm = db.db.prepare(`SELECT stock_actual FROM stock_almacen WHERE id_almacen = ? AND id_producto = ?`).get(idAlmacen, d.id_producto);
            const base = disponiblePorProducto.get(d.id_producto) ?? Number(stockAlm?.stock_actual || 0);
            disponiblePorProducto.set(d.id_producto, base + d.cantidad);
        }
        for (const d of detallesNuevos) {
            if (!disponiblePorProducto.has(d.id_producto)) {
                const stockAlm = db.db.prepare(`SELECT stock_actual FROM stock_almacen WHERE id_almacen = ? AND id_producto = ?`).get(idAlmacen, d.id_producto);
                disponiblePorProducto.set(d.id_producto, Number(stockAlm?.stock_actual || 0));
            }
            const disponible = disponiblePorProducto.get(d.id_producto) - d.cantidad;
            if (disponible < 0) {
                return res.status(400).json({ error: `Stock insuficiente para ${d.nombre_producto}. Disponible: ${disponiblePorProducto.get(d.id_producto)}` });
            }
            disponiblePorProducto.set(d.id_producto, disponible);
        }

        // ── Crédito: validar contra abonos ya registrados ──────
        let creditoExistente = null;
        if (venta.forma_pago === 'CREDITO') {
            creditoExistente = db.db.prepare(`SELECT * FROM creditos WHERE id_venta = ?`).get(venta.id_venta) || null;
        }
        let abonadoExistente = 0;
        if (creditoExistente) {
            abonadoExistente = db.db.prepare(`SELECT COALESCE(SUM(monto_abonado),0) AS t FROM abonos WHERE id_credito = ?`).get(creditoExistente.id_credito).t;
        }
        if (venta.forma_pago === 'CREDITO' && forma_pago === 'CREDITO' && abonadoExistente > totalFinal + 0.01) {
            return res.status(400).json({ error: `El nuevo total (S/ ${totalFinal.toFixed(2)}) es menor a lo ya abonado (S/ ${abonadoExistente.toFixed(2)})` });
        }
        if (venta.forma_pago === 'CREDITO' && forma_pago !== 'CREDITO' && abonadoExistente > 0) {
            return res.status(400).json({ error: 'No se puede pasar a contado: este crédito ya tiene abonos registrados' });
        }

        // ── Transacción ──────────────────────────────────────────
        const ahora = new Date().toISOString();
        const editarTransaccion = db.db.transaction(() => {
            const insMov = db.db.prepare(`
                INSERT INTO movimientos (id_movimiento, fecha_hora, id_producto, nombre_producto,
                tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia, motivo, usuario)
                VALUES (@id_movimiento, @fecha_hora, @id_producto, @nombre_producto,
                @tipo_movimiento, @cantidad, @stock_anterior, @stock_nuevo, @referencia, @motivo, @usuario)
            `);
            const getStockAlm = db.db.prepare(`SELECT stock_actual FROM stock_almacen WHERE id_almacen = ? AND id_producto = ?`);

            // Revertir detalle anterior
            for (const d of detallesAnteriores) {
                const antes = Number(getStockAlm.get(idAlmacen, d.id_producto)?.stock_actual || 0);
                db.productos.ajustarStock(d.id_producto, idAlmacen, d.cantidad);
                insMov.run({
                    id_movimiento: uuidv4(), fecha_hora: ahora, id_producto: d.id_producto,
                    nombre_producto: d.nombre_producto, tipo_movimiento: 'ENTRADA',
                    cantidad: d.cantidad, stock_anterior: antes, stock_nuevo: antes + d.cantidad,
                    referencia: `EDICION-${venta.numero_venta}`, motivo, usuario: req.user?.username || 'admin',
                });
            }
            db.db.prepare(`DELETE FROM detalle_ventas WHERE id_venta = ?`).run(venta.id_venta);

            // Aplicar detalle nuevo
            const insDetalle = db.db.prepare(`
                INSERT INTO detalle_ventas (id_detalle, id_venta, id_producto, nombre_producto,
                cantidad, precio_unitario, descuento_linea, subtotal_linea, costo_unitario)
                VALUES (@id_detalle, @id_venta, @id_producto, @nombre_producto,
                @cantidad, @precio_unitario, @descuento_linea, @subtotal_linea, @costo_unitario)
            `);
            for (const d of detallesNuevos) {
                insDetalle.run(d);
                const antes = Number(getStockAlm.get(idAlmacen, d.id_producto)?.stock_actual || 0);
                db.productos.ajustarStock(d.id_producto, idAlmacen, -d.cantidad);
                insMov.run({
                    id_movimiento: uuidv4(), fecha_hora: ahora, id_producto: d.id_producto,
                    nombre_producto: d.nombre_producto, tipo_movimiento: 'SALIDA',
                    cantidad: d.cantidad, stock_anterior: antes, stock_nuevo: antes - d.cantidad,
                    referencia: `EDICION-${venta.numero_venta}`, motivo, usuario: req.user?.username || 'admin',
                });
            }

            // Actualizar cabecera de venta
            db.db.prepare(`
                UPDATE ventas SET
                    id_cliente = ?, forma_pago = ?, monto_efectivo = ?, monto_yape_plin = ?,
                    subtotal = ?, igv = ?, total = ?
                WHERE id_venta = ?
            `).run(id_cliente || null, forma_pago, Math.round(_mEfectivo * 100) / 100, Math.round(_mYape * 100) / 100,
                   subtotalSinIgv, igv, totalFinal, venta.id_venta);

            // Crédito
            if (venta.forma_pago === 'CREDITO' && forma_pago === 'CREDITO' && creditoExistente) {
                const nuevoEstado = abonadoExistente <= 0
                    ? 'PENDIENTE'
                    : (abonadoExistente >= totalFinal - 0.01 ? 'PAGADO_TOTAL' : 'PAGADO_PARCIAL');
                db.db.prepare(`UPDATE creditos SET id_cliente = ?, monto_total = ?, estado = ? WHERE id_credito = ?`)
                    .run(id_cliente, totalFinal, nuevoEstado, creditoExistente.id_credito);
            } else if (venta.forma_pago !== 'CREDITO' && forma_pago === 'CREDITO') {
                db.db.prepare(`
                    INSERT INTO creditos (id_credito, id_cliente, id_venta, monto_total, estado, fecha_vencimiento, notas, fecha_creacion)
                    VALUES (?, ?, ?, ?, 'PENDIENTE', ?, ?, ?)
                `).run(uuidv4(), id_cliente, venta.id_venta, totalFinal, fecha_vencimiento || null, notas_credito || '', ahora);
            } else if (venta.forma_pago === 'CREDITO' && forma_pago !== 'CREDITO' && creditoExistente) {
                db.db.prepare(`DELETE FROM creditos WHERE id_credito = ?`).run(creditoExistente.id_credito);
            }
        });

        editarTransaccion();

        // ── Auditoría ────────────────────────────────────────────
        const resumenAntes   = detallesAnteriores.map(d => `${d.nombre_producto} x${d.cantidad}`).join(', ');
        const resumenDespues = detallesNuevos.map(d => `${d.nombre_producto} x${d.cantidad}`).join(', ');
        auditLog(req, 'MODIFICAR', 'VENTAS',
            `Edición de venta ${venta.numero_venta} — Motivo: ${motivo} | ` +
            `Productos antes: ${resumenAntes} | Productos después: ${resumenDespues} | ` +
            `Forma de pago: ${venta.forma_pago} → ${forma_pago} | ` +
            `Total: S/ ${Number(venta.total).toFixed(2)} → S/ ${totalFinal.toFixed(2)}`,
            { id_referencia: venta.id_venta, tipo_referencia: 'VENTA' }
        );

        const ventaActualizada = db.ventas.obtener(venta.id_venta);
        const detalles = db.ventas.obtenerDetalle(venta.id_venta);
        res.json({ ...ventaActualizada, detalles });
    } catch (err) {
        logger.error('VENTAS', 'Error al editar venta:', err.message);
        res.status(500).json({ error: 'Error al editar la venta: ' + err.message });
    }
});

router.post('/:id/devoluciones', requireRole('ADMIN'), (req, res) => {
    try {
        const { motivo, items = [] } = req.body;
        if (!motivo) return res.status(400).json({ error: 'El motivo de devolucion es obligatorio' });
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Debe indicar al menos un item a devolver' });
        }

        const venta = db.ventas.obtener(req.params.id);
        if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
        if (venta.estado === 'ANULADA') return res.status(400).json({ error: 'No se puede devolver una venta anulada' });

        const detallesVenta = db.ventas.obtenerDetalle(venta.id_venta);
        const detallesById = new Map(detallesVenta.map(d => [d.id_detalle, d]));

        const yaDevuelto = db.db.prepare(`
            SELECT id_detalle_venta, COALESCE(SUM(cantidad), 0) AS cantidad
            FROM detalle_devoluciones dd
            JOIN devoluciones d ON d.id_devolucion = dd.id_devolucion
            WHERE d.id_venta = ?
            GROUP BY id_detalle_venta
        `).all(venta.id_venta).reduce((acc, row) => {
            acc[row.id_detalle_venta] = Number(row.cantidad || 0);
            return acc;
        }, {});

        const detalleDevolucion = [];
        for (const item of items) {
            const detalleVenta = detallesById.get(item.id_detalle_venta);
            const cantidad = Number(item.cantidad || 0);
            if (!detalleVenta) return res.status(400).json({ error: `Item de venta no encontrado: ${item.id_detalle_venta}` });
            if (cantidad <= 0) return res.status(400).json({ error: 'La cantidad devuelta debe ser mayor a cero' });
            const disponible = Number(detalleVenta.cantidad) - Number(yaDevuelto[item.id_detalle_venta] || 0);
            if (cantidad > disponible) {
                return res.status(400).json({ error: `Cantidad excede lo vendido para ${detalleVenta.nombre_producto}. Disponible para devolver: ${disponible}` });
            }
            detalleDevolucion.push({ detalleVenta, cantidad });
        }

        const ahoraLima = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const emisionLima = new Date(new Date(venta.fecha_hora).getTime() - 5 * 60 * 60 * 1000);
        const mismoDia = ahoraLima.toISOString().slice(0, 10) === emisionLima.toISOString().slice(0, 10);
        const requiereNotaCredito = (venta.cpe_estado === 'ACEPTADO' || venta.cpe_estado === 'ENVIADO_PENDIENTE_SUNAT') && !mismoDia;
        const idDevolucion = uuidv4();
        const idAlmacenVenta = venta.id_almacen || db.config.obtener('almacen_tienda_id') || db.config.obtener('almacen_principal_id') || 'alm-principal';
        const now = new Date().toISOString();

        const resultado = db.db.transaction(() => {
            let total = 0;
            db.db.prepare(`
                INSERT INTO devoluciones
                    (id_devolucion, id_venta, fecha_hora, motivo, total, usuario, requiere_nota_credito, estado)
                VALUES (?, ?, ?, ?, 0, ?, ?, 'REGISTRADA')
            `).run(idDevolucion, venta.id_venta, now, motivo, req.user?.username || 'admin', requiereNotaCredito ? 1 : 0);

            const insDetalle = db.db.prepare(`
                INSERT INTO detalle_devoluciones
                    (id_detalle, id_devolucion, id_detalle_venta, id_producto, nombre_producto,
                     cantidad, precio_unitario, subtotal_linea, costo_unitario)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const insMov = db.db.prepare(`
                INSERT INTO movimientos (id_movimiento, fecha_hora, id_producto, nombre_producto,
                tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia, motivo, usuario)
                VALUES (?, ?, ?, ?, 'ENTRADA', ?, ?, ?, ?, ?, ?)
            `);

            for (const item of detalleDevolucion) {
                const d = item.detalleVenta;
                const subtotalLinea = Math.round(Number(d.precio_unitario) * item.cantidad * 100) / 100;
                total += subtotalLinea;

                const prod = db.db.prepare(`SELECT stock_actual FROM productos WHERE id_producto = ?`).get(d.id_producto);
                const stockAnterior = Number(prod?.stock_actual || 0);
                const stockNuevo = stockAnterior + item.cantidad;
                db.db.prepare(`UPDATE productos SET stock_actual = ?, fecha_actualizacion = datetime('now') WHERE id_producto = ?`)
                    .run(stockNuevo, d.id_producto);
                db.db.prepare(`
                    INSERT INTO stock_almacen (id_almacen, id_producto, stock_actual, stock_minimo)
                    VALUES (?, ?, ?, 0)
                    ON CONFLICT(id_almacen, id_producto)
                    DO UPDATE SET stock_actual = stock_actual + excluded.stock_actual
                `).run(idAlmacenVenta, d.id_producto, item.cantidad);

                insDetalle.run(uuidv4(), idDevolucion, d.id_detalle, d.id_producto, d.nombre_producto, item.cantidad, d.precio_unitario, subtotalLinea, d.costo_unitario);
                insMov.run(uuidv4(), now, d.id_producto, d.nombre_producto, item.cantidad, stockAnterior, stockNuevo, `DEVOLUCION-${venta.numero_venta}`, motivo, req.user?.username || 'admin');
            }

            db.db.prepare(`UPDATE devoluciones SET total = ? WHERE id_devolucion = ?`)
                .run(Math.round(total * 100) / 100, idDevolucion);

            if (requiereNotaCredito) {
                db.db.prepare(`UPDATE ventas SET cpe_estado = 'NOTA_CREDITO_REQUERIDA' WHERE id_venta = ?`)
                    .run(venta.id_venta);
            }

            return db.db.prepare(`SELECT * FROM devoluciones WHERE id_devolucion = ?`).get(idDevolucion);
        })();

        auditLog(req, 'CREAR', 'DEVOLUCIONES',
            `Devolucion de venta ${venta.numero_venta} - Total: S/ ${Number(resultado.total).toFixed(2)} | Motivo: ${motivo}`,
            { id_referencia: idDevolucion, tipo_referencia: 'DEVOLUCION' }
        );

        res.status(201).json({
            ...resultado,
            requiere_nota_credito: !!requiereNotaCredito,
            mensaje: requiereNotaCredito
                ? 'Devolucion registrada. Requiere emitir nota de credito manual en NubeFact.'
                : 'Devolucion registrada correctamente.',
        });
    } catch (err) {
        logger.error('VENTAS', 'Error al registrar devolucion:', err.message);
        res.status(500).json({ error: 'Error al registrar devolucion: ' + err.message });
    }
});

router.post('/:id/nota-credito-manual', requireRole('ADMIN'), (req, res) => {
    try {
        const { serie, numero, fecha, observacion = '' } = req.body;
        if (!serie || !numero || !fecha) {
            return res.status(400).json({ error: 'Serie, numero y fecha son obligatorios' });
        }

        const venta = db.ventas.obtener(req.params.id);
        if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

        db.db.prepare(`
            UPDATE ventas SET
                cpe_estado = 'NOTA_CREDITO_REGISTRADA',
                nota_credito_serie = ?,
                nota_credito_numero = ?,
                nota_credito_fecha = ?,
                nota_credito_observacion = ?
            WHERE id_venta = ?
        `).run(String(serie).trim(), String(numero).trim(), String(fecha).trim(), String(observacion).trim(), venta.id_venta);

        auditLog(req, 'MODIFICAR', 'VENTAS',
            `Nota de credito manual registrada para ${venta.numero_venta}: ${serie}-${numero}`,
            { id_referencia: venta.id_venta, tipo_referencia: 'VENTA' }
        );

        res.json({ ok: true, mensaje: 'Nota de credito manual registrada.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

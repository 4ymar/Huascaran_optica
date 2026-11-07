const router = require('express').Router();
const { randomUUID } = require('crypto');
const { db } = require('../data/database');
const { auditLog } = require('../middleware/logger');
const logger = require('../logger');

// ── Medios de pago válidos para abonos (sin tarjeta) ──────────
const MEDIOS_PAGO_VALIDOS = ['EFECTIVO', 'YAPE_PLIN', 'TRANSFERENCIA'];

// ── Inicializar tablas si no existen ──────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS creditos (
        id_credito        TEXT PRIMARY KEY,
        id_cliente        TEXT NOT NULL,
        id_venta          TEXT,
        monto_total       REAL NOT NULL DEFAULT 0,
        estado            TEXT NOT NULL DEFAULT 'PENDIENTE',
        fecha_vencimiento TEXT,
        notas             TEXT DEFAULT '',
        fecha_creacion    TEXT NOT NULL,
        FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente)
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
`);

// ── Helper: enriquecer crédito ─────────────────────────────────
function enriquecerCredito(c) {
    const cliente = db.prepare(`SELECT * FROM clientes WHERE id_cliente = ?`).get(c.id_cliente) || null;
    const venta   = c.id_venta
        ? db.prepare(`SELECT numero_venta, numero_comprobante, total, monto_efectivo, monto_yape_plin FROM ventas WHERE id_venta = ?`).get(c.id_venta)
        : null;
    const pagado  = db.prepare(`SELECT COALESCE(SUM(monto_abonado),0) AS total FROM abonos WHERE id_credito = ?`).get(c.id_credito).total;

    // Corrección de créditos grabados con doble descuento del adelanto
    let montoTotal = c.monto_total;
    if (venta && montoTotal < venta.total - 0.01 && pagado > 0) {
        montoTotal = venta.total;
        db.prepare(`UPDATE creditos SET monto_total = ? WHERE id_credito = ?`).run(montoTotal, c.id_credito);
    }

    // Desglose de abonos por canal
    const desglose = db.prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN medio_pago = 'EFECTIVO'                   THEN monto_abonado ELSE 0 END), 0) AS total_efectivo,
            COALESCE(SUM(CASE WHEN medio_pago IN ('YAPE_PLIN','YAPE','PLIN') THEN monto_abonado ELSE 0 END), 0) AS total_yape_plin,
            COALESCE(SUM(CASE WHEN medio_pago = 'TRANSFERENCIA'              THEN monto_abonado ELSE 0 END), 0) AS total_transferencia
        FROM abonos WHERE id_credito = ?
    `).get(c.id_credito);

    const saldo = Math.max(0, montoTotal - pagado);
    return {
        ...c,
        monto_total:      montoTotal,
        cliente,
        numero_venta:        venta?.numero_venta || '',
        numero_comprobante:  venta?.numero_comprobante || '',
        monto_pagado:     pagado,
        saldo,
        desglose_abonos:  desglose,
    };
}

// ── GET /api/creditos ──────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const { estado, id_cliente } = req.query;
        const hoy = new Date().toISOString();

        db.prepare(`
            UPDATE creditos SET estado = 'VENCIDO'
            WHERE estado IN ('PENDIENTE','PAGADO_PARCIAL')
              AND fecha_vencimiento IS NOT NULL
              AND fecha_vencimiento < ?
        `).run(hoy);

        let query = `SELECT * FROM creditos WHERE 1=1`;
        const params = [];
        if (estado)     { query += ` AND estado = ?`;     params.push(estado); }
        if (id_cliente) { query += ` AND id_cliente = ?`; params.push(id_cliente); }
        query += ` ORDER BY fecha_creacion DESC`;

        const lista = db.prepare(query).all(...params).map(enriquecerCredito);
        const orden = { VENCIDO: 0, PENDIENTE: 1, PAGADO_PARCIAL: 2, PAGADO_TOTAL: 3, ANULADO: 4 };
        lista.sort((a, b) => (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9));

        res.json(lista);
    } catch (err) {
        logger.error('CREDITOS', 'Error al listar créditos:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/creditos/resumen ──────────────────────────────────
router.get('/resumen', (req, res) => {
    try {
        const hoy      = new Date().toISOString();
        const creditos = db.prepare(`SELECT * FROM creditos WHERE estado NOT IN ('ANULADO','PAGADO_TOTAL')`).all();

        let totalDeuda = 0, totalVencido = 0, totalPendiente = 0, countVencido = 0;

        for (const c of creditos) {
            const pagado = db.prepare(`SELECT COALESCE(SUM(monto_abonado),0) AS t FROM abonos WHERE id_credito = ?`).get(c.id_credito).t;
            const saldo  = Math.max(0, c.monto_total - pagado);
            totalDeuda  += saldo;
            if (c.fecha_vencimiento && c.fecha_vencimiento < hoy) { totalVencido += saldo; countVencido++; }
            else { totalPendiente += saldo; }
        }

        res.json({ totalDeuda, totalVencido, totalPendiente, countVencido });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/creditos/:id ──────────────────────────────────────
router.get('/:id', (req, res) => {
    try {
        const credito = db.prepare(`SELECT * FROM creditos WHERE id_credito = ?`).get(req.params.id);
        if (!credito) return res.status(404).json({ error: 'Crédito no encontrado' });

        const cliente        = db.prepare(`SELECT * FROM clientes WHERE id_cliente = ?`).get(credito.id_cliente) || null;
        const venta          = credito.id_venta ? db.prepare(`SELECT * FROM ventas WHERE id_venta = ?`).get(credito.id_venta) : null;
        const detalles_venta = venta ? db.prepare(`SELECT * FROM detalle_ventas WHERE id_venta = ?`).all(venta.id_venta) : [];
        const abonos         = db.prepare(`SELECT * FROM abonos WHERE id_credito = ? ORDER BY fecha_abono DESC`).all(credito.id_credito);
        const monto_pagado   = abonos.reduce((s, a) => s + a.monto_abonado, 0);

        // Corrección de créditos grabados con doble descuento del adelanto
        let montoTotal = credito.monto_total;
        if (venta && montoTotal < venta.total - 0.01 && monto_pagado > 0) {
            montoTotal = venta.total;
            db.prepare(`UPDATE creditos SET monto_total = ? WHERE id_credito = ?`).run(montoTotal, credito.id_credito);
        }

        const saldo = Math.max(0, montoTotal - monto_pagado);

        // Desglose de abonos por canal
        const desglose = {
            total_efectivo:      abonos.filter(a => a.medio_pago === 'EFECTIVO').reduce((s, a) => s + a.monto_abonado, 0),
            total_yape_plin:     abonos.filter(a => ['YAPE_PLIN', 'YAPE', 'PLIN'].includes(a.medio_pago)).reduce((s, a) => s + a.monto_abonado, 0),
            total_transferencia: abonos.filter(a => a.medio_pago === 'TRANSFERENCIA').reduce((s, a) => s + a.monto_abonado, 0),
        };

        res.json({
            ...credito,
            monto_total: montoTotal,
            cliente,
            venta: venta ? { ...venta, detalles: detalles_venta } : null,
            abonos,
            monto_pagado,
            saldo,
            desglose_abonos: desglose,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/creditos/:id/abonos ─────────────────────────────
router.post('/:id/abonos', (req, res) => {
    try {
        const credito = db.prepare(`SELECT * FROM creditos WHERE id_credito = ?`).get(req.params.id);
        if (!credito) return res.status(404).json({ error: 'Crédito no encontrado' });
        if (credito.estado === 'PAGADO_TOTAL') return res.status(400).json({ error: 'Este crédito ya está pagado' });
        if (credito.estado === 'ANULADO')      return res.status(400).json({ error: 'Este crédito está anulado' });

        let { monto_abonado, medio_pago = 'EFECTIVO', notas = '' } = req.body;

        if (!monto_abonado || Number(monto_abonado) <= 0)
            return res.status(400).json({ error: 'El monto del abono debe ser mayor a 0' });

        // Normalizar y validar medio de pago (sin tarjeta)
        if (!MEDIOS_PAGO_VALIDOS.includes(medio_pago)) medio_pago = 'EFECTIVO';

        const pagado = db.prepare(`SELECT COALESCE(SUM(monto_abonado),0) AS t FROM abonos WHERE id_credito = ?`).get(credito.id_credito).t;
        const saldo  = credito.monto_total - pagado;

        if (Number(monto_abonado) > saldo + 0.01)
            return res.status(400).json({ error: `El abono supera el saldo pendiente (S/ ${saldo.toFixed(2)})` });

        const ahora      = new Date().toISOString();
        const nuevoAbono = {
            id_abono:      randomUUID(),
            id_credito:    credito.id_credito,
            monto_abonado: Number(monto_abonado),
            fecha_abono:   ahora,
            medio_pago,
            notas,
            fecha_creacion: ahora,
        };

        db.prepare(`
            INSERT INTO abonos (id_abono, id_credito, monto_abonado, fecha_abono, medio_pago, notas, fecha_creacion)
            VALUES (@id_abono, @id_credito, @monto_abonado, @fecha_abono, @medio_pago, @notas, @fecha_creacion)
        `).run(nuevoAbono);

        const nuevoPagado = pagado + Number(monto_abonado);
        const nuevoEstado = nuevoPagado >= credito.monto_total - 0.01 ? 'PAGADO_TOTAL' : 'PAGADO_PARCIAL';
        db.prepare(`UPDATE creditos SET estado = ? WHERE id_credito = ?`).run(nuevoEstado, credito.id_credito);

        // ── Registrar en caja activa ───────────────────────────
        try {
            const dbCaja     = require('../data/database');
            const sesionCaja = dbCaja.caja.obtenerSesionAbierta();
            if (sesionCaja) {
                const clienteNombre = db.prepare(`SELECT nombre_razon_social FROM clientes WHERE id_cliente = ?`).get(credito.id_cliente)?.nombre_razon_social || 'Cliente';
                dbCaja.caja.registrarMovimiento({
                    id_movimiento_caja: randomUUID(),
                    id_sesion:          sesionCaja.id_sesion,
                    tipo:               'INGRESO',
                    monto:              Number(monto_abonado),
                    concepto:           `Abono crédito — ${clienteNombre}`,
                    medio_pago,
                    referencia_tipo:    'ABONO_CREDITO',
                    referencia_id:      nuevoAbono.id_abono,
                    fecha_hora:         ahora,
                    usuario:            req.user?.username || req.user?.nombre_completo || 'sistema',
                });
            }
        } catch (cajErr) {
            logger.error('CREDITOS', 'Error al registrar abono en caja:', cajErr.message);
        }

        // ── Auditoría ──────────────────────────────────────────
        const clienteRow    = db.prepare(`SELECT nombre_razon_social AS nombre FROM clientes WHERE id_cliente = ?`).get(credito.id_cliente);
        const nombreCliente = clienteRow?.nombre || credito.id_cliente;
        const saldoNuevo    = Math.max(0, credito.monto_total - nuevoPagado);

        auditLog(req, 'MODIFICAR', 'CREDITOS',
            `Abono de S/ ${Number(monto_abonado).toFixed(2)} — ` +
            `Cliente: ${nombreCliente} | ` +
            `Medio de pago: ${medio_pago} | ` +
            `Saldo anterior: S/ ${saldo.toFixed(2)} | ` +
            `Saldo restante: S/ ${saldoNuevo.toFixed(2)} | ` +
            `Estado: ${nuevoEstado}`
        );

        res.json({
            abono:        nuevoAbono,
            credito:      { ...credito, estado: nuevoEstado },
            saldo:        saldoNuevo,
            monto_pagado: nuevoPagado,
        });
    } catch (err) {
        logger.error('CREDITOS', 'Error al registrar abono:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /api/creditos/:id ──────────────────────────────────────
router.put('/:id', (req, res) => {
    try {
        const credito = db.prepare(`SELECT * FROM creditos WHERE id_credito = ?`).get(req.params.id);
        if (!credito) return res.status(404).json({ error: 'Crédito no encontrado' });

        const sets = [], vals = [];
        if (req.body.fecha_vencimiento !== undefined) { sets.push('fecha_vencimiento = ?'); vals.push(req.body.fecha_vencimiento); }
        if (req.body.notas !== undefined)             { sets.push('notas = ?');             vals.push(req.body.notas); }
        if (req.body.estado !== undefined)            { sets.push('estado = ?');            vals.push(req.body.estado); }

        if (sets.length === 0) return res.json(credito);

        vals.push(req.params.id);
        db.prepare(`UPDATE creditos SET ${sets.join(', ')} WHERE id_credito = ?`).run(...vals);
        const actualizado = db.prepare(`SELECT * FROM creditos WHERE id_credito = ?`).get(req.params.id);

        const cambios = [];
        if (req.body.fecha_vencimiento !== undefined) cambios.push(`Vencimiento: ${req.body.fecha_vencimiento || 'sin fecha'}`);
        if (req.body.estado !== undefined)            cambios.push(`Estado: ${req.body.estado}`);
        if (req.body.notas !== undefined)             cambios.push(`Notas actualizadas`);

        if (cambios.length) {
            const clienteRow = db.prepare(`SELECT nombre_razon_social AS nombre FROM clientes WHERE id_cliente = ?`).get(credito.id_cliente);
            auditLog(req, 'MODIFICAR', 'CREDITOS',
                `Crédito modificado — Cliente: ${clienteRow?.nombre || credito.id_cliente} | ` +
                cambios.join(' | ')
            );
        }

        res.json(actualizado);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/creditos/:id/abonos/:id_abono ─────────────────
router.delete('/:id/abonos/:id_abono', (req, res) => {
    try {
        const credito = db.prepare(`SELECT * FROM creditos WHERE id_credito = ?`).get(req.params.id);
        if (!credito) return res.status(404).json({ error: 'Crédito no encontrado' });

        const abono = db.prepare(`SELECT * FROM abonos WHERE id_abono = ? AND id_credito = ?`).get(req.params.id_abono, req.params.id);
        if (!abono) return res.status(404).json({ error: 'Abono no encontrado' });

        db.prepare(`DELETE FROM abonos WHERE id_abono = ?`).run(req.params.id_abono);

        const pagado      = db.prepare(`SELECT COALESCE(SUM(monto_abonado),0) AS t FROM abonos WHERE id_credito = ?`).get(credito.id_credito).t;
        const nuevoEstado = pagado <= 0 ? 'PENDIENTE'
            : pagado >= credito.monto_total - 0.01 ? 'PAGADO_TOTAL'
            : 'PAGADO_PARCIAL';
        db.prepare(`UPDATE creditos SET estado = ? WHERE id_credito = ?`).run(nuevoEstado, credito.id_credito);

        // ── Revertir en caja activa ────────────────────────────
        try {
            const dbCaja     = require('../data/database');
            const sesionCaja = dbCaja.caja.obtenerSesionAbierta();
            if (sesionCaja) {
                const clienteNombre = db.prepare(`SELECT nombre_razon_social FROM clientes WHERE id_cliente = ?`).get(credito.id_cliente)?.nombre_razon_social || 'Cliente';
                dbCaja.caja.registrarMovimiento({
                    id_movimiento_caja: randomUUID(),
                    id_sesion:          sesionCaja.id_sesion,
                    tipo:               'EGRESO',
                    monto:              abono.monto_abonado,
                    concepto:           `Reversa abono crédito — ${clienteNombre}`,
                    medio_pago:         abono.medio_pago,
                    referencia_tipo:    'REVERSA_ABONO',
                    referencia_id:      abono.id_abono,
                    fecha_hora:         new Date().toISOString(),
                    usuario:            req.user?.username || req.user?.nombre_completo || 'sistema',
                });
            }
        } catch (cajErr) {
            logger.error('CREDITOS', 'Error al revertir abono en caja:', cajErr.message);
        }

        // ── Auditoría ──────────────────────────────────────────
        const clienteRow = db.prepare(`SELECT nombre_razon_social AS nombre FROM clientes WHERE id_cliente = ?`).get(credito.id_cliente);
        auditLog(req, 'ELIMINAR', 'CREDITOS',
            `Abono eliminado — ` +
            `Cliente: ${clienteRow?.nombre || credito.id_cliente} | ` +
            `Monto revertido: S/ ${Number(abono.monto_abonado).toFixed(2)} | ` +
            `Medio de pago: ${abono.medio_pago} | ` +
            `Nuevo estado del crédito: ${nuevoEstado}`
        );

        res.json({ ok: true, credito: { ...credito, estado: nuevoEstado } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

const router       = require('express').Router();
const db           = require('../data/database');
const asyncHandler = require('../middleware/asyncHandler');
const { auditLog } = require('../middleware/logger');
const { randomUUID: uuidv4 } = require('crypto');

// ── Valores por defecto seguros para totales (sin tarjeta) ───
const totalesVacios = {
    total_ventas:    0,
    total_efectivo:  0,
    total_yape_plin: 0,
    total_otros:     0,
    cantidad_ventas: 0,
};

const manualesVacios = {
    total_ingresos: 0,
    total_egresos:  0,
};

// ══════════════════════════════════════════════════════════════
//  GET /api/caja/estado
// ══════════════════════════════════════════════════════════════
router.get('/estado', asyncHandler((req, res) => {
    const sesion = db.caja.obtenerSesionAbierta();
    if (!sesion) return res.json({ abierta: false, sesion: null });

    const totales  = { ...totalesVacios, ...db.caja.calcularTotalesSesion(sesion.id_sesion) };
    const manuales = { ...manualesVacios, ...db.caja.calcularMovimientosManuales(sesion.id_sesion) };

    res.json({
        abierta: true,
        sesion: {
            ...sesion,
            ...totales,
            ingresos_manuales: manuales.total_ingresos,
            egresos_manuales:  manuales.total_egresos,
        },
    });
}));

// ══════════════════════════════════════════════════════════════
//  POST /api/caja/abrir
// ══════════════════════════════════════════════════════════════
router.post('/abrir', asyncHandler((req, res) => {
    const existente = db.caja.obtenerSesionAbierta();
    if (existente) {
        const err = new Error('Ya existe una caja abierta. Ciérrala antes de abrir otra.');
        err.statusCode = 400;
        throw err;
    }

    const { monto_apertura = 0 } = req.body;
    if (monto_apertura < 0) {
        const err = new Error('El monto de apertura no puede ser negativo.');
        err.statusCode = 400;
        throw err;
    }

    const sesion = {
        id_sesion:      uuidv4(),
        usuario:        req.user?.username || req.user?.nombre_completo || 'sistema',
        fecha_apertura: new Date().toISOString(),
        monto_apertura: Number(monto_apertura),
    };

    db.caja.abrir(sesion);

    auditLog(req, 'CREAR', 'CAJA',
        `Apertura de caja — Monto inicial: S/ ${Number(monto_apertura).toFixed(2)}`
    );

    res.status(201).json({ ok: true, mensaje: 'Caja abierta correctamente', sesion });
}));

// ══════════════════════════════════════════════════════════════
//  POST /api/caja/cerrar
// ══════════════════════════════════════════════════════════════
router.post('/cerrar', asyncHandler((req, res) => {
    const sesion = db.caja.obtenerSesionAbierta();
    if (!sesion) {
        const err = new Error('No hay ninguna caja abierta para cerrar.');
        err.statusCode = 400;
        throw err;
    }

    const { monto_cierre_real, notas_cierre = '' } = req.body;
    if (monto_cierre_real === undefined || monto_cierre_real === null) {
        const err = new Error('Debes ingresar el monto de cierre real (lo que contaste).');
        err.statusCode = 400;
        throw err;
    }

    const totales  = { ...totalesVacios,  ...db.caja.calcularTotalesSesion(sesion.id_sesion) };
    const manuales = { ...manualesVacios, ...db.caja.calcularMovimientosManuales(sesion.id_sesion) };

    // El monto esperado en caja solo considera efectivo (no yape/plin, esos son digitales)
    const monto_esperado = sesion.monto_apertura
                         + totales.total_efectivo
                         + manuales.total_ingresos
                         - manuales.total_egresos;

    const diferencia = Number(monto_cierre_real) - monto_esperado;

    const datosCierre = {
        id_sesion:         sesion.id_sesion,
        fecha_cierre:      new Date().toISOString(),
        monto_cierre_real: Number(monto_cierre_real),
        monto_esperado:    Math.round(monto_esperado * 100) / 100,
        diferencia:        Math.round(diferencia * 100) / 100,
        total_ventas:      totales.total_ventas,
        total_efectivo:    totales.total_efectivo,
        total_yape_plin:   totales.total_yape_plin,
        total_otros:       totales.total_otros,
        cantidad_ventas:   totales.cantidad_ventas,
        notas_cierre,
    };

    db.caja.cerrar(datosCierre);

    let estado_dif = 'EXACTO';
    if (diferencia >  0.009) estado_dif = 'SOBRANTE';
    if (diferencia < -0.009) estado_dif = 'FALTANTE';

    const difTexto = estado_dif === 'EXACTO'
        ? 'Sin diferencia'
        : `${estado_dif} de S/ ${Math.abs(diferencia).toFixed(2)}`;

    auditLog(req, 'MODIFICAR', 'CAJA',
        `Cierre de caja — ` +
        `Contado: S/ ${Number(monto_cierre_real).toFixed(2)} | ` +
        `Esperado: S/ ${monto_esperado.toFixed(2)} | ` +
        `${difTexto} | ` +
        `Ventas: ${totales.cantidad_ventas} (S/ ${totales.total_ventas.toFixed(2)}) | ` +
        `Efectivo ventas: S/ ${totales.total_efectivo.toFixed(2)} | ` +
        `Yape/Plin: S/ ${totales.total_yape_plin.toFixed(2)}`
    );

    res.json({
        ok: true,
        mensaje: 'Caja cerrada correctamente',
        resumen: {
            ...datosCierre,
            ingresos_manuales: manuales.total_ingresos,
            egresos_manuales:  manuales.total_egresos,
            estado_diferencia: estado_dif,
        },
    });
}));

// ══════════════════════════════════════════════════════════════
//  GET /api/caja/resumen
// ══════════════════════════════════════════════════════════════
router.get('/resumen', asyncHandler((req, res) => {
    const sesion = db.caja.obtenerSesionAbierta();
    if (!sesion) {
        const err = new Error('No hay caja abierta.');
        err.statusCode = 400;
        throw err;
    }

    const totales     = { ...totalesVacios,  ...db.caja.calcularTotalesSesion(sesion.id_sesion) };
    const manuales    = { ...manualesVacios, ...db.caja.calcularMovimientosManuales(sesion.id_sesion) };
    const ventas      = db.caja.obtenerVentasDeSesion(sesion.id_sesion) || [];
    const movimientos = db.caja.listarMovimientos(sesion.id_sesion) || [];

    const monto_esperado = sesion.monto_apertura
                         + totales.total_efectivo
                         + manuales.total_ingresos
                         - manuales.total_egresos;

    res.json({
        sesion, totales,
        manuales: { ingresos: manuales.total_ingresos, egresos: manuales.total_egresos },
        monto_esperado: Math.round(monto_esperado * 100) / 100,
        ventas, movimientos,
    });
}));

// ══════════════════════════════════════════════════════════════
//  POST /api/caja/movimiento
// ══════════════════════════════════════════════════════════════
router.post('/movimiento', asyncHandler((req, res) => {
    const sesion = db.caja.obtenerSesionAbierta();
    if (!sesion) {
        const err = new Error('No hay caja abierta para registrar movimientos.');
        err.statusCode = 400;
        throw err;
    }

    const { tipo, monto, concepto } = req.body;

    if (!tipo || !['INGRESO', 'EGRESO'].includes(tipo)) {
        const err = new Error('El tipo debe ser INGRESO o EGRESO.');
        err.statusCode = 400;
        throw err;
    }
    if (!monto || monto <= 0) {
        const err = new Error('El monto debe ser mayor a 0.');
        err.statusCode = 400;
        throw err;
    }
    if (!concepto || concepto.trim() === '') {
        const err = new Error('Debes ingresar un concepto para el movimiento.');
        err.statusCode = 400;
        throw err;
    }

    const mov = {
        id_movimiento_caja: uuidv4(),
        id_sesion:          sesion.id_sesion,
        tipo,
        monto:              Number(monto),
        concepto:           concepto.trim(),
        fecha_hora:         new Date().toISOString(),
        usuario:            req.user?.username || req.user?.nombre_completo || 'sistema',
    };

    db.caja.registrarMovimiento(mov);

    auditLog(req, tipo === 'INGRESO' ? 'CREAR' : 'ELIMINAR', 'CAJA',
        `${tipo === 'INGRESO' ? 'Ingreso de efectivo' : 'Retiro de efectivo'} — ` +
        `Monto: S/ ${Number(monto).toFixed(2)} | Concepto: ${concepto.trim()}`
    );

    res.status(201).json({
        ok: true,
        mensaje: `${tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'} registrado correctamente`,
        movimiento: mov,
    });
}));

// ══════════════════════════════════════════════════════════════
//  GET /api/caja/historial
// ══════════════════════════════════════════════════════════════
router.get('/historial', asyncHandler((req, res) => {
    const { limite = 20, offset = 0, desde, hasta } = req.query;
    const sesiones = db.caja.listarSesiones({
        limite: Number(limite),
        offset: Number(offset),
        ...(desde && { desde }),
        ...(hasta && { hasta }),
    });
    res.json(sesiones || []);
}));

// ══════════════════════════════════════════════════════════════
//  GET /api/caja/sesion/:id
// ══════════════════════════════════════════════════════════════
router.get('/sesion/:id', asyncHandler((req, res) => {
    const sesion = db.caja.obtenerSesion(req.params.id);
    if (!sesion) {
        const err = new Error('Sesión de caja no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    const ventas      = db.caja.obtenerVentasDeSesion(sesion.id_sesion) || [];
    const movimientos = db.caja.listarMovimientos(sesion.id_sesion) || [];
    res.json({ sesion, ventas, movimientos });
}));

module.exports = router;

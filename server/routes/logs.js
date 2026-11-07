const express = require('express');
const router = express.Router();
const { logs } = require('../data/database');
const asyncHandler = require('../middleware/asyncHandler');
const { requireRole } = require('../middleware/auth');

// ══════════════════════════════════════════════════════════════
//  GET /api/logs
//  Lista logs de auditoría (solo ADMIN)
//  Query params: limite, offset, modulo, usuario, desde, hasta
// ══════════════════════════════════════════════════════════════
router.get('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
    const limite  = req.query.limite  ? Math.min(parseInt(req.query.limite), 200) : 50;
    const offset  = req.query.offset  ? parseInt(req.query.offset)  : 0;
    const modulo  = req.query.modulo  || null;
    const usuario = req.query.usuario || null;
    const accion  = req.query.accion  || null;
    const desde   = req.query.desde   || null; // 'YYYY-MM-DD'
    const hasta   = req.query.hasta   || null; // 'YYYY-MM-DD'

    const params = { limite, offset, modulo, usuario, accion, desde, hasta };
    const { logs: auditorias, hayMas } = logs.listar(params);
    const total = logs.contar(params);

    res.json({ logs: auditorias, hayMas, total, offset, limite });
}));

// ══════════════════════════════════════════════════════════════
//  POST /api/logs
//  Registra un log manualmente (cualquier usuario autenticado)
//  Body: { accion, modulo, detalle }
// ══════════════════════════════════════════════════════════════
router.post('/', asyncHandler(async (req, res) => {
    const { accion, modulo, detalle } = req.body;

    if (!accion || !modulo) {
        return res.status(400).json({ error: 'accion y modulo son obligatorios' });
    }

    const entrada = {
        usuario:    req.user?.username || req.user?.nombre_completo || 'sistema',
        accion:     accion.toUpperCase(),
        modulo:     modulo.toUpperCase(),
        detalles:   detalle || null,
        ip:         req.ip || req.headers['x-forwarded-for'] || null,
        fecha_hora: new Date().toISOString(),
    };

    logs.registrar(entrada);
    res.status(201).json({ ok: true });
}));

module.exports = router;

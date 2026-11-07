const database = require('../data/database');
const crypto   = require('crypto');
const logger   = require('../logger');

/**
 * auditLog — registra un log legible en auditoría.
 * Usa database.logs.registrar() que ya tiene el INSERT correcto.
 *
 * @param {object} req     - Request de Express
 * @param {string} accion  - 'CREAR' | 'MODIFICAR' | 'ELIMINAR'
 * @param {string} modulo  - 'VENTAS' | 'CAJA' | 'PRODUCTOS' | etc.
 * @param {string} detalle - Texto en español describiendo exactamente qué pasó
 */
const auditLog = (req, accion, modulo, detalle, opciones = {}) => {
    try {
        database.logs.registrar({
            usuario:         req.user?.username || req.user?.nombre_completo || 'sistema',
            accion,
            modulo,
            detalles:        detalle || null,
            ip:              req.ip || req.headers['x-forwarded-for'] || null,
            fecha_hora:      new Date().toISOString(),
            id_referencia:   opciones.id_referencia || null,
            tipo_referencia: opciones.tipo_referencia || null,
        });
    } catch (err) {
        logger.error('AUDITORIA', 'Error al guardar log de auditoría:', err.message);
    }
};

// ── Compatibilidad con código legado que usa registrarLog(usuario, accion, modulo, detalles, ip)
const registrarLog = (usuario, accion, modulo, detalles = '', ip = '') => {
    try {
        database.logs.registrar({
            usuario:    usuario || 'sistema',
            accion,
            modulo,
            detalles:   typeof detalles === 'string' ? detalles : JSON.stringify(detalles),
            ip:         ip || null,
            fecha_hora: new Date().toISOString(),
        });
    } catch (err) {
        logger.error('AUDITORIA', 'Error al guardar log de auditoría:', err.message);
    }
};

// loggerMiddleware desactivado — ya no registra nada para evitar duplicados
const loggerMiddleware = (_modulo) => (_req, _res, next) => next();

module.exports = { auditLog, registrarLog, loggerMiddleware };

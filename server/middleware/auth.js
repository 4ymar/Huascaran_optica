const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../security/secrets');

const JWT_SECRET = getJwtSecret();

const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, error: 'No autorizado. Token no proporcionado o invalido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = jwt.verify(token, JWT_SECRET);

        try {
            const db = require('../data/database');
            const usuario = db.usuarios.obtenerPorId(payload.id_usuario);
            if (!usuario || usuario.estado !== 'ACTIVO') {
                return res.status(401).json({ ok: false, error: 'Usuario inactivo o no encontrado.' });
            }
            if (Number(payload.token_version || 0) !== Number(usuario.token_version || 0)) {
                return res.status(401).json({ ok: false, error: 'Sesion expirada por cambio de credenciales.' });
            }
        } catch (_) {
            return res.status(401).json({ ok: false, error: 'No se pudo validar la sesion.' });
        }

        req.user = payload;
        next();
    } catch (error) {
        return res.status(401).json({ ok: false, error: 'Token expirado o invalido. Por favor, inicia sesion nuevamente.' });
    }
};

const requireRole = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.user || !req.user.rol) {
            return res.status(403).json({ ok: false, error: 'Prohibido. No se pudo determinar el rol del usuario.' });
        }

        if (!rolesPermitidos.includes(req.user.rol)) {
            return res.status(403).json({ ok: false, error: 'Prohibido. No tienes permisos para realizar esta accion.' });
        }

        next();
    };
};

module.exports = {
    JWT_SECRET,
    requireAuth,
    requireRole,
};

const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../data/database');
const asyncHandler = require('../middleware/asyncHandler');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');

// ══════════════════════════════════════════════════════════════
//  POST /api/auth/login
//  Autentica al usuario y devuelve un token JWT
// ══════════════════════════════════════════════════════════════
router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ ok: false, error: 'Usuario y contraseña son requeridos' });
    }

    const usuario = db.usuarios.obtenerPorUsernameConPassword(username);

    const totalUsuarios = db.db.prepare('SELECT COUNT(*) AS c FROM usuarios').get().c;
    if (totalUsuarios === 0) {
        return res.status(409).json({ ok: false, requiere_setup: true, error: 'Debe crear el administrador inicial.' });
    }

    // Verificamos si existe y si la contraseña es correcta
    if (!usuario || !bcrypt.compareSync(password, usuario.password_hash)) {
        return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
    }

    if (usuario.estado !== 'ACTIVO') {
        return res.status(403).json({ ok: false, error: 'El usuario se encuentra inactivo' });
    }

    // Generamos el payload del token (sin la contraseña)
    const payload = {
        id_usuario: usuario.id_usuario,
        username: usuario.username,
        nombre: usuario.nombre_completo,
        rol: usuario.rol,
        token_version: Number(usuario.token_version || 0),
    };

    // Firmamos el token (expira en 12 horas)
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

    res.json({
        ok: true,
        mensaje: 'Inicio de sesión exitoso',
        token,
        usuario: payload
    });
}));

// ══════════════════════════════════════════════════════════════
//  GET /api/auth/me
//  Devuelve los datos del usuario autenticado (para recargar app)
// ══════════════════════════════════════════════════════════════
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    // req.user ya viene del middleware requireAuth
    const usuarioCompleto = db.usuarios.obtenerPorId(req.user.id_usuario);
    
    if (!usuarioCompleto || usuarioCompleto.estado !== 'ACTIVO') {
        return res.status(401).json({ ok: false, error: 'Usuario inactivo o no encontrado' });
    }

    res.json({
        ok: true,
        usuario: {
            id_usuario: usuarioCompleto.id_usuario,
            username: usuarioCompleto.username,
            nombre: usuarioCompleto.nombre_completo,
            rol: usuarioCompleto.rol
        }
    });
}));

module.exports = router;

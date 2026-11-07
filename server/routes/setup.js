const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const db = require('../data/database');

function usuariosCount() {
    return db.db.prepare('SELECT COUNT(*) AS c FROM usuarios').get().c;
}

function passwordFuerte(password) {
    return typeof password === 'string' &&
        password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /\d/.test(password);
}

router.get('/estado', (_req, res) => {
    res.json({ requiere_setup: usuariosCount() === 0 });
});

router.post('/admin-inicial', (req, res) => {
    try {
        if (usuariosCount() > 0) {
            return res.status(409).json({ ok: false, error: 'El administrador inicial ya fue creado.' });
        }

        const {
            username,
            password,
            nombre_completo,
            empresa_nombre,
            empresa_ruc,
            empresa_direccion,
        } = req.body;

        if (!username || !password || !nombre_completo) {
            return res.status(400).json({ ok: false, error: 'Usuario, nombre y contrasena son obligatorios.' });
        }
        if (!passwordFuerte(password)) {
            return res.status(400).json({
                ok: false,
                error: 'La contrasena debe tener 8 caracteres, mayuscula, minuscula y numero.',
            });
        }

        db.usuarios.crear({
            id_usuario: randomUUID(),
            username: username.trim(),
            password_hash: bcrypt.hashSync(password, 10),
            nombre_completo: nombre_completo.trim(),
            rol: 'ADMIN',
            estado: 'ACTIVO',
            token_version: 0,
            fecha_creacion: new Date().toISOString(),
        });

        if (empresa_nombre) {
            db.config.guardar('empresa_nombre', empresa_nombre);
            db.config.guardar('empresa_nombre_corto', empresa_nombre);
        }
        if (empresa_ruc) db.config.guardar('empresa_ruc', empresa_ruc);
        if (empresa_direccion) db.config.guardar('empresa_direccion', empresa_direccion);

        res.status(201).json({ ok: true, mensaje: 'Administrador inicial creado.' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;

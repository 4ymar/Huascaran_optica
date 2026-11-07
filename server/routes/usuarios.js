const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { randomUUID: uuidv4 } = require('crypto');
const db = require('../data/database');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/logger');

// PROTEGER TODAS LAS RUTAS: Solo usuarios autenticados
router.use(requireAuth);

// SOLO ADMIN: Todas las operaciones de gestión de usuarios son exclusivas de ADMIN
router.use(requireRole('ADMIN'));

// ══════════════════════════════════════════════════════════════
//  GET /api/usuarios
//  Lista todos los usuarios
// ══════════════════════════════════════════════════════════════
router.get('/', asyncHandler((req, res) => {
    const lista = db.usuarios.listar();
    res.json({ ok: true, usuarios: lista });
}));

// ══════════════════════════════════════════════════════════════
//  POST /api/usuarios
//  Crea un nuevo usuario
// ══════════════════════════════════════════════════════════════
router.post('/', asyncHandler((req, res) => {
    const { username, password, nombre_completo, rol } = req.body;

    if (!username || !password || !nombre_completo || !rol) {
        return res.status(400).json({ ok: false, error: 'Todos los campos son obligatorios' });
    }

    const existe = db.usuarios.obtenerPorUsernameConPassword(username);
    if (existe) {
        return res.status(400).json({ ok: false, error: 'El nombre de usuario ya está en uso' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const nuevoUsuario = {
        id_usuario: uuidv4(),
        username: username.trim(),
        password_hash: hash,
        nombre_completo: nombre_completo.trim(),
        rol,
        estado: 'ACTIVO',
        fecha_creacion: new Date().toISOString()
    };

    db.usuarios.crear(nuevoUsuario);

    auditLog(req, 'CREAR', 'USUARIOS',
        `Usuario creado: ${nuevoUsuario.username} (${nuevoUsuario.rol})`,
        { id_referencia: nuevoUsuario.id_usuario, tipo_referencia: 'USUARIO' }
    );

    // No devolvemos el password_hash por seguridad
    const { password_hash, ...infoBasica } = nuevoUsuario;
    res.status(201).json({ ok: true, mensaje: 'Usuario creado exitosamente', usuario: infoBasica });
}));

// ══════════════════════════════════════════════════════════════
//  PUT /api/usuarios/:id
//  Actualiza información básica o estado de un usuario (no password)
// ══════════════════════════════════════════════════════════════
router.put('/:id', asyncHandler((req, res) => {
    const id = req.params.id;
    const { username, nombre_completo, rol, estado } = req.body;

    const actual = db.usuarios.obtenerPorId(id);
    if (!actual) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    // Si cambió el username, verificar que no colisione
    if (username && username !== actual.username) {
        const existe = db.usuarios.obtenerPorUsernameConPassword(username);
        if (existe) return res.status(400).json({ ok: false, error: 'El nombre de usuario ya está en uso' });
    }

    const updateData = {
        id_usuario: id,
        username: (username || actual.username).trim(),
        nombre_completo: (nombre_completo || actual.nombre_completo).trim(),
        rol: rol || actual.rol,
        estado: estado || actual.estado
    };

    db.usuarios.actualizarInfo(updateData);

    const cambios = [];
    if (updateData.username !== actual.username) cambios.push(`usuario: ${actual.username} → ${updateData.username}`);
    if (updateData.nombre_completo !== actual.nombre_completo) cambios.push(`nombre: ${actual.nombre_completo} → ${updateData.nombre_completo}`);
    if (updateData.rol !== actual.rol) cambios.push(`rol: ${actual.rol} → ${updateData.rol}`);
    if (updateData.estado !== actual.estado) cambios.push(`estado: ${actual.estado} → ${updateData.estado}`);

    auditLog(req, 'MODIFICAR', 'USUARIOS',
        `Usuario actualizado: ${actual.username}${cambios.length ? ' — ' + cambios.join(', ') : ''}`,
        { id_referencia: id, tipo_referencia: 'USUARIO' }
    );

    res.json({ ok: true, mensaje: 'Usuario actualizado correctamente', usuario: updateData });
}));

// ══════════════════════════════════════════════════════════════
//  PUT /api/usuarios/:id/password
//  Actualiza la contraseña de un usuario
// ══════════════════════════════════════════════════════════════
router.put('/:id/password', asyncHandler((req, res) => {
    const id = req.params.id;
    const { password, admin_password } = req.body;

    if (!admin_password) {
        return res.status(400).json({ ok: false, error: 'Debes ingresar tu contraseña de administrador' });
    }

    const adminActual = db.usuarios.obtenerPorUsernameConPassword(req.user.username);
    if (!adminActual || !bcrypt.compareSync(admin_password, adminActual.password_hash)) {
        return res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
    }

    if (!password || password.length < 6) {
        return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const actual = db.usuarios.obtenerPorId(id);
    if (!actual) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const hash = bcrypt.hashSync(password, 10);
    db.usuarios.actualizarPassword(id, hash);

    auditLog(req, 'MODIFICAR', 'USUARIOS',
        `Contraseña actualizada para usuario: ${actual.username}`,
        { id_referencia: id, tipo_referencia: 'USUARIO' }
    );

    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
}));

// ══════════════════════════════════════════════════════════════
//  DELETE /api/usuarios/:id
//  Elimina un usuario. El usuario 'admin' no puede eliminarse.
// ══════════════════════════════════════════════════════════════
router.delete('/:id', asyncHandler((req, res) => {
    const id = req.params.id;
    const { admin_password } = req.body;

    if (!admin_password) {
        return res.status(400).json({ ok: false, error: 'Debes ingresar tu contraseña de administrador' });
    }

    const adminActual = db.usuarios.obtenerPorUsernameConPassword(req.user.username);
    if (!adminActual || !bcrypt.compareSync(admin_password, adminActual.password_hash)) {
        return res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
    }

    const actual = db.usuarios.obtenerPorId(id);
    if (!actual) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    if (actual.username.toLowerCase() === 'admin') {
        return res.status(403).json({ ok: false, error: 'El usuario admin no puede eliminarse' });
    }

    db.usuarios.eliminar(id);

    auditLog(req, 'ELIMINAR', 'USUARIOS',
        `Usuario eliminado: ${actual.username} (${actual.rol})`,
        { id_referencia: id, tipo_referencia: 'USUARIO' }
    );

    res.json({ ok: true, mensaje: 'Usuario eliminado correctamente' });
}));

module.exports = router;

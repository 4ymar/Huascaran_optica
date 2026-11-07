const router = require('express').Router();
const db = require('../data/database');
const { randomUUID: uuidv4 } = require('crypto');
const { requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/logger');

// Roles (ajustar aquí si cambia la política)
const ROLES_VER     = ['ADMIN', 'CAJERO'];
const ROLES_GESTION = ['ADMIN'];

// GET talleres (?soloActivos=true para filtrar)
router.get('/', requireRole(...ROLES_VER), (req, res) => {
    try {
        res.json(db.talleres.listar({ soloActivos: req.query.soloActivos === 'true' }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET taller por ID
router.get('/:id', requireRole(...ROLES_VER), (req, res) => {
    try {
        const taller = db.talleres.obtener(req.params.id);
        if (!taller) return res.status(404).json({ error: 'Taller no encontrado' });
        res.json(taller);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST crear taller
router.post('/', requireRole(...ROLES_GESTION), (req, res) => {
    try {
        const taller = {
            id_taller:    uuidv4(),
            nombre:       (req.body.nombre || '').trim() || null,
            contacto:     req.body.contacto     || null,
            telefono_alt: req.body.telefono_alt || null,
            email:        req.body.email        || null,
            ruc:          req.body.ruc          || null,
            direccion:    req.body.direccion    || null,
            especialidad: req.body.especialidad || null,
            notas:        req.body.notas        || null,
        };
        if (!taller.nombre) return res.status(400).json({ error: 'El nombre es requerido' });
        db.talleres.crear(taller);
        auditLog(req, 'CREAR', 'TALLERES', `Taller creado: ${taller.nombre}`);
        res.status(201).json(db.talleres.obtener(taller.id_taller));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT actualizar taller
router.put('/:id', requireRole(...ROLES_GESTION), (req, res) => {
    try {
        const actual = db.talleres.obtener(req.params.id);
        if (!actual) return res.status(404).json({ error: 'Taller no encontrado' });

        const nombre = req.body.nombre !== undefined ? String(req.body.nombre).trim() : actual.nombre;
        if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });

        const taller = {
            id_taller:    req.params.id,
            nombre,
            contacto:     req.body.contacto     ?? actual.contacto,
            telefono_alt: req.body.telefono_alt ?? actual.telefono_alt,
            email:        req.body.email        ?? actual.email,
            ruc:          req.body.ruc          ?? actual.ruc,
            direccion:    req.body.direccion    ?? actual.direccion,
            especialidad: req.body.especialidad ?? actual.especialidad,
            notas:        req.body.notas        ?? actual.notas,
        };
        db.talleres.actualizar(taller);
        auditLog(req, 'MODIFICAR', 'TALLERES', `Taller ${req.params.id} actualizado`);
        res.json({ ...actual, ...taller });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH activar/desactivar
router.patch('/:id/activo', requireRole(...ROLES_GESTION), (req, res) => {
    try {
        const taller = db.talleres.obtener(req.params.id);
        if (!taller) return res.status(404).json({ error: 'Taller no encontrado' });
        const nuevoEstado = req.body.activo !== undefined ? req.body.activo : !taller.activo;
        db.talleres.toggleActivo(req.params.id, nuevoEstado);
        auditLog(req, 'MODIFICAR', 'TALLERES', `Taller ${req.params.id} → activo: ${nuevoEstado}`);
        res.json({ id_taller: req.params.id, activo: nuevoEstado ? 1 : 0 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE: se borra si no tiene órdenes; si las tiene, solo se desactiva
router.delete('/:id', requireRole(...ROLES_GESTION), (req, res) => {
    try {
        const taller = db.talleres.obtener(req.params.id);
        if (!taller) return res.status(404).json({ error: 'Taller no encontrado' });

        const resultado = db.talleres.eliminar(req.params.id);
        auditLog(req, 'ELIMINAR', 'TALLERES',
            `Taller ${resultado.fisico ? 'eliminado' : 'desactivado (tiene órdenes asociadas)'}: ${taller.nombre}`
        );
        res.json({
            fisico: resultado.fisico,
            mensaje: resultado.fisico
                ? 'Taller eliminado correctamente'
                : 'El taller tiene órdenes asociadas: se desactivó en lugar de eliminarse',
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
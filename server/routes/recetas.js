const router = require('express').Router();
const db = require('../data/database');
const { randomUUID: uuidv4 } = require('crypto');
const { requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/logger');

// Roles con acceso al módulo (ajustar aquí si cambia la política)
const ROLES_OPTICA = ['ADMIN', 'CAJERO'];
router.use(requireRole(...ROLES_OPTICA));

const CAMPOS_NUMERICOS = [
    'od_esfera', 'od_cilindro', 'od_eje', 'od_adicion', 'od_altura',
    'oi_esfera', 'oi_cilindro', 'oi_eje', 'oi_adicion', 'oi_altura', 'dip',
];

const vacio = (v) => v === undefined || v === null || v === '';

function validarReceta(r) {
    if (!r.id_cliente)   return 'El cliente es requerido';
    if (!r.fecha_receta) return 'La fecha de la receta es requerida';
    for (const campo of CAMPOS_NUMERICOS) {
        if (!vacio(r[campo]) && !Number.isFinite(Number(r[campo]))) {
            return `El campo ${campo} debe ser numérico`;
        }
    }
    for (const campo of ['od_eje', 'oi_eje']) {
        if (!vacio(r[campo]) && (Number(r[campo]) < 0 || Number(r[campo]) > 180)) {
            return 'El eje debe estar entre 0 y 180';
        }
    }
    return null;
}

// GET recetas (filtro por cliente y activas)
router.get('/', (req, res) => {
    try {
        const { id_cliente, activa } = req.query;
        res.json(db.recetas.listar({
            id_cliente: id_cliente || null,
            activa: activa !== 'false',
        }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET receta por ID
router.get('/:id', (req, res) => {
    try {
        const receta = db.recetas.obtener(req.params.id);
        if (!receta) return res.status(404).json({ error: 'Receta no encontrada' });
        res.json(receta);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST crear receta
router.post('/', (req, res) => {
    try {
        const error = validarReceta(req.body);
        if (error) return res.status(400).json({ error });
        if (!db.clientes.obtener(req.body.id_cliente)) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const receta = {
            ...req.body,
            id_receta: uuidv4(),
            usuario_creador: req.user?.username || null,
        };
        db.recetas.crear(receta);

        auditLog(req, 'CREAR', 'RECETAS',
            `Receta creada para cliente ${receta.id_cliente} - Fecha: ${receta.fecha_receta}`
        );

        res.status(201).json(db.recetas.obtener(receta.id_receta));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT actualizar receta
router.put('/:id', (req, res) => {
    try {
        const current = db.recetas.obtener(req.params.id);
        if (!current) return res.status(404).json({ error: 'Receta no encontrada' });

        const receta = { ...current, ...req.body, id_receta: req.params.id };
        const error = validarReceta(receta);
        if (error) return res.status(400).json({ error });
        if (!db.clientes.obtener(receta.id_cliente)) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        db.recetas.actualizar(receta);

        auditLog(req, 'MODIFICAR', 'RECETAS', `Receta ${req.params.id} modificada`);

        res.json(db.recetas.obtener(req.params.id));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE desactivar receta (solo ADMIN)
router.delete('/:id', requireRole('ADMIN'), (req, res) => {
    try {
        if (!db.recetas.obtener(req.params.id)) {
            return res.status(404).json({ error: 'Receta no encontrada' });
        }
        db.recetas.desactivar(req.params.id);
        auditLog(req, 'ELIMINAR', 'RECETAS', `Receta ${req.params.id} desactivada`);
        res.json({ mensaje: 'Receta desactivada' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
const express = require('express');
const router  = express.Router();
const { unidades } = require('../data/database');

// GET /api/unidades — listar todas (activas e inactivas)
router.get('/', (req, res) => {
    try {
        const data = unidades.listar();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/unidades — crear nueva
router.post('/', (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
        unidades.crear({ nombre });
        res.json({ ok: true });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Ya existe una unidad con ese nombre' });
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/unidades/:id — actualizar
router.put('/:id', (req, res) => {
    try {
        const { nombre, activo } = req.body;
        if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
        unidades.actualizar({
            id_unidad: Number(req.params.id),
            nombre,
            activo: activo === false || activo === 0 ? 0 : 1,
        });
        res.json({ ok: true });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Ya existe una unidad con ese nombre' });
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/unidades/:id — eliminar (solo si no tiene productos)
router.delete('/:id', (req, res) => {
    try {
        unidades.eliminar(Number(req.params.id));
        res.json({ ok: true });
    } catch (err) {
        // El método lanza error descriptivo si hay productos en uso
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;

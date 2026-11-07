const express = require('express');
const router  = express.Router();
const { categorias } = require('../data/database');

// GET /api/categorias — listar todas (activas e inactivas)
router.get('/', (req, res) => {
    try {
        const data = categorias.listar();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/categorias — crear nueva
router.post('/', (req, res) => {
    try {
        const { nombre, icono } = req.body;
        if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
        categorias.crear({ nombre, icono });
        res.json({ ok: true });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/categorias/:id — actualizar
router.put('/:id', (req, res) => {
    try {
        const { nombre, icono, activo } = req.body;
        if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
        categorias.actualizar({
            id_categoria: Number(req.params.id),
            nombre,
            icono,
            activo: activo === false || activo === 0 ? 0 : 1,
        });
        res.json({ ok: true });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/categorias/:id — eliminar (solo si no tiene productos)
router.delete('/:id', (req, res) => {
    try {
        categorias.eliminar(Number(req.params.id));
        res.json({ ok: true });
    } catch (err) {
        // El método lanza error descriptivo si hay productos en uso
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
const router = require('express').Router();
const { randomUUID } = require('crypto');
const db = require('../data/database');
const { requireRole } = require('../middleware/auth');

router.get('/', (req, res) => {
    try {
        const { search = '', estado = '1' } = req.query;
        const params = {};
        let sql = `SELECT * FROM proveedores WHERE 1=1`;
        if (estado !== 'todos') {
            sql += ` AND estado = @estado`;
            params.estado = estado === '0' ? 0 : 1;
        }
        if (search) {
            sql += ` AND (razon_social LIKE @search OR ruc LIKE @search)`;
            params.search = `%${search}%`;
        }
        sql += ` ORDER BY razon_social ASC`;
        res.json(db.db.prepare(sql).all(params));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', (req, res) => {
    try {
        const proveedor = db.db.prepare(`SELECT * FROM proveedores WHERE id_proveedor = ?`).get(req.params.id);
        if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado.' });
        res.json(proveedor);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireRole('ADMIN'), (req, res) => {
    try {
        const { razon_social, ruc = '', direccion = '', telefono = '', email = '' } = req.body;
        if (!razon_social || !String(razon_social).trim()) return res.status(400).json({ error: 'Razon social obligatoria.' });
        if (ruc && !/^\d{11}$/.test(String(ruc))) return res.status(400).json({ error: 'RUC debe tener 11 digitos.' });
        const proveedor = {
            id_proveedor: randomUUID(),
            razon_social: String(razon_social).trim(),
            ruc: String(ruc || '').trim(),
            direccion: String(direccion || '').trim(),
            telefono: String(telefono || '').trim(),
            email: String(email || '').trim(),
            fecha_creacion: new Date().toISOString(),
        };
        db.db.prepare(`
            INSERT INTO proveedores (id_proveedor, razon_social, ruc, direccion, telefono, email, estado, fecha_creacion)
            VALUES (@id_proveedor, @razon_social, @ruc, @direccion, @telefono, @email, 1, @fecha_creacion)
        `).run(proveedor);
        res.status(201).json(proveedor);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireRole('ADMIN'), (req, res) => {
    try {
        const { razon_social, ruc = '', direccion = '', telefono = '', email = '', estado = 1 } = req.body;
        if (!razon_social || !String(razon_social).trim()) return res.status(400).json({ error: 'Razon social obligatoria.' });
        if (ruc && !/^\d{11}$/.test(String(ruc))) return res.status(400).json({ error: 'RUC debe tener 11 digitos.' });
        const result = db.db.prepare(`
            UPDATE proveedores
            SET razon_social = ?, ruc = ?, direccion = ?, telefono = ?, email = ?, estado = ?
            WHERE id_proveedor = ?
        `).run(
            String(razon_social).trim(),
            String(ruc || '').trim(),
            String(direccion || '').trim(),
            String(telefono || '').trim(),
            String(email || '').trim(),
            estado ? 1 : 0,
            req.params.id
        );
        if (!result.changes) return res.status(404).json({ error: 'Proveedor no encontrado.' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

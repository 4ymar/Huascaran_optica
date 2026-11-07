const router = require('express').Router();
const db = require('../data/database');
const { randomUUID: uuidv4 } = require('crypto');
const { requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/logger');

// GET all clients
router.get('/', (req, res) => {
    try {
        let clientes = [];
        const { search, tipo, estado } = req.query;
        
        if (search) {
            clientes = db.clientes.buscar(search);
        } else {
            clientes = db.clientes.listar();
        }
        
        if (tipo) clientes = clientes.filter(c => c.tipo_cliente === tipo);
        if (estado !== undefined) clientes = clientes.filter(c => c.estado === (estado === 'true' ? 1 : 0));
        
        // Convertir estado 1/0 a true/false para frontend param
        const parsedClientes = clientes.map(c => ({...c, estado: c.estado === 1}));
        res.json(parsedClientes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET client by ID
router.get('/:id', requireRole('ADMIN', 'CAJERO', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        const cliente = db.clientes.obtener(req.params.id);
        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

        // Traer ventas activas para calcular total
        const totalRow = db.db.prepare(`SELECT COUNT(*) as total, SUM(total) as suma FROM ventas WHERE id_cliente = ? AND estado = 'ACTIVA'`).get(cliente.id_cliente);
        const offset = parseInt(req.query.offset) || 0;
        const ventas = db.db.prepare(`SELECT * FROM ventas WHERE id_cliente = ? AND estado = 'ACTIVA' ORDER BY fecha_hora DESC LIMIT 20 OFFSET ?`).all(cliente.id_cliente, offset);
        const totalCompras = ventas.reduce((sum, v) => sum + v.total, 0);

        res.json({
            ...cliente,
            estado: cliente.estado === 1,
            ventas,
            recetas: db.recetas.listar({ id_cliente: cliente.id_cliente }),
            ordenes: db.ordenes.listar({ id_cliente: cliente.id_cliente }),
            totalCompras: totalRow.suma || 0,
            cantidadCompras: totalRow.total || 0,
            hayMas: offset + ventas.length < totalRow.total
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST new client
router.post('/', (req, res) => {
    try {
        const query = db.db.prepare('SELECT id_cliente FROM clientes WHERE numero_documento = ?').get(req.body.numero_documento);
        if (query) {
            return res.status(400).json({ error: 'El número de documento ya está registrado' });
        }
        
        const now = new Date().toISOString();
        const cliente = {
            id_cliente: uuidv4(),
            tipo_cliente: req.body.tipo_cliente || 'PERSONA_NATURAL',
            nombre_razon_social: req.body.nombre_razon_social,
            tipo_documento: req.body.tipo_documento || 'DNI',
            numero_documento: req.body.numero_documento,
            direccion: req.body.direccion || '',
            telefono: req.body.telefono || '',
            email: req.body.email || '',
            fecha_nacimiento: req.body.fecha_nacimiento || null,
            sexo: req.body.sexo || null,
            ocupacion: req.body.ocupacion || null,
            observaciones: req.body.observaciones || null,
            estado: 1,
            fecha_registro: now,
        };
        
        db.clientes.crear(cliente);

        auditLog(req, 'CREAR', 'CLIENTES',
            `Cliente creado: ${cliente.nombre_razon_social} | ` +
            `Documento: ${cliente.tipo_documento} ${cliente.numero_documento} | ` +
            `Tipo: ${cliente.tipo_cliente}`,
            { id_referencia: cliente.id_cliente, tipo_referencia: 'CLIENTE' }
        );

        res.status(201).json({ ...cliente, estado: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT update client
router.put('/:id', requireRole('ADMIN', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        const existing = db.db.prepare('SELECT id_cliente FROM clientes WHERE numero_documento = ?').get(req.body.numero_documento);
        if (existing && existing.id_cliente !== req.params.id) {
            return res.status(400).json({ error: 'El número de documento ya existe en otro cliente' });
        }

        const current = db.clientes.obtener(req.params.id);
        if (!current) return res.status(404).json({ error: 'Cliente no encontrado' });

        const updated = {
            ...current,
            ...req.body,
            direccion: req.body.direccion || current.direccion || '',
            telefono: req.body.telefono || current.telefono || '',
            email: req.body.email || current.email || '',
            fecha_nacimiento: req.body.fecha_nacimiento !== undefined ? (req.body.fecha_nacimiento || null) : (current.fecha_nacimiento ?? null),
            sexo:             req.body.sexo             !== undefined ? (req.body.sexo             || null) : (current.sexo             ?? null),
            ocupacion:        req.body.ocupacion        !== undefined ? (req.body.ocupacion        || null) : (current.ocupacion        ?? null),
            observaciones:    req.body.observaciones    !== undefined ? (req.body.observaciones    || null) : (current.observaciones    ?? null),
            estado: req.body.estado === false ? 0 : 1,
        };

        db.clientes.actualizar(updated);

        const cambios = [];
        if (current.nombre_razon_social !== updated.nombre_razon_social) cambios.push(`Nombre: "${current.nombre_razon_social}" → "${updated.nombre_razon_social}"`);
        if (current.numero_documento    !== updated.numero_documento)    cambios.push(`Documento: ${current.numero_documento} → ${updated.numero_documento}`);
        if (current.direccion           !== updated.direccion)           cambios.push('Dirección actualizada');
        if (current.telefono            !== updated.telefono)            cambios.push(`Teléfono: ${current.telefono} → ${updated.telefono}`);
        if (current.email               !== updated.email)               cambios.push(`Email: ${current.email} → ${updated.email}`);
        if (current.estado              !== updated.estado)              cambios.push(updated.estado === 1 ? 'Cliente activado' : 'Cliente desactivado');

        auditLog(req, 'MODIFICAR', 'CLIENTES',
            `Cliente modificado: ${current.nombre_razon_social} | ` +
            (cambios.length ? cambios.join(' | ') : 'Sin cambios relevantes'),
            { id_referencia: current.id_cliente, tipo_referencia: 'CLIENTE' }
        );

        res.json({ ...updated, estado: updated.estado === 1 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// DELETE client
router.delete('/:id', requireRole('ADMIN'), (req, res) => {
    try {
        const current = db.clientes.obtener(req.params.id);
        if (!current) return res.status(404).json({ error: 'Cliente no encontrado' });

        const resultado = db.clientes.eliminar(req.params.id);

        auditLog(req, 'ELIMINAR', 'CLIENTES',
            `Cliente eliminado: ${current.nombre_razon_social} | ` +
            (resultado.fisico ? 'Borrado físico (sin historial)' : 'Marcado como eliminado (tiene ventas/créditos/recetas/órdenes asociados)'),
            { id_referencia: current.id_cliente, tipo_referencia: 'CLIENTE' }
        );

        res.json({ ok: true, fisico: resultado.fisico });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
module.exports = router;

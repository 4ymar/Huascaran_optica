const router = require('express').Router();
const db = require('../data/database');
const { randomUUID: uuidv4 } = require('crypto');
const { requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/logger');

// Roles con acceso al módulo (ajustar aquí si cambia la política)
const ROLES_OPTICA = ['ADMIN', 'CAJERO'];
router.use(requireRole(...ROLES_OPTICA));

const ESTADOS_FINALES = ['ENTREGADO', 'CANCELADO'];

// Estados a los que puede pasar una orden desde cada estado
const TRANSICIONES = {
    PENDIENTE:       ['EN_TALLER', 'CONTROL_CALIDAD', 'LISTO', 'CANCELADO'],
    EN_TALLER:       ['RECIBIDO', 'CANCELADO'],
    RECIBIDO:        ['CONTROL_CALIDAD', 'EN_TALLER', 'LISTO', 'CANCELADO'],
    CONTROL_CALIDAD: ['LISTO', 'EN_TALLER', 'CANCELADO'],
    LISTO:           ['ENTREGADO', 'CONTROL_CALIDAD', 'CANCELADO'],
    ENTREGADO:       [],
    CANCELADO:       [],
};
const esEstadoValido = (e) => Object.prototype.hasOwnProperty.call(TRANSICIONES, e);

// Valida taller y receta; devuelve un mensaje de error o null
function validarReferencias({ id_cliente, id_receta, id_taller }) {
    if (id_receta) {
        const receta = db.recetas.obtener(id_receta);
        if (!receta) return 'La receta indicada no existe';
        if (receta.id_cliente !== id_cliente) return 'La receta no pertenece al cliente de la orden';
    }
    if (id_taller) {
        const taller = db.talleres.obtener(id_taller);
        if (!taller) return 'El taller indicado no existe';
        if (!taller.activo) return 'El taller indicado está inactivo';
    }
    return null;
}

// GET órdenes con filtros
router.get('/', (req, res) => {
    try {
        const { estado, id_cliente, desde, hasta } = req.query;
        res.json(db.ordenes.listar({ estado, id_cliente, desde, hasta }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET orden por ID (incluye detalle e historial de etapas)
router.get('/:id', (req, res) => {
    try {
        const orden = db.ordenes.obtener(req.params.id);
        if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
        res.json(orden);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST crear orden
router.post('/', (req, res) => {
    try {
        const { detalle, ...datos } = req.body;

        if (!datos.id_cliente) return res.status(400).json({ error: 'El cliente es requerido' });
        if (!db.clientes.obtener(datos.id_cliente)) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }
        const errorRef = validarReferencias(datos);
        if (errorRef) return res.status(400).json({ error: errorRef });

        const lineas = Array.isArray(detalle) ? detalle : [];
        const cantidadDe = (d) => (d.cantidad === undefined || d.cantidad === null || d.cantidad === '' ? 1 : Number(d.cantidad));
        for (const d of lineas) {
            if (!(cantidadDe(d) > 0) || !(Number(d.precio_venta || 0) >= 0)) {
                return res.status(400).json({ error: 'Cantidad o precio inválido en el detalle' });
            }
        }

        const id_orden = uuidv4();
        const orden = {
            ...datos,
            id_orden,
            usuario_creador: req.user?.username || 'admin',
        };
        const detalles = lineas.map(d => ({
            id_detalle: uuidv4(),
            id_orden,
            id_producto: d.id_producto || null,
            cantidad: cantidadDe(d),
            precio_venta: Number(d.precio_venta || 0),
            ojo: d.ojo || null,
        }));

        db.ordenes.crear(orden, detalles);

        auditLog(req, 'CREAR', 'ORDENES',
            `Orden ${id_orden} creada para cliente ${orden.id_cliente} - Estado: PENDIENTE`
        );

        res.status(201).json({ id_orden, mensaje: 'Orden creada' });
    } catch (e) {
        console.error('Error al crear orden:', e);
        res.status(500).json({ error: e.message });
    }
});

// PUT cambiar estado (body: { estado, nota?, id_taller? })
router.put('/:id/estado', (req, res) => {
    try {
        const { estado, nota, id_taller } = req.body;
        if (!esEstadoValido(estado)) return res.status(400).json({ error: 'Estado no válido' });

        const orden = db.ordenes.obtener(req.params.id);
        if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

        if (!TRANSICIONES[orden.estado].includes(estado)) {
            return res.status(409).json({ error: `No se puede pasar de ${orden.estado} a ${estado}` });
        }

        const errorRef = validarReferencias({ id_cliente: orden.id_cliente, id_taller });
        if (errorRef) return res.status(400).json({ error: errorRef });

        if (estado === 'EN_TALLER' && !(id_taller || orden.id_taller)) {
            return res.status(400).json({ error: 'Selecciona el taller al que se envía la orden' });
        }

        db.ordenes.cambiarEstado(req.params.id, estado, {
            usuario: req.user?.username || null,
            nota: nota || null,
            id_taller: id_taller || null,
        });

        auditLog(req, 'MODIFICAR', 'ORDENES',
            `Orden ${req.params.id} pasó de ${orden.estado} a ${estado}`
        );
        res.json({ mensaje: 'Estado actualizado' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT editar datos generales de la orden
router.put('/:id', (req, res) => {
    try {
        const actual = db.ordenes.obtener(req.params.id);
        if (!actual) return res.status(404).json({ error: 'Orden no encontrada' });
        if (ESTADOS_FINALES.includes(actual.estado)) {
            return res.status(409).json({ error: `No se puede editar una orden ${actual.estado}` });
        }

        // Solo cambia lo que viene en el cuerpo; lo demás se conserva
        const val = (campo) =>
            Object.prototype.hasOwnProperty.call(req.body, campo) ? req.body[campo] : actual[campo];

        const orden = {
            ...actual,
            id_orden: req.params.id,
            id_receta: val('id_receta') || null,
            id_taller: val('id_taller') || null,
            fecha_entrega_estimada: val('fecha_entrega_estimada') || null,
            tipo_trabajo: val('tipo_trabajo'),
            observaciones: val('observaciones'),
            total_mano_obra: val('total_mano_obra'),
        };

        // El taller solo se valida si cambió (pudo desactivarse después de asignarlo)
        const errorRef = validarReferencias({
            id_cliente: actual.id_cliente,
            id_receta: orden.id_receta,
            id_taller: orden.id_taller !== actual.id_taller ? orden.id_taller : null,
        });
        if (errorRef) return res.status(400).json({ error: errorRef });

        db.ordenes.actualizar(orden);

        auditLog(req, 'MODIFICAR', 'ORDENES', `Orden ${req.params.id} datos actualizados`);
        res.json(db.ordenes.obtener(req.params.id));
    } catch (e) {
        console.error('Error al actualizar orden:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
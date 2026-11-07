import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    getOrdenes, getOrden, createOrden, updateOrden, updateOrdenEstado,
    getClientes, getRecetas, getProductos, getTalleres
} from '../services/api';
import { useToast } from '../components/Toast';
import {
    Plus, X, ChevronRight, Clock, AlertTriangle, CheckCircle2,
    User, Wrench, Calendar, PackageCheck, Eye, Edit2,
    FlaskConical, Truck, ShieldCheck, BadgeCheck, XCircle,
    Search, Package, Hash, RefreshCw, Inbox, AlertCircle
} from 'lucide-react';
import { formatCurrency } from '../utils/helpers';

// ─── Configuración de estados ──────────────────────────────────────────────
const ESTADOS = [
    { key: 'PENDIENTE',        label: 'Pendiente',       color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  icon: Clock,        next: 'EN_TALLER'       },
    { key: 'EN_TALLER',       label: 'En Taller',        color: '#3B82F6', bg: 'rgba(59,130,246,0.1)',  icon: Wrench,       next: 'RECIBIDO'        },
    { key: 'RECIBIDO',        label: 'Recibido',         color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)',  icon: PackageCheck, next: 'CONTROL_CALIDAD' },
    { key: 'CONTROL_CALIDAD', label: 'Control Calidad',  color: '#EC4899', bg: 'rgba(236,72,153,0.1)',  icon: ShieldCheck,  next: 'LISTO'           },
    { key: 'LISTO',           label: 'Listo',            color: '#10B981', bg: 'rgba(16,185,129,0.1)',  icon: BadgeCheck,   next: 'ENTREGADO'       },
    { key: 'ENTREGADO',       label: 'Entregado',        color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: Truck,        next: null              },
];
const ESTADO_CANCELADO = {
    key: 'CANCELADO', label: 'Cancelado',
    color: '#EF4444', bg: 'rgba(239,68,68,0.1)',
    icon: XCircle, next: null,
};

const getEstado = (key) => ESTADOS.find(e => e.key === key) || ESTADO_CANCELADO;

// Cambios de estado permitidos (mismo mapa que valida el servidor)
const TRANSICIONES = {
    PENDIENTE:       ['EN_TALLER', 'CONTROL_CALIDAD', 'LISTO', 'CANCELADO'],
    EN_TALLER:       ['RECIBIDO', 'CANCELADO'],
    RECIBIDO:        ['CONTROL_CALIDAD', 'EN_TALLER', 'LISTO', 'CANCELADO'],
    CONTROL_CALIDAD: ['LISTO', 'EN_TALLER', 'CANCELADO'],
    LISTO:           ['ENTREGADO', 'CONTROL_CALIDAD', 'CANCELADO'],
    ENTREGADO:       [],
    CANCELADO:       [],
};

// Fecha y hora local para <input type="datetime-local"> (toISOString da hora UTC)
const ahoraLocal = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const TIPOS_TRABAJO = [
    'Montaje completo', 'Tallado monofocal', 'Tallado bifocal',
    'Tallado progresivo', 'Solo lentes', 'Reparación',
    'Ajuste de armazón', 'Cambio de armazón', 'Cambio de lentes',
];

const FORM_EMPTY = {
    id_cliente: '', id_receta: '', id_taller: '',
    fecha_entrada: '',
    fecha_entrega_estimada: '',
    tipo_trabajo: '', observaciones: '',
    total_mano_obra: '',
    detalle: [],
};
const DET_EMPTY = { id_producto: '', cantidad: 1, precio_venta: '', ojo: '' };

// ─── Helpers ───────────────────────────────────────────────────────────────
const diasRestantes = (fecha) => {
    if (!fecha) return null;
    const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
    const fechaLocal = new Date(y, m - 1, d, 23, 59, 59);
    return Math.ceil((fechaLocal - new Date()) / 86400000);
};

const BadgeDias = ({ fecha, estadoKey }) => {
    const dias = diasRestantes(fecha);
    if (dias === null) return null;
    if (estadoKey === 'ENTREGADO') {
        return <span style={{ fontSize: 10, color: '#94a3b8' }}>Entregada</span>;
    }
    const base = { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', gap: 3 };
    if (dias < 0)  return <span style={{ ...base, background: 'rgba(239,68,68,0.15)', color: '#DC2626' }}><AlertTriangle size={9}/> Vencida {Math.abs(dias)}d</span>;
    if (dias === 0) return <span style={{ ...base, background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>Hoy</span>;
    if (dias <= 2)  return <span style={{ ...base, background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>{dias}d</span>;
    return <span style={{ ...base, background: '#f1f5f9', color: '#64748b' }}>{dias}d</span>;
};

const EMPTY_MSGS = {
    PENDIENTE:        { icon: Clock,        msg: 'Sin órdenes pendientes' },
    EN_TALLER:        { icon: Wrench,       msg: 'Nada en taller ahora'   },
    RECIBIDO:         { icon: PackageCheck, msg: 'Sin órdenes recibidas'  },
    CONTROL_CALIDAD:  { icon: ShieldCheck,  msg: 'Sin control pendiente'  },
    LISTO:            { icon: BadgeCheck,   msg: 'Sin órdenes listas'     },
    ENTREGADO:        { icon: Truck,        msg: 'Sin entregas aún'       },
    CANCELADO:        { icon: XCircle,      msg: 'Sin canceladas'         },
};

// ══════════════════════════════════════════════════════════════════════════
export default function Ordenes() {
    const toast = useToast();

    const [ordenes,   setOrdenes]   = useState([]);
    const [clientes,  setClientes]  = useState([]);
    const [recetas,   setRecetas]   = useState([]);
    const [productos, setProductos] = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [search,    setSearch]    = useState('');
    const [vistaCanceladas, setVistaCanceladas] = useState(false);

    const [showForm,    setShowForm]    = useState(false);
    const [editing,     setEditing]     = useState(null);
    const [form,        setForm]        = useState(FORM_EMPTY);
    const [currentDet,  setCurrentDet]  = useState(DET_EMPTY);
    const [saving,      setSaving]      = useState(false);

    const [detailOrden, setDetailOrden] = useState(null);
    const [talleres,     setTalleres]     = useState([]);
    const [accionEstado, setAccionEstado] = useState(null);   // { id, estado, orden } pendiente de confirmar

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const data = await getOrdenes();
            setOrdenes(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error cargando órdenes:', err);
            setLoadError(true);
            toast('No se pudieron cargar las órdenes. Verifica la conexión.', 'error');
        } finally {
            setLoading(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const loadAuxiliar = useCallback(async () => {
        try {
            const [c, p, tl] = await Promise.all([getClientes(), getProductos(), getTalleres({ soloActivos: 'true' })]);
            setClientes(Array.isArray(c) ? c : []);
            setProductos(Array.isArray(p) ? p : []);
            setTalleres(Array.isArray(tl) ? tl : []);
        } catch (err) {
            console.error('Error cargando auxiliares:', err);
            toast('Error cargando clientes o productos', 'error');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        loadData();
        loadAuxiliar();
    }, [loadData, loadAuxiliar]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return ordenes;
        return ordenes.filter(o =>
            o.cliente_nombre?.toLowerCase().includes(q) ||
            o.tipo_trabajo?.toLowerCase().includes(q)   ||
            String(o.id_orden ?? '').toLowerCase().includes(q)
        );
    }, [ordenes, search]);

    const porEstado = useCallback(
        (estado) => filtered.filter(o => o.estado === estado),
        [filtered]
    );

    const ESTADOS_ACTIVOS = ['PENDIENTE', 'EN_TALLER', 'RECIBIDO', 'CONTROL_CALIDAD', 'LISTO'];

    const totalActivas = useMemo(
        () => ordenes.filter(o => ESTADOS_ACTIVOS.includes(o.estado)).length,
        [ordenes]
    );

    const totalSinCanceladas = useMemo(
        () => ordenes.filter(o => o.estado !== 'CANCELADO').length,
        [ordenes]
    );

    const vencidas = useMemo(
        () => ordenes.filter(
            o => ESTADOS_ACTIVOS.includes(o.estado) &&
                diasRestantes(o.fecha_entrega_estimada) < 0
        ).length,
        [ordenes]
    );

    const fetchRecetas = async (idCliente) => {
        if (!idCliente) { setRecetas([]); return; }
        try {
            const data = await getRecetas({ id_cliente: idCliente });
            setRecetas(Array.isArray(data) ? data : []);
        } catch {
            setRecetas([]);
        }
    };

    const openCreate = () => {
        setForm({ ...FORM_EMPTY, fecha_entrada: ahoraLocal() });
        setEditing(null);
        setRecetas([]);
        setCurrentDet(DET_EMPTY);
        setShowForm(true);
    };

    const openEdit = (o) => {
        setForm({
            id_cliente:             o.id_cliente             || '',
            id_receta:              o.id_receta              || '',
            id_taller:              o.id_taller              || '',
            fecha_entrada:          o.fecha_entrada?.slice(0, 16) || ahoraLocal(),
            fecha_entrega_estimada: o.fecha_entrega_estimada?.slice(0, 10) || '',
            tipo_trabajo:           o.tipo_trabajo           || '',
            observaciones:          o.observaciones          || '',
            total_mano_obra:        o.total_mano_obra        ?? '',
            detalle:                o.detalle                || [],
        });
        fetchRecetas(o.id_cliente);
        setEditing(o);
        setCurrentDet(DET_EMPTY);
        setShowForm(true);
    };

    const f = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));

    const handleAddDet = () => {
        if (!currentDet.id_producto) return;
        const prod = productos.find(p => p.id_producto === currentDet.id_producto);
        setForm(p => ({
            ...p,
            detalle: [...p.detalle, {
                ...currentDet,
                nombre_producto:  prod?.nombre || '',
                id_detalle_temp:  Date.now(),
            }],
        }));
        setCurrentDet(DET_EMPTY);
    };

    const removeDet = (id) =>
        setForm(p => ({
            ...p,
            detalle: p.detalle.filter(d => d.id_detalle_temp !== id && d.id_detalle !== id),
        }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.id_cliente) return toast('Selecciona un cliente', 'error');
        setSaving(true);
        try {
            const payload = {
                ...form,
                total_mano_obra: parseFloat(form.total_mano_obra) || 0,
                detalle: form.detalle.map(d => ({
                    id_producto:  d.id_producto,
                    cantidad:     d.cantidad,
                    precio_venta: parseFloat(d.precio_venta) || 0,
                    ojo:          d.ojo,
                })),
            };
            if (editing) {
                await updateOrden(editing.id_orden, payload);
                toast('Orden actualizada');
            } else {
                await createOrden(payload);
                toast('Orden de trabajo creada');
            }
            setShowForm(false);
            loadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al guardar', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Recarga la lista sin mostrar el esqueleto de carga
    const refrescarOrdenes = async () => {
        try {
            const data = await getOrdenes();
            setOrdenes(Array.isArray(data) ? data : []);
        } catch { /* se mantiene la lista actual */ }
    };

    // Abre el panel de detalle y lo completa con el detalle y el historial del servidor
    const abrirDetalle = async (o) => {
        setDetailOrden(o);
        try { setDetailOrden(await getOrden(o.id_orden)); } catch { /* se muestra lo que ya hay */ }
    };

    // Aplica el cambio de estado en el servidor (extra: { id_taller?, nota? })
    const aplicarEstado = async (id, nuevoEstado, extra = {}) => {
        try {
            await updateOrdenEstado(id, nuevoEstado, extra);
            setAccionEstado(null);
            toast(`Estado → ${getEstado(nuevoEstado).label}`);
            await refrescarOrdenes();
            if (detailOrden?.id_orden === id) {
                try { setDetailOrden(await getOrden(id)); } catch { /* se mantiene el panel actual */ }
            }
        } catch (err) {
            toast(err.response?.data?.error || 'Error al cambiar estado', 'error');
        }
    };

    // Punto de entrada de tarjetas y panel: valida y pide confirmación o taller cuando corresponde
    const cambiarEstado = (id, nuevoEstado) => {
        const orden = ordenes.find(o => o.id_orden === id);
        if (!orden) return;
        if (!(TRANSICIONES[orden.estado] || []).includes(nuevoEstado)) {
            toast(`No se puede pasar de ${getEstado(orden.estado).label} a ${getEstado(nuevoEstado).label}`, 'error');
            return;
        }
        if (nuevoEstado === 'CANCELADO' || (nuevoEstado === 'EN_TALLER' && !orden.id_taller)) {
            setAccionEstado({ id, estado: nuevoEstado, orden });
            return;
        }
        aplicarEstado(id, nuevoEstado);
    };

    return (
        <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 64px)' }}>

            {/* ── Header ── */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 20, flexShrink: 0, gap: 12, flexWrap: 'wrap',
                position: 'sticky', top: 0, zIndex: 10, background: 'white',
                paddingTop: 8, paddingBottom: 8,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 46, height: 46, borderRadius: 13,
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                        border: '1.5px solid rgba(59,130,246,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <FlaskConical size={21} color="#3B82F6" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 21, fontWeight: 800, color: '#1D1136', margin: 0, letterSpacing: '-0.02em' }}>
                            Órdenes de Trabajo
                        </h1>
                        <div style={{ display: 'flex', gap: 10, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: '#64748b' }}>
                                <b style={{ color: '#1D1136' }}>{totalActivas}</b> activas
                                {' · '}
                                <b style={{ color: '#1D1136' }}>{totalSinCanceladas}</b> total
                            </span>
                            {vencidas > 0 && (
                                <span style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: 11, fontWeight: 700,
                                    color: '#DC2626',
                                    background: 'rgba(239,68,68,0.12)',
                                    padding: '3px 9px', borderRadius: 6,
                                    border: '1px solid rgba(239,68,68,0.25)',
                                }}>
                                    <AlertTriangle size={11} />
                                    {vencidas} vencida{vencidas > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="search-bar" style={{ minWidth: 220 }}>
                        <Search size={14} className="search-icon" />
                        <input
                            className="form-input"
                            placeholder="Buscar cliente, tipo…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ paddingLeft: 38, height: 38 }}
                        />
                    </div>

                    <button
                        onClick={() => setVistaCanceladas(p => !p)}
                        style={{
                            padding: '9px 16px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                            border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s',
                            borderColor: vistaCanceladas ? '#EF4444' : '#e2e8f0',
                            background:  vistaCanceladas ? 'rgba(239,68,68,0.07)' : 'white',
                            color:       vistaCanceladas ? '#DC2626' : '#475569',
                            minHeight: 40,
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        <XCircle size={14} />
                        {vistaCanceladas ? 'Ver kanban' : 'Canceladas'}
                    </button>

                    <button className="btn btn-primary" onClick={openCreate} style={{ minHeight: 40 }}>
                        <Plus size={16} /> Nueva Orden
                    </button>
                </div>
            </div>

            {/* ── Cuerpo ── */}
            {loading ? (
                <KanbanSkeleton />
            ) : loadError ? (
                <ErrorState onRetry={loadData} />
            ) : vistaCanceladas ? (
                <ListaCanceladas
                    ordenes={filtered.filter(o => o.estado === 'CANCELADO')}
                    onDetail={abrirDetalle}
                    onEdit={openEdit}
                />
            ) : (
                <div style={{ flex: 1, overflowX: 'auto', paddingBottom: 16 }}>
                    <div style={{
                        display: 'flex', gap: 14,
                        minWidth: `${ESTADOS.length * 314}px`,
                    }}>
                        {ESTADOS.map(est => (
                            <KanbanCol
                                key={est.key}
                                estado={est}
                                ordenes={porEstado(est.key)}
                                onCambiarEstado={cambiarEstado}
                                onEdit={openEdit}
                                onDetail={abrirDetalle}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Drawer Detalle ── */}
            {detailOrden && (
                <DetalleDrawer
                    orden={detailOrden}
                    onClose={() => setDetailOrden(null)}
                    onCambiarEstado={cambiarEstado}
                    onEdit={() => { openEdit(detailOrden); setDetailOrden(null); }}
                />
            )}

            {/* ── Modal Formulario ── */}
            {accionEstado && (
                <AccionEstadoModal
                    accion={accionEstado}
                    talleres={talleres}
                    onCancelar={() => setAccionEstado(null)}
                    onConfirmar={aplicarEstado}
                />
            )}

            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div
                        className="modal-content"
                        onClick={e => e.stopPropagation()}
                        style={{ maxWidth: 720, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}
                    >
                        {/* Header modal */}
                        <div style={{
                            padding: '22px 28px 18px',
                            borderBottom: '1px solid #f1f5f9',
                            background: 'linear-gradient(135deg, #f0f7ff, #f5f0ff)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            flexShrink: 0,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <FlaskConical size={17} color="white" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1D1136', margin: 0 }}>
                                        {editing ? 'Editar Orden' : 'Nueva Orden de Trabajo'}
                                    </h2>
                                    <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
                                        {editing ? `ID: ${String(editing.id_orden).slice(0, 8)}…` : 'Completa los datos del trabajo'}
                                    </p>
                                </div>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>
                                <X size={15} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ padding: '22px 28px', overflowY: 'auto', flex: 1 }}>
                            {/* Cliente + Receta */}
                            <FormSection icon={<User size={12} />} label="Cliente" />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                                <div>
                                    <label className="form-label">Cliente *</label>
                                    <select
                                        className="form-select"
                                        required
                                        value={form.id_cliente}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setForm(p => ({ ...p, id_cliente: val, id_receta: '' }));
                                            fetchRecetas(val);
                                        }}
                                    >
                                        <option value="">Seleccione un cliente…</option>
                                        {clientes.map(c => (
                                            <option key={c.id_cliente} value={c.id_cliente}>
                                                {c.nombre_razon_social}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Receta vinculada</label>
                                    <select
                                        className="form-select"
                                        value={form.id_receta}
                                        onChange={f('id_receta')}
                                        disabled={!form.id_cliente}
                                    >
                                        <option value="">— Sin receta —</option>
                                        {recetas.map(r => (
                                            <option key={r.id_receta} value={r.id_receta}>
                                                {r.fecha_receta?.slice(0, 10)} · {r.tipo_lente || 'Sin tipo'} · OD {r.od_esfera ?? '-'}/{r.od_cilindro ?? '-'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Trabajo */}
                            <FormSection icon={<Wrench size={12} />} label="Trabajo" />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                                <div>
                                    <label className="form-label">Tipo de trabajo</label>
                                    <input
                                        className="form-input"
                                        list="tipos-trabajo"
                                        value={form.tipo_trabajo}
                                        onChange={f('tipo_trabajo')}
                                        placeholder="Ej: Montaje completo"
                                    />
                                    <datalist id="tipos-trabajo">
                                        {TIPOS_TRABAJO.map(t => <option key={t} value={t} />)}
                                    </datalist>
                                </div>
                                <div>
                                    <label className="form-label">Mano de obra (S/)</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        step="0.50"
                                        min="0"
                                        value={form.total_mano_obra}
                                        onChange={f('total_mano_obra')}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Fecha de entrada</label>
                                    <input
                                        className="form-input"
                                        type="datetime-local"
                                        value={form.fecha_entrada}
                                        onChange={f('fecha_entrada')}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Fecha entrega estimada</label>
                                    <input
                                        className="form-input"
                                        type="date"
                                        value={form.fecha_entrega_estimada}
                                        onChange={f('fecha_entrega_estimada')}
                                    />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">Taller (si el trabajo se manda fuera del local)</label>
                                    <select className="form-select" value={form.id_taller} onChange={f('id_taller')}>
                                        <option value="">Sin taller (trabajo en el local)</option>
                                        {editing?.id_taller && !talleres.some(t => t.id_taller === editing.id_taller) && (
                                            <option value={editing.id_taller}>{editing.taller_nombre || 'Taller actual'} (inactivo)</option>
                                        )}
                                        {talleres.map(t => <option key={t.id_taller} value={t.id_taller}>{t.nombre}</option>)}
                                    </select>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">Observaciones</label>
                                    <textarea
                                        className="form-input"
                                        rows={2}
                                        value={form.observaciones}
                                        onChange={f('observaciones')}
                                        placeholder="Indicaciones especiales, color de armazón, etc."
                                        style={{ resize: 'vertical', minHeight: 60 }}
                                    />
                                </div>
                            </div>

                            {/* Detalle productos */}
                            <FormSection icon={<Package size={12} />} label="Productos / Materiales (opcional)" />
                            {editing && (
                                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>
                                    Los materiales no se pueden modificar en una orden ya creada.
                                </p>
                            )}
                            {!editing && (
                            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                                <select
                                    className="form-select"
                                    style={{ flex: 2, minWidth: 160 }}
                                    value={currentDet.id_producto}
                                    onChange={e => {
                                        const prod = productos.find(p => p.id_producto === e.target.value);
                                        setCurrentDet(p => ({
                                            ...p,
                                            id_producto:  e.target.value,
                                            precio_venta: prod?.precio_venta || '',
                                        }));
                                    }}
                                >
                                    <option value="">Seleccionar producto…</option>
                                    {productos.filter(p => p.estado).map(p => (
                                        <option key={p.id_producto} value={p.id_producto}>
                                            {p.nombre} ({p.sku})
                                        </option>
                                    ))}
                                </select>
                                <input
                                    className="form-input"
                                    type="number"
                                    placeholder="Cant."
                                    style={{ width: 70 }}
                                    min="1"
                                    value={currentDet.cantidad}
                                    onChange={e => setCurrentDet(p => ({ ...p, cantidad: Number(e.target.value) }))}
                                />
                                <input
                                    className="form-input"
                                    type="number"
                                    step="0.01"
                                    placeholder="Precio"
                                    style={{ width: 90 }}
                                    value={currentDet.precio_venta}
                                    onChange={e => setCurrentDet(p => ({ ...p, precio_venta: e.target.value }))}
                                />
                                <select
                                    className="form-select"
                                    style={{ width: 85 }}
                                    value={currentDet.ojo}
                                    onChange={e => setCurrentDet(p => ({ ...p, ojo: e.target.value }))}
                                >
                                    <option value="">Ambos</option>
                                    <option value="OD">OD</option>
                                    <option value="OI">OI</option>
                                </select>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddDet}>
                                    <Plus size={14} /> Agregar
                                </button>
                            </div>
                            )}

                            {form.detalle.length > 0 && (
                                <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                                    <table className="data-table" style={{ margin: 0 }}>
                                        <thead>
                                            <tr>
                                                <th>Producto</th>
                                                <th>Cant.</th>
                                                <th>Ojo</th>
                                                <th>Precio</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {form.detalle.map(d => (
                                                <tr key={d.id_detalle_temp || d.id_detalle}>
                                                    <td style={{ fontSize: 12 }}>{d.nombre_producto || d.producto_nombre}</td>
                                                    <td style={{ fontSize: 12 }}>{d.cantidad}</td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 700,
                                                            padding: '2px 7px', borderRadius: 5,
                                                            background: '#f1f5f9', color: '#475569',
                                                        }}>
                                                            {d.ojo || 'Ambos'}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontSize: 12 }}>{formatCurrency(d.precio_venta)}</td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            onClick={() => !editing && removeDet(d.id_detalle_temp || d.id_detalle)}
                                                            disabled={!!editing}
                                                            style={{
                                                                background: 'rgba(239,68,68,0.08)',
                                                                border: '1px solid rgba(239,68,68,0.2)',
                                                                borderRadius: 6, padding: '4px 7px',
                                                                cursor: 'pointer', color: '#DC2626',
                                                                minWidth: 28, minHeight: 28,
                                                            }}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear Orden'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Estado de error ───────────────────────────────────────────────────────
function ErrorState({ onRetry }) {
    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
            padding: 40, textAlign: 'center',
        }}>
            <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: 'rgba(239,68,68,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <AlertCircle size={28} color="#DC2626" />
            </div>
            <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1D1136', margin: '0 0 6px' }}>
                    Error al cargar las órdenes
                </p>
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                    No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.
                </p>
            </div>
            <button
                onClick={onRetry}
                className="btn btn-primary"
                style={{ gap: 8 }}
            >
                <RefreshCw size={15} /> Reintentar
            </button>
        </div>
    );
}

// ─── Vista lista de canceladas ─────────────────────────────────────────────
function ListaCanceladas({ ordenes, onDetail, onEdit }) {
    return (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
            {ordenes.length === 0 ? (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 12, padding: '60px 20px', textAlign: 'center',
                }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        background: 'rgba(239,68,68,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <XCircle size={24} color="#EF444466" />
                    </div>
                    <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>No hay órdenes canceladas</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 120px',
                        padding: '8px 16px',
                        fontSize: 10.5, fontWeight: 700, color: '#94a3b8',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        borderBottom: '1px solid #e2e8f0',
                        background: '#f8f7ff',
                        borderRadius: '10px 10px 0 0',
                        border: '1.5px solid #e2e8f0',
                    }}>
                        <span>Cliente</span>
                        <span>Tipo</span>
                        <span>Entrada</span>
                        <span>Entrega est.</span>
                        <span style={{ textAlign: 'right' }}>Acciones</span>
                    </div>
                    {ordenes.map((o, i) => (
                        <div key={o.id_orden} style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 1fr 1fr 1fr 120px',
                            padding: '11px 16px',
                            alignItems: 'center',
                            background: i % 2 === 0 ? 'white' : '#fafafa',
                            borderLeft: '1.5px solid #e2e8f0',
                            borderRight: '1.5px solid #e2e8f0',
                            borderBottom: i === ordenes.length - 1 ? '1.5px solid #e2e8f0' : '1px solid #f1f5f9',
                            borderRadius: i === ordenes.length - 1 ? '0 0 10px 10px' : 0,
                        }}>
                            <div>
                                <p style={{ fontSize: 13, fontWeight: 600, color: '#1D1136', margin: 0 }}>
                                    {o.cliente_nombre}
                                </p>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
                                    #{String(o.id_orden).slice(0, 8)}
                                </p>
                            </div>
                            <span style={{ fontSize: 12, color: '#475569' }}>{o.tipo_trabajo || '—'}</span>
                            <span style={{ fontSize: 12, color: '#475569' }}>
                                {o.fecha_entrada?.slice(0, 10) || '—'}
                            </span>
                            <span style={{ fontSize: 12, color: '#475569' }}>
                                {o.fecha_entrega_estimada?.slice(0, 10) || '—'}
                            </span>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => onDetail(o)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                                        background: '#f8f7ff', border: '1.5px solid #e2e8f0',
                                        cursor: 'pointer', color: '#475569',
                                    }}
                                >
                                    <Eye size={12} /> Ver
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Skeleton de carga Kanban ──────────────────────────────────────────────
function KanbanSkeleton() {
    return (
        <div style={{ flex: 1, overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 14, minWidth: `${ESTADOS.length * 314}px`, paddingBottom: 16 }}>
                {ESTADOS.map(est => (
                    <div key={est.key} style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{
                            padding: '10px 14px', borderRadius: '12px 12px 0 0',
                            background: est.bg, border: `1.5px solid ${est.color}22`,
                            borderBottom: `2px solid ${est.color}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <est.icon size={14} color={est.color} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: est.color }}>{est.label}</span>
                            </div>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${est.color}33`, animation: 'pulse 1.5s infinite' }} />
                        </div>
                        <div style={{
                            flex: 1, background: '#f8f7ff',
                            borderRadius: '0 0 12px 12px',
                            border: '1.5px solid #e2e8f0', borderTop: 'none',
                            padding: '8px',
                            display: 'flex', flexDirection: 'column', gap: 8,
                        }}>
                            {[1, 2].map(i => (
                                <div key={i} style={{
                                    background: 'white', borderRadius: 10,
                                    border: '1.5px solid #e2e8f0', padding: '11px 13px',
                                    opacity: i === 2 ? 0.5 : 1,
                                }}>
                                    <div style={{ height: 12, width: '70%', background: '#f1f5f9', borderRadius: 6, marginBottom: 8, animation: 'pulse 1.5s infinite' }} />
                                    <div style={{ height: 10, width: '45%', background: '#f1f5f9', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
        </div>
    );
}

// ─── Columna Kanban ────────────────────────────────────────────────────────
function KanbanCol({ estado, ordenes, onCambiarEstado, onEdit, onDetail }) {
    const emptyInfo = EMPTY_MSGS[estado.key];
    const EmptyIcon = emptyInfo?.icon || Inbox;

    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');

    const ordenesFiltradas = useMemo(() => {
        if (estado.key !== 'ENTREGADO') return ordenes;
        const filtradas = ordenes.filter(o => {
            const fechaRef = o.fecha_entrega_real || o.fecha_entrega_estimada;
            if (!fechaRef) return true;
            const f = fechaRef.slice(0, 10);
            if (fechaDesde && f < fechaDesde) return false;
            if (fechaHasta && f > fechaHasta) return false;
            return true;
        });
        const conFiltro = fechaDesde || fechaHasta;
        if (conFiltro) return filtradas;
        return [...filtradas]
            .sort((a, b) => {
                const fa = (a.fecha_entrega_real || a.fecha_entrega_estimada || '');
                const fb = (b.fecha_entrega_real || b.fecha_entrega_estimada || '');
                return fb.localeCompare(fa);
            })
            .slice(0, 15);
    }, [ordenes, estado.key, fechaDesde, fechaHasta]);

    return (
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Header columna */}
            <div style={{
                padding: '10px 14px', borderRadius: '12px 12px 0 0', marginBottom: 0,
                background: estado.bg, border: `1.5px solid ${estado.color}22`,
                borderBottom: `2px solid ${estado.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <estado.icon size={14} color={estado.color} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: estado.color }}>{estado.label}</span>
                </div>
                <span style={{
                    fontSize: 11, fontWeight: 800, width: 22, height: 22, borderRadius: '50%',
                    background: estado.color, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    {ordenesFiltradas.length}
                </span>
            </div>

            {/* Filtro de fechas — solo ENTREGADO */}
            {estado.key === 'ENTREGADO' && (
                <div style={{
                    padding: '8px 10px',
                    background: estado.bg,
                    border: `1.5px solid ${estado.color}22`,
                    borderTop: 'none',
                    display: 'flex', flexDirection: 'column', gap: 5,
                    flexShrink: 0,
                }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Filtrar por fecha
                    </span>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <input
                            type="date"
                            value={fechaDesde}
                            onChange={e => setFechaDesde(e.target.value)}
                            style={{
                                flex: 1, fontSize: 10.5, padding: '4px 6px', borderRadius: 6,
                                border: '1.5px solid #e2e8f0', background: 'white',
                                color: '#475569', outline: 'none',
                            }}
                            title="Desde"
                        />
                        <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>–</span>
                        <input
                            type="date"
                            value={fechaHasta}
                            onChange={e => setFechaHasta(e.target.value)}
                            style={{
                                flex: 1, fontSize: 10.5, padding: '4px 6px', borderRadius: 6,
                                border: '1.5px solid #e2e8f0', background: 'white',
                                color: '#475569', outline: 'none',
                            }}
                            title="Hasta"
                        />
                        {(fechaDesde || fechaHasta) && (
                            <button
                                onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
                                title="Limpiar filtro"
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    width: 22, height: 22, borderRadius: 5, border: 'none',
                                    background: 'rgba(239,68,68,0.1)', cursor: 'pointer',
                                    color: '#DC2626', flexShrink: 0,
                                }}
                            >
                                <X size={11} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Cards – sin límite de altura ni scroll interno */}
            <div style={{
                flex: 1,
                padding: '8px 0',
                background: '#f8f7ff',
                borderRadius: '0 0 12px 12px',
                border: '1.5px solid #e2e8f0',
                borderTop: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}>
                {ordenesFiltradas.length === 0 ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: 8,
                        padding: '32px 12px', textAlign: 'center', flex: 1,
                    }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: '50%',
                            background: `${estado.color}14`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <EmptyIcon size={17} color={`${estado.color}99`} />
                        </div>
                        <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 500, lineHeight: 1.4 }}>
                            {(fechaDesde || fechaHasta) ? 'Sin entregas en ese período' : emptyInfo?.msg || 'Sin órdenes'}
                        </span>
                    </div>
                ) : (
                    <>
                        {ordenesFiltradas.map(o => (
                            <OrdenCard
                                key={o.id_orden}
                                orden={o}
                                estado={estado}
                                onCambiarEstado={onCambiarEstado}
                                onEdit={onEdit}
                                onDetail={onDetail}
                            />
                        ))}
                        {estado.key === 'ENTREGADO' && !fechaDesde && !fechaHasta && ordenes.length > 15 && (
                            <div style={{
                                margin: '0 8px 4px',
                                padding: '8px 12px',
                                borderRadius: 8,
                                background: 'rgba(100,116,139,0.06)',
                                border: '1px dashed #cbd5e1',
                                textAlign: 'center',
                            }}>
                                <span style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>
                                    Mostrando las 15 más recientes.{' '}
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>
                                        Usa el filtro de fechas para ver más.
                                    </span>
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Card de orden expandible ─────────────────────────────────────────────
function OrdenCard({ orden, estado, onCambiarEstado, onEdit, onDetail }) {
    const [expanded, setExpanded] = useState(false);
    const vencida = diasRestantes(orden.fecha_entrega_estimada) < 0 &&
        !['ENTREGADO', 'CANCELADO'].includes(orden.estado);

    return (
        <div style={{
            margin: '0 8px',
            background: 'white',
            borderRadius: 10,
            border:     `1.5px solid ${vencida ? 'rgba(239,68,68,0.35)' : '#e2e8f0'}`,
            boxShadow:   vencida ? '0 0 0 2px rgba(239,68,68,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            transition: 'box-shadow 0.15s',
        }}>
            {/* Franja color estado */}
            <div style={{ height: 2, background: estado.color }} />

            <div style={{ padding: '11px 13px' }}>
                {/* Cliente + días */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                            fontSize: 12.5, fontWeight: 700, color: '#1D1136', margin: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {orden.cliente_nombre}
                        </p>
                        <p style={{
                            fontSize: 10.5, color: '#64748b', margin: '2px 0 0',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {orden.tipo_trabajo || '—'}
                        </p>
                    </div>
                    {orden.fecha_entrega_estimada && (
                        <div style={{ marginLeft: 6, flexShrink: 0 }}>
                            <BadgeDias fecha={orden.fecha_entrega_estimada} estadoKey={orden.estado} />
                        </div>
                    )}
                </div>

                {/* Botón expandir/colapsar */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 10, fontWeight: 600, color: '#64748b',
                        padding: '2px 0', marginBottom: expanded ? 8 : 10,
                    }}
                >
                    <ChevronRight size={10} style={{
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                    }} />
                    {expanded ? 'Menos detalles' : 'Más detalles'}
                </button>

                {/* Detalles expandibles */}
                {expanded && (
                    <div style={{
                        marginBottom: 10,
                        paddingLeft: 4,
                        borderLeft: '1.5px solid #e2e8f0',
                        fontSize: 10.5,
                        color: '#475569',
                        display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                        {orden.fecha_entrega_estimada && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Calendar size={10} color="#94a3b8" />
                                <span>
                                    {orden.estado === 'ENTREGADO'
                                        ? `Entregado: ${(orden.fecha_entrega_real || orden.fecha_entrega_estimada)?.slice(0, 10)}`
                                        : `Entrega: ${orden.fecha_entrega_estimada?.slice(0, 10)}`
                                    }
                                </span>
                            </div>
                        )}
                        {orden.total_mano_obra > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Hash size={10} color="#94a3b8" />
                                <span>M.O.: {formatCurrency(orden.total_mano_obra)}</span>
                            </div>
                        )}
                        {orden.observaciones && (
                            <div style={{ fontStyle: 'italic', lineHeight: 1.4, wordBreak: 'break-word' }}>
                                {orden.observaciones}
                            </div>
                        )}
                        {orden.detalle?.length > 0 && (
                            <div>
                                <span style={{ fontWeight: 600, marginBottom: 2, display: 'block' }}>Materiales:</span>
                                <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
                                    {orden.detalle.map((d, i) => (
                                        <li key={i} style={{ marginBottom: 2 }}>
                                            {d.nombre_producto || d.producto_nombre} x{d.cantidad} · {d.ojo || 'Ambos'} – {formatCurrency(d.precio_venta)}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Acciones */}
                <div style={{ display: 'flex', gap: 5 }}>
                    <button
                        onClick={() => onDetail(orden)}
                        title="Ver detalle"
                        style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                            padding: '7px 0', minHeight: 34, borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                            background: orden.estado === 'ENTREGADO' ? '#f0fdf4' : '#f8f7ff',
                            border: `1.5px solid ${orden.estado === 'ENTREGADO' ? '#bbf7d0' : '#e2e8f0'}`,
                            cursor: 'pointer',
                            color: orden.estado === 'ENTREGADO' ? '#15803d' : '#475569',
                        }}
                    >
                        <Eye size={13} />
                        Ver detalle
                    </button>
                    {orden.estado !== 'ENTREGADO' && orden.estado !== 'CANCELADO' && (
                        <button
                            onClick={() => onEdit(orden)}
                            title="Editar orden"
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: '7px 9px', minHeight: 34, minWidth: 34, borderRadius: 7,
                                background: '#f8f7ff', border: '1.5px solid #e2e8f0',
                                cursor: 'pointer', color: '#64748b',
                            }}
                        >
                            <Edit2 size={13} />
                        </button>
                    )}
                    {estado.next && orden.estado !== 'ENTREGADO' && (
                        <button
                            onClick={() => onCambiarEstado(orden.id_orden, estado.next)}
                            title={`Mover a ${getEstado(estado.next).label}`}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: '7px 9px', minHeight: 34, minWidth: 34, borderRadius: 7,
                                background: `${estado.color}14`,
                                border: `1.5px solid ${estado.color}33`,
                                cursor: 'pointer', color: estado.color,
                            }}
                        >
                            <ChevronRight size={13} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Drawer Detalle ────────────────────────────────────────────────────────
function DetalleDrawer({ orden, onClose, onCambiarEstado, onEdit }) {
    const est = getEstado(orden.estado);
    const EstIcon = est.icon;
    const estadosParaCambiar = ESTADOS.filter(e => (TRANSICIONES[orden.estado] || []).includes(e.key));

    return (
        <>
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(29,17,54,0.3)',
                    backdropFilter: 'blur(2px)', zIndex: 90,
                }}
            />
            <div style={{
                position: 'fixed', right: 0, top: 0, bottom: 0, width: 420,
                background: 'white', zIndex: 91,
                display: 'flex', flexDirection: 'column',
                boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
                animation: 'slideInRight 0.25s ease',
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
                    background: 'linear-gradient(135deg, #f8f7ff, #f0f7ff)',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{
                                    fontSize: 10, fontWeight: 700, color: '#64748b',
                                    letterSpacing: '0.08em', textTransform: 'uppercase',
                                }}>
                                    Orden #{String(orden.id_orden ?? '').slice(0, 8)}
                                </span>
                                <span style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: 11, fontWeight: 700,
                                    padding: '2px 8px', borderRadius: 6,
                                    background: est.bg, color: est.color,
                                }}>
                                    <EstIcon size={11} /> {est.label}
                                </span>
                            </div>
                            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1D1136', margin: 0 }}>
                                {orden.cliente_nombre}
                            </h3>
                            <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
                                {orden.tipo_trabajo || 'Sin tipo de trabajo'}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'white', border: '1.5px solid #e2e8f0',
                                borderRadius: 8, padding: '7px', cursor: 'pointer',
                                color: '#475569', display: 'flex', alignItems: 'center',
                                minWidth: 36, minHeight: 36, justifyContent: 'center',
                            }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Contenido */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                    {/* Timeline de estado */}
                    <p style={{
                        fontSize: 10, fontWeight: 700, color: '#94a3b8',
                        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12,
                    }}>
                        Flujo de trabajo
                    </p>
                    <div style={{
                        display: 'flex', alignItems: 'center', marginBottom: 20,
                        overflowX: 'auto', paddingBottom: 4,
                    }}>
                        {ESTADOS.map((e, i) => {
                            const idx     = ESTADOS.findIndex(x => x.key === orden.estado);
                            const done    = i < idx;
                            const current = e.key === orden.estado;
                            const EIcon   = e.icon;
                            return (
                                <div key={e.key} style={{ display: 'flex', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: done ? e.color : current ? e.color : '#f1f5f9',
                                            border: `2px solid ${done || current ? e.color : '#e2e8f0'}`,
                                            transition: 'all 0.2s',
                                        }}>
                                            {done
                                                ? <CheckCircle2 size={14} color="white" />
                                                : <EIcon size={12} color={current ? 'white' : '#94a3b8'} />
                                            }
                                        </div>
                                        <span style={{
                                            fontSize: 9, fontWeight: 600,
                                            color: current ? e.color : done ? '#64748b' : '#cbd5e1',
                                            whiteSpace: 'nowrap', maxWidth: 48,
                                            textAlign: 'center', lineHeight: 1.2,
                                        }}>
                                            {e.label}
                                        </span>
                                    </div>
                                    {i < ESTADOS.length - 1 && (
                                        <div style={{
                                            height: 2, width: 16,
                                            background: done ? '#10B981' : '#e2e8f0',
                                            marginBottom: 18, flexShrink: 0,
                                        }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Datos */}
                    <DrawerSection label="Fechas">
                        <DrawerRow label="Entrada"  value={orden.fecha_entrada?.slice(0, 16).replace('T', ' ')} />
                        <DrawerRow
                            label="Estimada"
                            value={orden.fecha_entrega_estimada?.slice(0, 10) || '—'}
                            highlight={diasRestantes(orden.fecha_entrega_estimada) < 0}
                        />
                        {orden.fecha_entrega_real && (
                            <DrawerRow label="Entregada" value={orden.fecha_entrega_real?.slice(0, 10)} />
                        )}
                    </DrawerSection>

                    <DrawerSection label="Trabajo">
                        <DrawerRow label="Tipo"      value={orden.tipo_trabajo || '—'} />
                        <DrawerRow label="Mano obra" value={formatCurrency(orden.total_mano_obra || 0)} />
                        {orden.observaciones && <DrawerRow label="Notas" value={orden.observaciones} />}
                    </DrawerSection>

                    {orden.detalle?.length > 0 && (
                        <DrawerSection label={`Materiales (${orden.detalle.length})`}>
                            {orden.detalle.map((d, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '6px 0',
                                    borderBottom: i < orden.detalle.length - 1 ? '1px solid #f1f5f9' : 'none',
                                }}>
                                    <div>
                                        <p style={{ fontSize: 12, fontWeight: 600, color: '#1D1136', margin: 0 }}>
                                            {d.nombre_producto || d.producto_nombre}
                                        </p>
                                        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                                            x{d.cantidad} · {d.ojo || 'Ambos'}
                                        </p>
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                                        {formatCurrency(d.precio_venta)}
                                    </span>
                                </div>
                            ))}
                        </DrawerSection>
                    )}

                    {/* Taller e historial de etapas */}
                    {(orden.taller_nombre || orden.fecha_envio_taller || orden.fecha_recepcion_taller) && (
                        <DrawerSection label="Taller">
                            <DrawerRow label="Taller" value={orden.taller_nombre || '—'} />
                            <DrawerRow label="Enviado" value={orden.fecha_envio_taller ? orden.fecha_envio_taller.slice(0, 16).replace('T', ' ') : '—'} />
                            <DrawerRow label="Recibido" value={orden.fecha_recepcion_taller ? orden.fecha_recepcion_taller.slice(0, 16).replace('T', ' ') : '—'} />
                        </DrawerSection>
                    )}
                    {Array.isArray(orden.historial) && orden.historial.length > 0 && (
                        <DrawerSection label="Historial de etapas">
                            {orden.historial.map(h => (
                                <div key={h.id_historial} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                    <div>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: getEstado(h.estado).color, margin: 0 }}>
                                            {getEstado(h.estado).label}{h.taller_nombre ? ` · ${h.taller_nombre}` : ''}
                                        </p>
                                        {h.nota && <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>{h.nota}</p>}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{(h.fecha_hora || '').slice(0, 16).replace('T', ' ')}</p>
                                        {h.usuario && <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{h.usuario}</p>}
                                    </div>
                                </div>
                            ))}
                        </DrawerSection>
                    )}

                    {/* Cambiar estado */}
                    {orden.estado !== 'ENTREGADO' && orden.estado !== 'CANCELADO' && (
                        <DrawerSection label="Cambiar estado">
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                {estadosParaCambiar.map(e => {
                                    const EI = e.icon;
                                    return (
                                        <button
                                            key={e.key}
                                            onClick={() => onCambiarEstado(orden.id_orden, e.key)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 5,
                                                padding: '7px 12px', minHeight: 34, borderRadius: 8,
                                                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                border: `1.5px solid ${e.color}44`,
                                                background: e.bg, color: e.color,
                                            }}
                                        >
                                            <EI size={12} /> {e.label}
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={() => onCambiarEstado(orden.id_orden, 'CANCELADO')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '7px 12px', minHeight: 34, borderRadius: 8,
                                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                        border: '1.5px solid rgba(239,68,68,0.3)',
                                        background: 'rgba(239,68,68,0.07)', color: '#DC2626',
                                    }}
                                >
                                    <XCircle size={12} /> Cancelar
                                </button>
                            </div>
                        </DrawerSection>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '14px 24px', borderTop: '1px solid #f1f5f9',
                    display: 'flex', gap: 10, flexShrink: 0,
                }}>
                    <button onClick={onEdit} className="btn btn-secondary" style={{ flex: 1 }}>
                        <Edit2 size={14} /> Editar orden
                    </button>
                    {est.next && (
                        <button
                            onClick={() => onCambiarEstado(orden.id_orden, est.next)}
                            className="btn btn-primary"
                            style={{ flex: 1 }}
                        >
                            <ChevronRight size={14} /> {getEstado(est.next).label}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}

// ─── Auxiliares ────────────────────────────────────────────────────────────
function AccionEstadoModal({ accion, talleres, onCancelar, onConfirmar }) {
    const esTaller = accion.estado === 'EN_TALLER';
    const [idTaller, setIdTaller] = useState(accion.orden.id_taller || '');
    const [nota, setNota] = useState('');
    const puedeConfirmar = !esTaller || !!idTaller;

    return (
        <div className="modal-overlay" onClick={onCancelar}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1D1136', margin: '0 0 6px' }}>
                    {esTaller ? 'Enviar a taller' : 'Cancelar orden'}
                </h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
                    {esTaller
                        ? 'Elige el taller al que se envía este trabajo.'
                        : 'Una orden cancelada no se puede reactivar.'}
                </p>
                {esTaller && (
                    <div style={{ marginBottom: 14 }}>
                        <label className="form-label">Taller</label>
                        <select className="form-select" value={idTaller} onChange={e => setIdTaller(e.target.value)}>
                            <option value="">Seleccionar taller…</option>
                            {talleres.map(t => <option key={t.id_taller} value={t.id_taller}>{t.nombre}</option>)}
                        </select>
                        {talleres.length === 0 && (
                            <p style={{ fontSize: 11, color: '#B45309', margin: '6px 0 0' }}>
                                No hay talleres activos. Regístralos en la sección Talleres.
                            </p>
                        )}
                    </div>
                )}
                <div style={{ marginBottom: 18 }}>
                    <label className="form-label">{esTaller ? 'Nota (opcional)' : 'Motivo (opcional)'}</label>
                    <textarea
                        className="form-input"
                        rows={2}
                        value={nota}
                        onChange={e => setNota(e.target.value)}
                        style={{ resize: 'vertical', minHeight: 60 }}
                    />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button type="button" className="btn btn-secondary" onClick={onCancelar}>Volver</button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!puedeConfirmar}
                        style={esTaller ? undefined : { background: '#DC2626', borderColor: '#DC2626' }}
                        onClick={() => onConfirmar(accion.id, accion.estado, {
                            ...(esTaller ? { id_taller: idTaller } : {}),
                            nota: nota.trim() || null,
                        })}
                    >
                        {esTaller ? 'Enviar' : 'Cancelar orden'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function FormSection({ icon, label }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 10.5, fontWeight: 700,
            color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em',
            marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9',
        }}>
            {icon} {label}
        </div>
    );
}

function DrawerSection({ label, children }) {
    return (
        <div style={{ marginBottom: 20 }}>
            <p style={{
                fontSize: 10, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #f1f5f9',
            }}>
                {label}
            </p>
            {children}
        </div>
    );
}

function DrawerRow({ label, value, highlight }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '5px 0' }}>
            <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 80 }}>{label}</span>
            <span style={{
                fontSize: 12, fontWeight: 600,
                color: highlight ? '#DC2626' : '#1D1136',
                textAlign: 'right', maxWidth: 230,
            }}>
                {value}
            </span>
        </div>
    );
}
import { useState, useEffect } from 'react';
import { getProductos, getMovimientos, createAjuste, getAlmacenes, createAlmacen, updateAlmacen, transferirStock, updateConfig } from '../services/api';
import { formatCurrency, formatDateTime, downloadExcel } from '../utils/helpers';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { Warehouse, Search, ArrowUpDown, X, Download, FileSpreadsheet, ArrowUp, ArrowDown, RotateCcw, ArrowLeftRight, Building2, Plus, Edit3, CheckCircle2, Building } from 'lucide-react';

export default function Inventario() {
    const toast = useToast();
    const [productos, setProductos] = useState([]);
    const [movimientos, setMovimientos] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [tab, setTab] = useState('stock');
    const [search, setSearch] = useState('');
    const [searchMov, setSearchMov] = useState('');
    const [showAjuste, setShowAjuste] = useState(null);
    const [ajusteForm, setAjusteForm] = useState({ cantidad: '', tipo: 'ENTRADA', motivo: '', id_almacen: '' });
    const [showTransferencia, setShowTransferencia] = useState(null);
    const [transferForm, setTransferForm] = useState({ id_almacen_origen: '', id_almacen_destino: '', cantidad: '', motivo: '' });
    const [showStockDetalle, setShowStockDetalle] = useState(null);
    const [loading, setLoading] = useState(false);
    const [filterStock, setFilterStock] = useState('todos');
    const confirmar = useConfirm();
    const [fechaDesde, setFechaDesde] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);
    const [visibleMov, setVisibleMov] = useState(25);
    const [pageStock, setPageStock] = useState(1);
    const [filterAlmacenMov, setFilterAlmacenMov] = useState('');
    const [showModalAlmacen, setShowModalAlmacen] = useState(false);
    const [editingAlmacen, setEditingAlmacen] = useState(null);
    const [almacenForm, setAlmacenForm] = useState({ nombre: '', descripcion: '', estado: 1 });
    const [savingAlmacen, setSavingAlmacen] = useState(false);

    useEffect(() => {
        Promise.all([
            getProductos({ estado: 'true' }),
            getMovimientos({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta, id_almacen: filterAlmacenMov || undefined }),
            getAlmacenes()
        ])
            .then(([p, m, alms]) => { setProductos(p); setMovimientos(m); setAlmacenes(alms); })
            .finally(() => setLoading(false));
    }, []);

    const reloadData = () => {
        getProductos({ estado: 'true' }).then(setProductos);
        getMovimientos({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta, id_almacen: filterAlmacenMov || undefined }).then(setMovimientos);
        getAlmacenes().then(setAlmacenes);
    };

    const handleFechaChange = (desde, hasta) => {
        setFechaDesde(desde);
        setFechaHasta(hasta);
        setVisibleMov(25);
        getMovimientos({ fecha_desde: desde, fecha_hasta: hasta, id_almacen: filterAlmacenMov || undefined }).then(setMovimientos);
    };

    const handleAlmacenMovChange = (idAlm) => {
        setFilterAlmacenMov(idAlm);
        getMovimientos({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta, id_almacen: idAlm || undefined }).then(setMovimientos);
    };

    const valorTotal = productos.reduce((s, p) => s + (p.stock_actual * p.precio_compra), 0);
    const stockCritico = productos.filter(p => p.stock_actual === 0);
    const stockBajo = productos.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo);
    const stockNormal = productos.filter(p => p.stock_actual > p.stock_minimo);

    const filtered = productos.filter(p => {
        const matchSearch = p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
        const matchStock = filterStock === 'todos' ? true : filterStock === 'critico' ? p.stock_actual === 0 : filterStock === 'bajo' ? p.stock_actual > 0 && p.stock_actual <= p.stock_minimo : p.stock_actual > p.stock_minimo;
        return matchSearch && matchStock;
    });

    const filteredMov = movimientos.filter(m =>
        m.nombre_producto.toLowerCase().includes(searchMov.toLowerCase()) ||
        (m.referencia || '').toLowerCase().includes(searchMov.toLowerCase())
    );

    const totalPagesStock = Math.ceil(filtered.length / 25);
    const pagedStock = filtered.slice((pageStock - 1) * 25, pageStock * 25);

    const handleAjuste = async (e) => {
        e.preventDefault();
        if (!ajusteForm.id_almacen) {
            toast('Selecciona el almacén para el ajuste', 'warning');
            return;
        }

        const LIMITE_MAXIMO_AJUSTE = 100000;
        const cantidadNum = Number(ajusteForm.cantidad);

        if (cantidadNum > LIMITE_MAXIMO_AJUSTE) {
            toast(`La cantidad no puede superar ${LIMITE_MAXIMO_AJUSTE.toLocaleString('es-PE')} unidades`, 'error');
            return;
        }

        const umbralAviso = (showAjuste.stock_actual > 0 ? showAjuste.stock_actual : showAjuste.stock_minimo) * 3;
        if (cantidadNum > umbralAviso) {
            const confirmado = await confirmar(
                `Vas a ingresar ${cantidadNum} unidades, pero el stock actual es ${showAjuste.stock_actual}.`,
                { titulo: 'Confirmar ajuste de stock', textoConfirmar: 'Sí, ajustar', peligro: false }
            );
            if (!confirmado) return;
        }

        try {
            await createAjuste({
                id_producto: showAjuste.id_producto,
                cantidad: cantidadNum,
                id_almacen: ajusteForm.id_almacen,
                tipo: ajusteForm.tipo,
                motivo: ajusteForm.motivo
            });
            toast('Ajuste de inventario registrado');
            setShowAjuste(null);
            setAjusteForm({ cantidad: '', tipo: 'ENTRADA', motivo: '', id_almacen: '' });
            reloadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error en el ajuste', 'error');
        }
    };

    const getStockEnAlmacen = (producto, almacenId) => {
        if (!producto || !almacenId) return 0;
        if (Array.isArray(producto.stock_por_almacen)) {
            const entry = producto.stock_por_almacen.find(s => s.id_almacen === almacenId);
            if (entry) return Number(entry.stock_actual || 0);
        }
        const alm = almacenes.find(a => a.id_almacen === almacenId);
        if (!alm) return 0;
        return alm.es_principal ? Number(producto.stock_tienda ?? 0) : Number(producto.stock_deposito ?? 0);
    };

    const openTransferModal = (p) => {
        setShowTransferencia(p);
        const deposito = almacenes.find(a => a.es_deposito) || almacenes.find(a => !a.es_principal) || almacenes[1] || almacenes[0];
        const tienda = almacenes.find(a => a.es_principal) || almacenes[0];
        setTransferForm({
            id_almacen_origen: deposito ? deposito.id_almacen : '',
            id_almacen_destino: tienda ? tienda.id_almacen : '',
            cantidad: '',
            motivo: ''
        });
    };

    const handleTransferencia = async (e) => {
        e.preventDefault();
        if (!transferForm.id_almacen_origen || !transferForm.id_almacen_destino) {
            toast('Selecciona los almacenes de origen y destino', 'warning');
            return;
        }
        if (transferForm.id_almacen_origen === transferForm.id_almacen_destino) {
            toast('Los almacenes deben ser distintos', 'warning');
            return;
        }
        try {
            await transferirStock({
                id_producto: showTransferencia.id_producto,
                desde_almacen: transferForm.id_almacen_origen,
                hacia_almacen: transferForm.id_almacen_destino,
                cantidad: Number(transferForm.cantidad),
                motivo: transferForm.motivo
            });
            toast('Transferencia registrada');
            setShowTransferencia(null);
            setTransferForm({ id_almacen_origen: '', id_almacen_destino: '', cantidad: '', motivo: '' });
            reloadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error en la transferencia', 'error');
        }
    };

    const openCreateAlmacen = () => {
        setEditingAlmacen(null);
        setAlmacenForm({ nombre: '', descripcion: '', estado: 1 });
        setShowModalAlmacen(true);
    };

    const openEditAlmacen = (a) => {
        setEditingAlmacen(a);
        setAlmacenForm({ nombre: a.nombre, descripcion: a.descripcion || '', estado: a.estado ? 1 : 0 });
        setShowModalAlmacen(true);
    };

    const handleSaveAlmacen = async (e) => {
        e.preventDefault();
        if (!almacenForm.nombre.trim()) {
            toast('El nombre es obligatorio', 'warning');
            return;
        }
        setSavingAlmacen(true);
        try {
            if (editingAlmacen) {
                await updateAlmacen(editingAlmacen.id_almacen, almacenForm);
                toast('Almacén actualizado correctamente');
            } else {
                await createAlmacen(almacenForm);
                toast('Almacén creado correctamente');
            }
            setShowModalAlmacen(false);
            reloadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al guardar almacén', 'error');
        } finally {
            setSavingAlmacen(false);
        }
    };

    const handleSetDefaultDeposito = async (almacenId) => {
        try {
            await updateConfig({ almacen_deposito_id: almacenId });
            toast('Depósito por defecto de compras actualizado');
            reloadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al actualizar configuración', 'error');
        }
    };

    const nuevoStock = showAjuste ? (ajusteForm.tipo === 'ENTRADA' ? showAjuste.stock_actual + Number(ajusteForm.cantidad || 0) : showAjuste.stock_actual - Number(ajusteForm.cantidad || 0)) : 0;

    return (
        <div className="page-enter">

            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 }}>Inventario</h1>
                    <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>Control de stock y movimientos en tiempo real</p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadExcel(
                    productos,
                    'inventario',
                    'inventario',
                    toast,
                    [
                        { header: 'SKU',              value: p => p.sku },
                        { header: 'Nombre',           value: p => p.nombre },
                        { header: 'Categoría',        value: p => p.categoria },
                        { header: 'Unidad',           value: p => p.unidad_medida },
                        { header: 'Stock Actual',     value: p => Number(p.stock_actual) },
                        { header: 'Stock Mínimo',     value: p => Number(p.stock_minimo) },
                        { header: 'Estado Stock',     value: p => p.stock_actual === 0 ? 'Sin Stock' : p.stock_actual <= p.stock_minimo ? 'Stock Bajo' : 'Normal' },
                        { header: 'P. Compra (S/)',   value: p => Number(p.precio_compra) },
                        { header: 'Valor en Stock',   value: p => Number((p.stock_actual * p.precio_compra).toFixed(2)) },
                    ]
                )}>
                    <FileSpreadsheet size={16} /> Exportar Excel
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Valor del Inventario', valor: formatCurrency(valorTotal), icon: '💰', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', sub: 'a precio de compra' },
                    { label: 'Productos en Stock', valor: stockNormal.length, icon: '✅', color: '#7c3aed', bg: '#f5f3ff', border: '#e9d5ff', sub: `de ${productos.length} totales` },
                    { label: 'Stock Bajo', valor: stockBajo.length, icon: '⚠️', color: '#d97706', bg: '#fffbeb', border: '#fde68a', sub: 'requieren reposicion' },
                    { label: 'Sin Stock', valor: stockCritico.length, icon: '🚫', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', sub: 'productos agotados' },
                ].map((k, i) => (
                    <div key={i} onClick={() => { if (i === 2) setFilterStock('bajo'); if (i === 3) setFilterStock('critico'); setTab('stock'); }}
                        style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 12, padding: '14px 16px', cursor: i > 1 ? 'pointer' : 'default', transition: 'transform 0.15s' }}
                        onMouseEnter={e => { if (i > 1) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{k.label}</p>
                                <p style={{ fontSize: 24, fontWeight: 800, color: k.color, margin: '4px 0 2px' }}>{k.valor}</p>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{k.sub}</p>
                            </div>
                            <span style={{ fontSize: 28 }}>{k.icon}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[
                    { key: 'stock', label: 'Vista de Stock', icon: <Warehouse size={15} /> },
                    { key: 'movimientos', label: 'Movimientos', icon: <ArrowUpDown size={15} />, badge: movimientos.length },
                    { key: 'almacenes', label: 'Gestión de Almacenes', icon: <Building2 size={15} />, badge: almacenes.length },
                ].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid', borderColor: tab === t.key ? '#7c3aed' : '#e2e8f0', background: tab === t.key ? '#7c3aed' : 'white', color: tab === t.key ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                        {t.icon} {t.label}
                        {t.badge !== undefined && <span style={{ background: tab === t.key ? 'rgba(255,255,255,0.25)' : '#f1f5f9', color: tab === t.key ? 'white' : '#64748b', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{t.badge}</span>}
                    </button>
                ))}
            </div>

            {/* Tab Stock */}
            {tab === 'stock' && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Barra busqueda y filtros */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
                            <Search size={15} className="search-icon" />
                            <input className="form-input" placeholder="Buscar producto..." value={search} onChange={e => { setSearch(e.target.value); setPageStock(1); }} />                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {[
                                { key: 'todos', label: 'Todos' },
                                { key: 'normal', label: 'Normal', color: '#15803d', bg: '#f0fdf4' },
                                { key: 'bajo', label: 'Stock Bajo', color: '#d97706', bg: '#fffbeb' },
                                { key: 'critico', label: 'Sin Stock', color: '#dc2626', bg: '#fef2f2' },
                            ].map(f => (
                                <button key={f.key} onClick={() => { setFilterStock(f.key); setPageStock(1); }} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid', borderColor: filterStock === f.key ? (f.color || '#7c3aed') : '#e2e8f0', background: filterStock === f.key ? (f.bg || '#f5f3ff') : 'white', color: filterStock === f.key ? (f.color || '#7c3aed') : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ margin: 0 }}>
                            <thead>
                                <tr>
                                    <th>SKU</th>
                                    <th>Producto</th>
                                    <th>Categoria</th>
                                    <th style={{ textAlign: 'center' }}>Stock Actual</th>
                                    <th style={{ textAlign: 'center' }}>Stock Min.</th>
                                    <th style={{ textAlign: 'center' }}>Estado</th>
                                    <th style={{ textAlign: 'right' }}>Valor Stock</th>
                                    <th style={{ textAlign: 'center' }}>Acciones</th>
                                </tr>
                            </thead>
                            
                            <tbody>
                                {loading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <tr key={i}>
                                            {Array.from({ length: 8 }).map((_, j) => (
                                                <td key={j}>
                                                    <div style={{
                                                        height: 14,
                                                        borderRadius: 6,
                                                        background: 'linear-gradient(90deg, #f1f5f9 25%, #e8edf2 50%, #f1f5f9 75%)',
                                                        backgroundSize: '200% 100%',
                                                        animation: 'shimmer 1.4s infinite',
                                                        width: j === 1 ? '80%' : j === 7 ? '60%' : '70%',
                                                        margin: '0 auto'
                                                    }} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : (
                                    <>
                                        {pagedStock.map(p => {
                                            const status = p.stock_actual === 0 ? 'critico' : p.stock_actual <= p.stock_minimo ? 'bajo' : 'normal';
                                            const sc = {
                                                critico: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'Sin Stock', rowBg: '#fff5f5' },
                                                bajo: { bg: '#fffbeb', color: '#d97706', border: '#fde68a', label: 'Stock Bajo', rowBg: '#fffdf0' },
                                                normal: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', label: 'Normal', rowBg: 'white' }
                                            }[status];
                                            return (
                                                <tr key={p.id_producto} style={{ background: sc.rowBg }}>
                                                    <td>
                                                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '2px 6px', borderRadius: 4 }}>
                                                            {p.sku}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 }}>{p.nombre}</p>
                                                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{p.unidad_medida}</p>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontSize: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', color: '#475569' }}>
                                                            {p.categoria}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ fontSize: 16, fontWeight: 800, color: sc.color }}>{p.stock_actual}</span>
                                                            {(p.stock_por_almacen || []).length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowStockDetalle(p)}
                                                                    title="Ver stock por almacén"
                                                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', color: '#64748b', cursor: 'pointer', flexShrink: 0 }}
                                                                >
                                                                    <Search size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
                                                        {p.stock_minimo}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                                                            {sc.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                                                        {formatCurrency(p.stock_actual * p.precio_compra)}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <div style={{ display: 'inline-flex', gap: 6 }}>
                                                            <button onClick={() => {
                                                                setShowAjuste(p);
                                                                const tiendaDef = almacenes.find(a => a.es_principal) || almacenes[0];
                                                                setAjusteForm({ cantidad: '', tipo: 'ENTRADA', motivo: '', id_almacen: tiendaDef ? tiendaDef.id_almacen : '' });
                                                            }}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>
                                                                <ArrowUpDown size={13} /> Ajustar
                                                            </button>
                                                            <button onClick={() => openTransferModal(p)}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>
                                                                <ArrowLeftRight size={13} /> Transferir
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filtered.length === 0 && (
                                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>No se encontraron productos</td></tr>
                                        )}
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Paginación Stock */}
                    {!loading && filtered.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid #f1f5f9' }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                {filtered.length} productos · Página {pageStock} de {totalPagesStock}
                            </span>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => setPageStock(p => Math.max(1, p - 1))} disabled={pageStock === 1}
                                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: pageStock === 1 ? '#f8fafc' : 'white', color: pageStock === 1 ? '#cbd5e1' : '#475569', fontSize: 12, fontWeight: 600, cursor: pageStock === 1 ? 'default' : 'pointer' }}>
                                    ← Anterior
                                </button>
                                <button onClick={() => setPageStock(p => Math.min(totalPagesStock, p + 1))} disabled={pageStock === totalPagesStock}
                                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: pageStock === totalPagesStock ? '#f8fafc' : 'white', color: pageStock === totalPagesStock ? '#cbd5e1' : '#475569', fontSize: 12, fontWeight: 600, cursor: pageStock === totalPagesStock ? 'default' : 'pointer' }}>
                                    Siguiente →
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            )}

            {/* Tab Movimientos */}
            {tab === 'movimientos' && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
                            <Search size={15} className="search-icon" />
                            <input className="form-input" placeholder="Buscar por producto o referencia..." value={searchMov} onChange={e => { setSearchMov(e.target.value); setVisibleMov(25); }} />
                        </div>
                        <select
                            className="form-select"
                            value={filterAlmacenMov}
                            onChange={e => handleAlmacenMovChange(e.target.value)}
                            style={{ minWidth: 160, fontSize: 13, background: 'white' }}
                        >
                            <option value="">Todos los Almacenes</option>
                            {almacenes.map(a => (
                                <option key={a.id_almacen} value={a.id_almacen}>
                                    {a.nombre} {a.es_principal ? '(Tienda)' : ''}
                                </option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>DESDE</span>
                                <input type="date" value={fechaDesde} onChange={e => handleFechaChange(e.target.value, fechaHasta)}
                                    style={{ border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer', outline: 'none' }} />
                            </div>
                            <span style={{ color: '#cbd5e1', fontWeight: 700 }}>—</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>HASTA</span>
                                <input type="date" value={fechaHasta} onChange={e => handleFechaChange(fechaDesde, e.target.value)}
                                    style={{ border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer', outline: 'none' }} />
                            </div>
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ margin: 0 }}>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Producto</th>
                                    <th>Almacén</th>
                                    <th style={{ textAlign: 'center' }}>Tipo</th>
                                    <th style={{ textAlign: 'center' }}>Cantidad</th>
                                    <th style={{ textAlign: 'center' }}>Antes</th>
                                    <th style={{ textAlign: 'center' }}>Despues</th>
                                    <th>Referencia</th>
                                    <th>Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredMov.slice(0, visibleMov).map(m => {
                                    const esEntrada = m.tipo_movimiento === 'ENTRADA';
                                    const esSalida = m.tipo_movimiento === 'SALIDA';
                                    return (
                                        <tr key={m.id_movimiento}>
                                            <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{formatDateTime(m.fecha_hora)}</td>
                                            <td>
                                                <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 }}>{m.nombre_producto}</p>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{m.nombre_almacen || 'Tienda'}</span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: esEntrada ? '#f0fdf4' : esSalida ? '#fef2f2' : '#fffbeb', color: esEntrada ? '#15803d' : esSalida ? '#dc2626' : '#d97706', border: `1px solid ${esEntrada ? '#bbf7d0' : esSalida ? '#fecaca' : '#fde68a'}` }}>
                                                    {esEntrada ? <ArrowUp size={11} /> : esSalida ? <ArrowDown size={11} /> : <RotateCcw size={11} />}
                                                    {m.tipo_movimiento}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: esEntrada ? '#15803d' : '#dc2626' }}>
                                                {esEntrada ? '+' : '-'}{m.cantidad}
                                            </td>
                                            <td style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{m.stock_anterior}</td>
                                            <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{m.stock_nuevo}</td>
                                            <td style={{ fontSize: 12, fontFamily: 'monospace', color: '#7c3aed', fontWeight: 600 }}>{m.referencia || '-'}</td>
                                            <td style={{ fontSize: 12, color: '#64748b' }}>{m.motivo || '-'}</td>
                                        </tr>
                                    );
                                })}
                                {filteredMov.length === 0 && (
                                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>No hay movimientos registrados</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Ver más / resumen */}
                    <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            Mostrando <strong style={{ color: '#475569' }}>{Math.min(visibleMov, filteredMov.length)}</strong> de <strong style={{ color: '#475569' }}>{filteredMov.length}</strong> movimientos
                        </span>
                        {visibleMov < filteredMov.length && (
                            <button onClick={() => setVisibleMov(v => v + 25)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#7c3aed', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                Ver 25 más ↓
                            </button>
                        )}
                        {visibleMov >= filteredMov.length && filteredMov.length > 0 && (
                            <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                                ✓ Todos los movimientos del período
                            </span>
                        )}
                    </div>

                </div>
            )}

            {/* Tab Gestión de Almacenes */}
            {tab === 'almacenes' && (
                <div className="card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>Almacenes del Sistema</h3>
                            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
                                Gestione las ubicaciones físicas de stock y configure el Depósito por defecto de compras.
                            </p>
                        </div>
                        <button className="btn btn-primary" onClick={openCreateAlmacen} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Plus size={16} /> Nuevo Almacén
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                        {almacenes.map(a => (
                            <div key={a.id_almacen} style={{ background: '#f8fafc', border: `1px solid ${a.es_principal ? '#c084fc' : a.es_deposito ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 12, padding: 18, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                                        <h4 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Building size={16} style={{ color: a.es_principal ? '#7c3aed' : '#2563eb' }} />
                                            {a.nombre}
                                        </h4>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                            {a.es_principal && (
                                                <span style={{ fontSize: 10, fontWeight: 700, background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', padding: '2px 6px', borderRadius: 6 }}>
                                                    Tienda (Ventas)
                                                </span>
                                            )}
                                            {a.es_deposito && (
                                                <span style={{ fontSize: 10, fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '2px 6px', borderRadius: 6 }}>
                                                    Depósito (Compras)
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {a.descripcion && (
                                        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>{a.descripcion}</p>
                                    )}

                                    <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                                        <div>
                                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Stock Total</span>
                                            <p style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '2px 0 0' }}>{a.stock_total || 0}</p>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Productos</span>
                                            <p style={{ fontSize: 16, fontWeight: 800, color: '#7c3aed', margin: '2px 0 0' }}>{a.productos_con_stock || 0}</p>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 4, flexWrap: 'wrap' }}>
                                    {!a.es_principal && (
                                        <button onClick={() => openEditAlmacen(a)} style={{ flex: 1, padding: '6px 10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                            <Edit3 size={13} /> Editar
                                        </button>
                                    )}
                                    {!a.es_deposito && (
                                        <button onClick={() => handleSetDefaultDeposito(a.id_almacen)} style={{ flex: 1.2, padding: '6px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#15803d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                            <CheckCircle2 size={13} /> Usar para compras
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal Ajuste */}

            {/* Modal Ajuste */}
            {showAjuste && (
                <div className="modal-overlay" onClick={() => setShowAjuste(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header" style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: 16, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>Ajuste de Inventario</h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{showAjuste.nombre}</p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowAjuste(null)}><X size={18} /></button>
                        </div>

                        {/* Stock actual */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 4px', fontWeight: 600 }}>STOCK ACTUAL</p>
                                <p style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 }}>{showAjuste.stock_actual}</p>
                            </div>
                            <div style={{ background: ajusteForm.cantidad ? (nuevoStock < 0 ? '#fef2f2' : '#f0fdf4') : '#f8fafc', borderRadius: 8, padding: '10px 14px', textAlign: 'center', border: ajusteForm.cantidad ? `1px solid ${nuevoStock < 0 ? '#fecaca' : '#bbf7d0'}` : 'none' }}>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 4px', fontWeight: 600 }}>STOCK NUEVO</p>
                                <p style={{ fontSize: 24, fontWeight: 800, color: nuevoStock < 0 ? '#dc2626' : '#15803d', margin: 0 }}>{ajusteForm.cantidad ? nuevoStock : '—'}</p>
                            </div>
                        </div>

                        <form onSubmit={handleAjuste} className="space-y-4">
                            <div>
                                <label className="form-label">Almacén *</label>
                                <select className="form-input" required value={ajusteForm.id_almacen} onChange={e => setAjusteForm({ ...ajusteForm, id_almacen: e.target.value })}>
                                    {almacenes.map(a => (
                                        <option key={a.id_almacen} value={a.id_almacen}>{a.nombre} {a.es_principal ? '(Tienda)' : ''}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">Tipo de Ajuste</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    {[
                                        { val: 'ENTRADA', label: '+ Entrada de Stock', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', icon: <ArrowUp size={15} /> },
                                        { val: 'SALIDA', label: '- Salida de Stock', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: <ArrowDown size={15} /> },
                                    ].map(t => (
                                        <button key={t.val} type="button" onClick={() => setAjusteForm({ ...ajusteForm, tipo: t.val })}
                                            style={{ padding: '10px', borderRadius: 8, border: `2px solid ${ajusteForm.tipo === t.val ? t.color : '#e2e8f0'}`, background: ajusteForm.tipo === t.val ? t.bg : 'white', color: ajusteForm.tipo === t.val ? t.color : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                            {t.icon} {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="form-label">Cantidad</label>
                                <input className="form-input" type="number" min="1" required value={ajusteForm.cantidad} onChange={e => setAjusteForm({ ...ajusteForm, cantidad: e.target.value })} placeholder="0" style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
                                {nuevoStock < 0 && ajusteForm.cantidad && (
                                    <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 4 }}>La cantidad supera el stock disponible</p>
                                )}
                            </div>
                            <div>
                                <label className="form-label">Motivo (obligatorio)</label>
                                <input className="form-input" required value={ajusteForm.motivo} onChange={e => setAjusteForm({ ...ajusteForm, motivo: e.target.value })} placeholder="Ej: Inventario fisico, merma, error de registro..." />
                            </div>
                            <button type="submit" disabled={nuevoStock < 0 && ajusteForm.tipo === 'SALIDA'} className="btn btn-primary w-full justify-center" style={{ padding: '12px', fontSize: 15, fontWeight: 700 }}>
                                Confirmar Ajuste
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Transferencia */}
            {showTransferencia && (
                <div className="modal-overlay" onClick={() => setShowTransferencia(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header" style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: 16, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>Transferir Stock</h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{showTransferencia.nombre}</p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowTransferencia(null)}><X size={18} /></button>
                        </div>

                        <form onSubmit={handleTransferencia} className="space-y-4">
                            <div>
                                <label className="form-label">Desde (origen) *</label>
                                <select className="form-input" required value={transferForm.id_almacen_origen} onChange={e => setTransferForm({ ...transferForm, id_almacen_origen: e.target.value })}>
                                    {almacenes.map(a => (
                                        <option key={a.id_almacen} value={a.id_almacen}>
                                            {a.nombre} {a.es_principal ? '(Tienda)' : ''} — Disponible: {getStockEnAlmacen(showTransferencia, a.id_almacen)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">Hacia (destino) *</label>
                                <select className="form-input" required value={transferForm.id_almacen_destino} onChange={e => setTransferForm({ ...transferForm, id_almacen_destino: e.target.value })}>
                                    {almacenes.map(a => (
                                        <option key={a.id_almacen} value={a.id_almacen}>{a.nombre} {a.es_principal ? '(Tienda)' : ''}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">Cantidad</label>
                                <input className="form-input" type="number" min="1" required value={transferForm.cantidad} onChange={e => setTransferForm({ ...transferForm, cantidad: e.target.value })} placeholder="0" style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
                                {transferForm.cantidad && Number(transferForm.cantidad) > getStockEnAlmacen(showTransferencia, transferForm.id_almacen_origen) && (
                                    <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 4 }}>La cantidad supera el stock disponible en el almacén de origen</p>
                                )}
                            </div>
                            <div>
                                <label className="form-label">Motivo (opcional)</label>
                                <input className="form-input" value={transferForm.motivo} onChange={e => setTransferForm({ ...transferForm, motivo: e.target.value })} placeholder="Ej: Reposicion de tienda..." />
                            </div>
                            <button type="submit"
                                disabled={transferForm.id_almacen_origen === transferForm.id_almacen_destino || (transferForm.cantidad && Number(transferForm.cantidad) > getStockEnAlmacen(showTransferencia, transferForm.id_almacen_origen))}
                                className="btn btn-primary w-full justify-center" style={{ padding: '12px', fontSize: 15, fontWeight: 700 }}>
                                Confirmar Transferencia
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Detalle de Stock por Almacén */}
            {showStockDetalle && (
                <div className="modal-overlay" onClick={() => setShowStockDetalle(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                        <div className="modal-header" style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: 16, marginBottom: 16 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>Stock por Almacén</h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{showStockDetalle.nombre}</p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowStockDetalle(null)}><X size={18} /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(showStockDetalle.stock_por_almacen || []).map(sa => (
                                <div key={sa.id_almacen} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>{sa.nombre}</span>
                                    <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{sa.stock_actual}</span>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', marginTop: 12, borderTop: '2px solid #f1f5f9', paddingTop: 14 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Total</span>
                            <span style={{ fontSize: 18, fontWeight: 800, color: '#7c3aed' }}>{showStockDetalle.stock_actual}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Crear/Editar Almacén */}
            {showModalAlmacen && (
                <div className="modal-overlay" onClick={() => !savingAlmacen && setShowModalAlmacen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header" style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: 16, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                                    {editingAlmacen ? 'Editar Almacén' : 'Nuevo Almacén'}
                                </h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>
                                    {editingAlmacen ? `Modificando: ${editingAlmacen.nombre}` : 'Ingrese los datos del nuevo almacén'}
                                </p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowModalAlmacen(false)} disabled={savingAlmacen}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSaveAlmacen} className="space-y-4">
                            <div>
                                <label className="form-label">Nombre del Almacén *</label>
                                <input className="form-input" required value={almacenForm.nombre} onChange={e => setAlmacenForm({ ...almacenForm, nombre: e.target.value })} placeholder="Ej: Depósito Central, Almacén San Isidro..." />
                            </div>
                            <div>
                                <label className="form-label">Descripción</label>
                                <input className="form-input" value={almacenForm.descripcion} onChange={e => setAlmacenForm({ ...almacenForm, descripcion: e.target.value })} placeholder="Ubicación o notas adicionales..." />
                            </div>
                            {editingAlmacen && (
                                <div>
                                    <label className="form-label">Estado</label>
                                    <select className="form-select" value={almacenForm.estado} onChange={e => setAlmacenForm({ ...almacenForm, estado: Number(e.target.value) })}>
                                        <option value={1}>Activo</option>
                                        <option value={0}>Inactivo</option>
                                    </select>
                                </div>
                            )}
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModalAlmacen(false)} disabled={savingAlmacen}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={savingAlmacen}>{savingAlmacen ? 'Guardando...' : 'Guardar Almacén'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
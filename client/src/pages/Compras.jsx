import React, { useState, useEffect, useRef } from 'react';
import { getCompras, getProductos, createCompra, getCompra, anularCompra, editarCompra, getAlmacenes } from '../services/api';
import { formatCurrency, formatDateTime } from '../utils/helpers';
import { useToast } from '../components/Toast';
import logger from '../utils/logger';
import { Plus, Search, X, Trash2, Download, FileSpreadsheet, ChevronDown, ChevronUp, Package, Calendar, Ban, Pencil } from 'lucide-react';

export default function Compras() {
    const toast = useToast();
    const [compras, setCompras] = useState([]);
    const [productos, setProductos] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState('');
    const [expandida, setExpandida] = useState(null);
    const [detallesCache, setDetallesCache] = useState({});
    const [loadingDetalle, setLoadingDetalle] = useState(null);
    const [form, setForm] = useState({ proveedor: '', ruc_proveedor: '', doc_proveedor: '', notas: '', id_almacen: '' });
    const [items, setItems] = useState([]);
    const [searchProd, setSearchProd] = useState('');
    const [showDataMenu, setShowDataMenu] = useState(false);
    const [exportando, setExportando] = useState(false);
    const [filtroDesde, setFiltroDesde] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [filtroHasta, setFiltroHasta] = useState(() => new Date().toISOString().split('T')[0]);
    const [showFiltroExport, setShowFiltroExport] = useState(false);
    const dataMenuRef = useRef(null);
    const [pagina, setPagina] = useState(1);
    const POR_PAGINA = 30;
    const [modalAnular, setModalAnular] = useState(null);
    const [motivoAnular, setMotivoAnular] = useState('');
    const [anulando, setAnulando] = useState(false);
    const usuarioActual = JSON.parse(localStorage.getItem('usuario') || '{}');
    const esAdmin = usuarioActual.rol === 'ADMIN';
    const [compraEditando, setCompraEditando] = useState(null);
    const esHoy = (fecha_hora) => fecha_hora.slice(0, 10) === new Date().toISOString().slice(0, 10);
    
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dataMenuRef.current && !dataMenuRef.current.contains(e.target)) {
                setShowDataMenu(false);
                setShowFiltroExport(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        Promise.all([getCompras(), getProductos(), getAlmacenes()])
            .then(([c, p, alms]) => {
                setCompras(c);
                setProductos(p);
                setAlmacenes(alms);
                const deposito = alms.find(a => a.es_deposito) || alms.find(a => !a.es_principal) || alms[0];
                if (deposito) {
                    setForm(prev => ({ ...prev, id_almacen: prev.id_almacen || deposito.id_almacen }));
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const toggleDetalle = async (id) => {
        if (expandida === id) { setExpandida(null); return; }
        setExpandida(id);
        if (detallesCache[id]) return;
        setLoadingDetalle(id);
        try {
            const data = await getCompra(id);
            setDetallesCache(prev => ({ ...prev, [id]: { detalles: data.detalles || [], notas: data.notas || '' } }));
        } catch {
            toast('Error al cargar el detalle', 'error');
        } finally {
            setLoadingDetalle(null);
        }
    };

    const confirmarAnular = async () => {
        if (!motivoAnular.trim()) {
            toast('El motivo es obligatorio', 'warning');
            return;
        }
        setAnulando(true);
        try {
            await anularCompra(modalAnular.id_compra, motivoAnular.trim());
            setCompras(prev => prev.map(c =>
                c.id_compra === modalAnular.id_compra
                    ? { ...c, estado: 'ANULADA', notas: `ANULADO: ${motivoAnular.trim()}` }
                    : c
            ));
            toast('Compra anulada correctamente', 'success');
            setModalAnular(null);
            setMotivoAnular('');
        } catch (e) {
            toast(e.response?.data?.error || 'Error al anular la compra', 'error');
        } finally {
            setAnulando(false);
        }
    };

    const filteredProds = productos.filter(p => p.estado && (
        p.nombre.toLowerCase().includes(searchProd.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchProd.toLowerCase())
    ));

    const filteredCompras = compras.filter(c =>
        c.proveedor.toLowerCase().includes(search.toLowerCase()) ||
        c.numero_oc.toLowerCase().includes(search.toLowerCase())
    );

    const totalPaginas = Math.ceil(filteredCompras.length / POR_PAGINA);
    const paginados = filteredCompras.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

    const addItem = (prod) => {
        if (items.find(i => i.id_producto === prod.id_producto)) {
            toast('Producto ya agregado', 'warning'); return;
        }
        setItems([...items, {
            id_producto: prod.id_producto,
            nombre: prod.nombre,
            sku: prod.sku,
            cantidad: 1,
            precio_unitario: '',
            precio_referencia: prod.precio_compra,
            actualizar_precio: false
        }]);
        setSearchProd('');
    };

    const abrirEdicion = async (c) => {
        try {
            const detalle = await getCompra(c.id_compra);
            setForm({ proveedor: detalle.proveedor, ruc_proveedor: detalle.ruc_proveedor || '', doc_proveedor: detalle.doc_proveedor || '', notas: detalle.notas || '' });
            setItems((detalle.detalles || []).map(d => ({
                id_producto: d.id_producto,
                nombre: d.nombre_producto,
                sku: d.sku,
                cantidad: d.cantidad,
                precio_unitario: d.precio_unitario,
                precio_referencia: d.precio_unitario,
                actualizar_precio: false
            })));
            setCompraEditando(c);
            setShowForm(true);
        } catch (err) {
            toast(err.response?.data?.error || 'Error al cargar la compra', 'error');
        }
    };

    const exportarComprasDetallado = async () => {
        setExportando(true);
        setShowDataMenu(false);
        setShowFiltroExport(false);
        toast('Preparando exportación...', 'success');
        try {
            const desde = new Date(filtroDesde);
            const hasta = new Date(filtroHasta);
            hasta.setHours(23, 59, 59);
            const comprasFiltradas = compras.filter(c => {
                const f = new Date(c.fecha_hora);
                return f >= desde && f <= hasta;
            });
            if (comprasFiltradas.length === 0) {
                toast('No hay compras en el periodo seleccionado', 'warning');
                setExportando(false);
                return;
            }
            const detallesTemp = { ...detallesCache };
            for (const compra of comprasFiltradas) {
                if (!detallesTemp[compra.id_compra]) {
                    try {
                        const data = await getCompra(compra.id_compra);
                        detallesTemp[compra.id_compra] = { detalles: data.detalles || [], notas: data.notas || '' };
                    } catch {
                        detallesTemp[compra.id_compra] = { detalles: [], notas: '' };
                    }
                }
            }
            setDetallesCache(detallesTemp);
            const resumen = comprasFiltradas.map(c => ({
                'N° Orden':      c.numero_oc,
                'Proveedor':     c.proveedor,
                'RUC Proveedor': c.ruc_proveedor || '',
                'Fecha':         formatDateTime(c.fecha_hora),
                'N° Productos':  (detallesTemp[c.id_compra]?.detalles || []).length,
                'Subtotal (S/)': Number((c.total / 1.18).toFixed(2)),
                'IGV (S/)':      Number((c.total - c.total / 1.18).toFixed(2)),
                'Total (S/)':    Number(c.total),
                'Estado':        c.estado,
                'Notas':         detallesTemp[c.id_compra]?.notas || '',
            }));
            const detallado = [];
            for (const c of comprasFiltradas) {
                const items = detallesTemp[c.id_compra]?.detalles || [];
                if (items.length === 0) {
                    detallado.push({
                        'N° Orden': c.numero_oc, 'Proveedor': c.proveedor,
                        'Fecha': formatDateTime(c.fecha_hora), 'SKU': '',
                        'Producto': '(sin detalle)', 'Cantidad': '',
                        'P. Unitario (S/)': '', 'Subtotal Línea (S/)': '',
                        'Total Orden (S/)': Number(c.total), 'Estado': c.estado,
                    });
                } else {
                    items.forEach(item => {
                        detallado.push({
                            'N° Orden':            c.numero_oc,
                            'Proveedor':           c.proveedor,
                            'Fecha':               formatDateTime(c.fecha_hora),
                            'SKU':                 item.sku || '',
                            'Producto':            item.nombre_producto || '',
                            'Cantidad':            Number(item.cantidad),
                            'P. Unitario (S/)':    Number(item.precio_unitario),
                            'Subtotal Línea (S/)': Number(item.subtotal_linea || (item.cantidad * item.precio_unitario)),
                            'Total Orden (S/)':    Number(c.total),
                            'Estado':              c.estado,
                        });
                    });
                }
            }
            const fecha = new Date().toLocaleDateString('es-PE').replace(/\//g, '-');
            const ExcelJS = (await import('exceljs')).default;
            const wb = new ExcelJS.Workbook();
            wb.creator = 'Sistema HUASCARAN';
            wb.created = new Date();
            const estiloEncabezado = (cell) => {
                cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF735DFF' } };
                cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border    = { bottom: { style: 'medium', color: { argb: 'FF5A45D6' } } };
            };
            const agregarHoja = (nombre, datos) => {
                const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
                if (!datos.length) return ws;
                const headers = Object.keys(datos[0]);
                ws.columns = headers.map(h => ({
                    header: h, key: h,
                    width: Math.min(Math.max(h.length + 4, ...datos.slice(0, 50).map(r => String(r[h] ?? '').length + 2)), 40)
                }));
                ws.getRow(1).height = 22;
                ws.getRow(1).eachCell(cell => estiloEncabezado(cell));
                datos.forEach((row, idx) => {
                    const fila = ws.addRow(row);
                    fila.height = 18;
                    fila.eachCell({ includeEmpty: true }, cell => {
                        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8F7FF' } };
                        cell.font      = { size: 10, name: 'Calibri', color: { argb: 'FF1E293B' } };
                        cell.alignment = { vertical: 'middle' };
                        cell.border    = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
                        if (typeof cell.value === 'number') {
                            cell.alignment = { vertical: 'middle', horizontal: 'right' };
                            if (!Number.isInteger(cell.value)) cell.numFmt = '#,##0.00';
                        }
                    });
                });
                return ws;
            };
            agregarHoja('Resumen de Órdenes', resumen);
            agregarHoja('Detalle por Producto', detallado);
            const buffer = await wb.xlsx.writeBuffer();
            const base64 = btoa(new Uint8Array(buffer).reduce((acc, byte) => acc + String.fromCharCode(byte), ''));
            if (window.electronAPI?.saveExcel) {
                const result = await window.electronAPI.saveExcel({
                    buffer: base64,
                    suggestedName: `compras_detallado_${fecha}.xlsx`
                });
                if (!result.canceled && result.ok) toast(`Excel exportado: ${comprasFiltradas.length} órdenes`, 'success');
                else if (!result.canceled) toast('Error al guardar el archivo', 'error');
            }
        } catch (err) {
            logger.error('COMPRAS', 'Error exportando compras:', err);
            toast('Error al exportar', 'error');
        } finally {
            setExportando(false);
        }
    };

    const subtotal = items.reduce((s, i) => s + (i.cantidad * Number(i.precio_unitario || 0)), 0);
    const igv = Math.round(subtotal * 0.18 * 100) / 100;
    const total = subtotal + igv;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (items.length === 0) { toast('Agrega al menos un producto', 'warning'); return; }
        const sinPrecio = items.find(i => !i.precio_unitario || Number(i.precio_unitario) <= 0);
        if (sinPrecio) { toast(`Ingrese el precio de: ${sinPrecio.nombre}`, 'warning'); return; }
        try {
            const payload = { ...form, items: items.map(i => ({ ...i, precio_unitario: Number(i.precio_unitario) })) };
            if (compraEditando) {
                await editarCompra(compraEditando.id_compra, payload);
                toast('Compra actualizada correctamente');
            } else {
                await createCompra(payload);
                toast('Compra registrada correctamente');
            }
            setShowForm(false);
            setCompraEditando(null);
            const depositoDefault = almacenes.find(a => a.nombre === 'Almacén') || almacenes.find(a => !a.es_principal) || almacenes[0];
            setForm({ proveedor: '', ruc_proveedor: '', doc_proveedor: '', notas: '', id_almacen: depositoDefault ? depositoDefault.id_almacen : '' });
            setItems([]);
            Promise.all([getCompras(), getProductos()]).then(([c, p]) => { setCompras(c); setProductos(p); });
        } catch (err) {
            toast(err.response?.data?.error || 'Error', 'error');
        }
    };

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dataMenuRef.current && !dataMenuRef.current.contains(e.target)) {
                setShowDataMenu(false);
                setShowFiltroExport(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // KPIs
    const totalMes = compras.filter(c => {
        const f = new Date(c.fecha_hora);
        const ahora = new Date();
        return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear() && c.estado === 'ACTIVA';
    }).reduce((s, c) => s + c.total, 0);
    const totalCompras = compras.filter(c => c.estado === 'ACTIVA').reduce((s, c) => s + c.total, 0);
    const proveedores = [...new Set(compras.map(c => c.proveedor))].length;

    return (
        <div className="page-enter">

            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 }}>Compras</h1>
                    <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>
                        Ordenes de compra a proveedores — {compras.length} registradas
                    </p>
                </div>
                <div className="flex gap-3">
    <div style={{ position: 'relative' }} ref={dataMenuRef}>
        <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setShowDataMenu(v => !v); setShowFiltroExport(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
            <FileSpreadsheet size={16} />
            Datos
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition: 'transform 0.2s', transform: showDataMenu ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        </button>

        {showDataMenu && (
            <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: 'white', border: '1px solid #e2e8f0',
                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                minWidth: 240, zIndex: 50, overflow: 'hidden'
            }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, padding: '10px 14px 6px' }}>
                    Gestión de datos
                </p>

                {/* Exportar con filtro de fechas */}
                {!showFiltroExport ? (
                    <button
                        onClick={() => setShowFiltroExport(true)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#334155', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8f7ff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <Download size={15} style={{ color: '#735DFF' }} />
                        Exportar Excel detallado
                    </button>
                ) : (
                    <div style={{ padding: '8px 14px 12px' }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', margin: '0 0 8px' }}>Selecciona el periodo:</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                            <div>
                                <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Desde</label>
                                <input
                                    type="date" value={filtroDesde}
                                    onChange={e => setFiltroDesde(e.target.value)}
                                    className="form-input"
                                    style={{ padding: '5px 8px', fontSize: 12, marginTop: 2 }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Hasta</label>
                                <input
                                    type="date" value={filtroHasta}
                                    onChange={e => setFiltroHasta(e.target.value)}
                                    className="form-input"
                                    style={{ padding: '5px 8px', fontSize: 12, marginTop: 2 }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                onClick={() => setShowFiltroExport(false)}
                                style={{ flex: 1, padding: '6px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: 'pointer', color: '#64748b' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={exportarComprasDetallado}
                                disabled={exportando}
                                style={{ flex: 2, padding: '6px', borderRadius: 6, border: 'none', background: '#735DFF', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                            >
                                <Calendar size={12} />
                                {exportando ? 'Exportando...' : 'Exportar'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )}
    </div>
    <button className="btn btn-primary" onClick={() => { setCompraEditando(null); setForm({ proveedor: '', ruc_proveedor: '', doc_proveedor: '', notas: '' }); setItems([]); setShowForm(true); }}>
        <Plus size={18} /> Nueva Compra
    </button>
</div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Compras del Mes', valor: formatCurrency(totalMes), icon: '📅', color: '#7c3aed', bg: '#f5f3ff', border: '#e9d5ff' },
                    { label: 'Total Invertido', valor: formatCurrency(totalCompras), icon: '💰', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                    { label: 'Ordenes Totales', valor: compras.length, icon: '📋', color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
                    { label: 'Proveedores', valor: proveedores, icon: '🏭', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                ].map((k, i) => (
                    <div key={i} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 28 }}>{k.icon}</span>
                        <div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', margin: 0 }}>{k.label}</p>
                            <p style={{ fontSize: 20, fontWeight: 800, color: k.color, margin: '2px 0 0' }}>{k.valor}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Busqueda */}
            <div className="card mb-4" style={{ padding: '12px 16px' }}>
                <div className="search-bar">
                    <Search size={15} className="search-icon" />
                    <input className="form-input" placeholder="Buscar por proveedor o N° de orden..." value={search} onChange={e => { setSearch(e.target.value); setPagina(1); }} />
                </div>
            </div>

            {/* Lista compras */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div className="loader"><div className="spinner"></div></div>
                ) : filteredCompras.length === 0 ? (
                    <div className="empty-state" style={{ padding: 48 }}>
                        <Package size={48} style={{ color: '#cbd5e1' }} />
                        <p style={{ color: '#94a3b8', marginTop: 12 }}>No hay compras registradas</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ margin: 0 }}>
                            <thead>
                                <tr>
                                    <th>N° Orden</th>
                                    <th>Fecha</th>
                                    <th>Proveedor</th>
                                    <th>Doc. Proveedor</th>
                                    <th style={{ textAlign: 'right' }}>Total</th>
                                    <th style={{ textAlign: 'center' }}>Estado</th>
                                    <th style={{ textAlign: 'center' }}>Detalle</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginados.map(c => (
                                    <React.Fragment key={c.id_compra}>
                                        <tr style={{ background: expandida === c.id_compra ? '#fafafa' : 'white' }}>
                                            <td>
                                                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '2px 6px', borderRadius: 4 }}>
                                                    {c.numero_oc}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{formatDateTime(c.fecha_hora)}</td>
                                            <td>
                                                <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 }}>{c.proveedor}</p>
                                                {c.ruc_proveedor && <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>RUC: {c.ruc_proveedor}</p>}
                                            </td>
                                            <td style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{c.doc_proveedor || '—'}</td>
                                            <td style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{formatCurrency(c.total)}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: c.estado === 'ACTIVA' ? '#f0fdf4' : '#fef2f2', color: c.estado === 'ACTIVA' ? '#15803d' : '#dc2626', border: `1px solid ${c.estado === 'ACTIVA' ? '#bbf7d0' : '#fecaca'}` }}
                                                    title={c.estado === 'ANULADA' ? c.notas : ''}>
                                                    {c.estado}
                                                </span>
                                                {c.estado === 'ACTIVA' && esAdmin && esHoy(c.fecha_hora) && (
                                                    <button
                                                        onClick={() => abrirEdicion(c)}
                                                        title="Editar compra"
                                                        style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#475569', verticalAlign: 'middle' }}
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                )}
                                                {c.estado === 'ACTIVA' && esAdmin && (
                                                    <button
                                                        onClick={() => setModalAnular(c)}
                                                        title="Anular compra"
                                                        style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', verticalAlign: 'middle' }}
                                                    >
                                                        <Ban size={14} />
                                                    </button>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    onClick={() => toggleDetalle(c.id_compra)}
                                                    style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                                                >
                                                    {expandida === c.id_compra ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    Ver
                                                </button>
                                            </td>
                                        </tr>
                                        {expandida === c.id_compra && (
                                            <tr key={`${c.id_compra}-detalle`}>
                                                <td colSpan={7} style={{ padding: 0, background: '#f8fafc' }}>
                                                    <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Detalle de productos</p>
                                                        {loadingDetalle === c.id_compra ? (
                                                            <p style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>Cargando detalle...</p>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                {(detallesCache[c.id_compra]?.detalles || []).map((item, i) => (
                                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                            {item.sku && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7c3aed', background: '#f5f3ff', padding: '1px 5px', borderRadius: 4 }}>{item.sku}</span>}
                                                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{item.nombre_producto}</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                                                            <span style={{ fontSize: 12, color: '#64748b' }}>x{item.cantidad}</span>
                                                                            <span style={{ fontSize: 12, color: '#64748b' }}>{formatCurrency(item.precio_unitario)} c/u</span>
                                                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{formatCurrency(item.subtotal_linea)}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div style={{ marginTop: 10, padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Notas: </span>
                                                            <span style={{ fontSize: 13, color: detallesCache[c.id_compra]?.notas ? '#1e293b' : '#94a3b8', fontStyle: detallesCache[c.id_compra]?.notas ? 'normal' : 'italic' }}>
                                                                {detallesCache[c.id_compra]?.notas || 'Sin notas registradas'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {/* Paginacion */}
                {!loading && filteredCompras.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, filteredCompras.length)} de {filteredCompras.length}
                        </span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button onClick={() => setPagina(p => p - 1)} disabled={pagina === 1}
                                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: pagina === 1 ? '#f8fafc' : 'white', color: pagina === 1 ? '#cbd5e1' : '#475569', fontSize: 12, fontWeight: 600, cursor: pagina === 1 ? 'default' : 'pointer' }}>
                                ‹ Anterior
                            </button>
                            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, padding: '0 8px' }}>
                                {pagina} / {totalPaginas}
                            </span>
                            <button onClick={() => setPagina(p => p + 1)} disabled={pagina === totalPaginas}
                                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: pagina === totalPaginas ? '#f8fafc' : 'white', color: pagina === totalPaginas ? '#cbd5e1' : '#475569', fontSize: 12, fontWeight: 600, cursor: pagina === totalPaginas ? 'default' : 'pointer' }}>
                                Siguiente ›
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Nueva Compra */}
            {showForm && (
                <div className="modal-overlay" onClick={() => { setShowForm(false); setCompraEditando(null); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
                        <div className="modal-header" style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: 16, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>{compraEditando ? `Editar Orden ${compraEditando.numero_oc}` : 'Nueva Orden de Compra'}</h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Complete los datos del proveedor y los productos</p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setCompraEditando(null); }}><X size={18} /></button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            {/* Datos proveedor */}
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Datos del Proveedor</p>
                            <div className="grid grid-cols-2 gap-4 mb-5">
                                <div>
                                    <label className="form-label">Proveedor *</label>
                                    <input className="form-input" required value={form.proveedor} onChange={e => setForm({ ...form, proveedor: e.target.value })} placeholder="Nombre o razon social" />
                                </div>
                                <div>
                                    <label className="form-label">RUC del Proveedor</label>
                                    <input className="form-input" value={form.ruc_proveedor} onChange={e => setForm({ ...form, ruc_proveedor: e.target.value })} maxLength={11} placeholder="20XXXXXXXXX" />
                                </div>
                                <div>
                                    <label className="form-label">N° Factura / Documento</label>
                                    <input className="form-input" value={form.doc_proveedor} onChange={e => setForm({ ...form, doc_proveedor: e.target.value })} placeholder="F001-00001234" />
                                </div>
                                <div>
                                    <label className="form-label">Almacén Destino *</label>
                                    <select className="form-input" required value={form.id_almacen} onChange={e => setForm({ ...form, id_almacen: e.target.value })}>
                                        {almacenes.map(a => (
                                            <option key={a.id_almacen} value={a.id_almacen}>{a.nombre} {a.es_principal ? '(Tienda)' : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label className="form-label">Notas</label>
                                    <input className="form-input" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Observaciones opcionales" />
                                </div>
                            </div>

                            {/* Buscar productos */}
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Productos</p>
                            <div className="search-bar mb-3">
                                <Search size={15} className="search-icon" />
                                <input className="form-input" placeholder="Buscar y agregar producto..." value={searchProd} onChange={e => setSearchProd(e.target.value)} />
                            </div>

                            {searchProd && (
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12, maxHeight: 160, overflowY: 'auto', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                    {filteredProds.slice(0, 8).map(p => (
                                        <div key={p.id_producto} onClick={() => addItem(p)} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                                            <div>
                                                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>{p.sku}</span>
                                                <span style={{ fontSize: 13, color: '#1e293b', marginLeft: 8 }}>{p.nombre}</span>
                                            </div>
                                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Ult. precio: {formatCurrency(p.precio_compra)}</span>
                                        </div>
                                    ))}
                                    {filteredProds.length === 0 && <p style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>No se encontraron productos</p>}
                                </div>
                            )}

                            {items.length > 0 && (
                                <>
                                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
                                        Los precios pueden variar segun el proveedor. Ingrese el precio actual de esta compra.
                                    </div>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: '#1e293b' }}>
                                                    {['SKU', 'Producto', 'Cant.', 'Precio Unit. (S/)', 'Subtotal', 'Actualizar precio', ''].map((h, i) => (
                                                        <th key={i} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'white', textAlign: i >= 2 ? 'center' : 'left' }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map((item, idx) => (
                                                    <tr key={item.id_producto} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                                                        <td style={{ padding: '8px 10px' }}>
                                                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>{item.sku}</span>
                                                        </td>
                                                        <td style={{ padding: '8px 10px' }}>
                                                            <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 }}>{item.nombre}</p>
                                                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>Ult.: {formatCurrency(item.precio_referencia)}</p>
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                            <input type="number" min="1" value={item.cantidad}
                                                                onChange={e => { const ni = [...items]; ni[idx].cantidad = Number(e.target.value); setItems(ni); }}
                                                                style={{ width: 60, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 6, textAlign: 'center', fontWeight: 700, fontSize: 13 }} />
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                            <input type="number" step="0.01" min="0.01" required value={item.precio_unitario}
                                                                placeholder={item.precio_referencia.toFixed(2)}
                                                                onChange={e => { const ni = [...items]; ni[idx].precio_unitario = e.target.value; setItems(ni); }}
                                                                style={{ width: 90, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 6, textAlign: 'right', fontWeight: 700, fontSize: 13 }} />
                                                            {item.precio_unitario && Number(item.precio_unitario) !== item.precio_referencia && (
                                                                <p style={{ fontSize: 10, marginTop: 2, fontWeight: 700, color: Number(item.precio_unitario) > item.precio_referencia ? '#dc2626' : '#15803d' }}>
                                                                    {Number(item.precio_unitario) > item.precio_referencia ? '▲' : '▼'} {((Number(item.precio_unitario) - item.precio_referencia) / item.precio_referencia * 100).toFixed(1)}%
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                                                            {formatCurrency((item.cantidad || 0) * (Number(item.precio_unitario) || 0))}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: '#64748b' }}>
                                                                <input type="checkbox" checked={item.actualizar_precio}
                                                                    onChange={e => { const ni = [...items]; ni[idx].actualizar_precio = e.target.checked; setItems(ni); }}
                                                                    style={{ accentColor: '#7c3aed' }} />
                                                                Guardar precio
                                                            </label>
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                            <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                                                                style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: '#dc2626', display: 'inline-flex' }}>
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {/* Totales */}
                            <div style={{ background: 'linear-gradient(135deg, #1e293b, #334155)', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <div style={{ display: 'flex', gap: 24 }}>
                                    <div>
                                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Subtotal</p>
                                        <p style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '2px 0 0' }}>{formatCurrency(subtotal)}</p>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>IGV (18%)</p>
                                        <p style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '2px 0 0' }}>{formatCurrency(igv)}</p>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>TOTAL</p>
                                    <p style={{ fontSize: 24, fontWeight: 800, color: 'white', margin: '2px 0 0' }}>{formatCurrency(total)}</p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setCompraEditando(null); }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ minWidth: 160, fontWeight: 700 }}>
                                    {compraEditando ? 'Guardar Cambios' : 'Registrar Compra'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {modalAnular && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 400, maxWidth: '90%' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>Anular compra</h3>
                        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
                            Orden {modalAnular.numero_oc} — {modalAnular.proveedor}. Esta acción revertirá el stock ingresado.
                        </p>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Motivo de anulación</label>
                        <textarea
                            className="form-input"
                            value={motivoAnular}
                            onChange={e => setMotivoAnular(e.target.value)}
                            rows={3}
                            style={{ width: '100%', marginTop: 4, marginBottom: 16, resize: 'none' }}
                            placeholder="Ej: Error al registrar cantidad"
                        />
                        <div className="flex justify-end gap-3">
                            <button type="button" className="btn btn-secondary" onClick={() => { setModalAnular(null); setMotivoAnular(''); }}>
                                Cancelar
                            </button>
                            <button type="button" className="btn btn-primary" style={{ background: '#dc2626' }} onClick={confirmarAnular} disabled={anulando}>
                                {anulando ? 'Anulando...' : 'Confirmar anulación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
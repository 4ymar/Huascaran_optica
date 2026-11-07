import { useState, useEffect, useRef } from 'react';
import { getClientes, createCliente, updateCliente, getCliente, deleteCliente, consultarDocumento } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import { formatCurrency, formatDateTime, downloadExcel } from '../utils/helpers';
import { useToast } from '../components/Toast';
import { useVentas } from '../context/VentasContext';
import logger from '../utils/logger';
import { Plus, Search, Edit2, X, Eye, Download, FileSpreadsheet, Upload, Users, Building2, User, Trash2, Phone, Mail, MapPin } from 'lucide-react';

export default function Clientes() {
    const toast = useToast();
    const { setClientes: setClientesVenta } = useVentas();
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterTipo, setFilterTipo] = useState('todos');
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [showDetalle, setShowDetalle] = useState(null);
    const [loadingMasVentas, setLoadingMasVentas] = useState(false);
    const [ventasOffset, setVentasOffset] = useState(0);
    const [form, setForm] = useState({
        tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: '',
        tipo_documento: 'DNI', numero_documento: '',
        direccion: '', telefono: '', email: ''
    });
    const [showDataMenu, setShowDataMenu] = useState(false);
    const [buscandoDoc, setBuscandoDoc] = useState(false);
    const [importando, setImportando] = useState(false);
    const dataMenuRef = useRef(null);
    const fileInputRef = useRef(null);
    const [pagina, setPagina] = useState(1);
    const POR_PAGINA = 30;
    useEffect(() => { loadData(); }, [search]);

    const loadData = () => {
        setLoading(true);
        getClientes(search ? { search } : {}).then(setClientes).finally(() => setLoading(false));
    };

    const openCreate = () => {
        setForm({ tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: '', tipo_documento: 'DNI', numero_documento: '', direccion: '', telefono: '', email: '' });
        setEditing(null); setShowForm(true);
    };
    const openEdit = (c) => { setForm({ ...c }); setEditing(c); setShowForm(true); };

    const viewDetalle = async (c) => {
        setVentasOffset(0);
        setShowDetalle({ ...c, loading: true });
        const data = await getCliente(c.id_cliente);
        setShowDetalle(data);
    };

    const cargarMasVentas = async () => {
        const nuevoOffset = ventasOffset + 20;
        setLoadingMasVentas(true);
        try {
            const data = await getCliente(showDetalle.id_cliente, { offset: nuevoOffset });
            setVentasOffset(nuevoOffset);
            setShowDetalle(prev => ({
                ...prev,
                ventas: [...prev.ventas, ...data.ventas],
                hayMas: data.hayMas
            }));
        } finally {
            setLoadingMasVentas(false);
        }
    };

    const buscarDocumento = async (tipo, numero) => {
        setBuscandoDoc(true);
        try {
            const data = await consultarDocumento(tipo, numero);
            setForm(prev => ({
                ...prev,
                nombre_razon_social: data.nombre_razon_social || prev.nombre_razon_social,
                direccion: data.direccion || prev.direccion,
            }));
        } catch (err) {
            toast(err.response?.data?.error || 'No se pudo autocompletar. Ingresa los datos manualmente.', 'warning');
        } finally {
            setBuscandoDoc(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editing) {
                await updateCliente(editing.id_cliente, form);
                toast('Cliente actualizado correctamente');
                setClientesVenta(prev => prev.map(c => c.id_cliente === editing.id_cliente ? { ...c, ...form } : c));
            } else {
                const nuevo = await createCliente(form);
                toast('Cliente registrado correctamente');
                setClientesVenta(prev => [...prev, nuevo]);
            }
            setShowForm(false);
            loadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error', 'error');
        }
    };

    const toggleEstado = async (c) => {
        await updateCliente(c.id_cliente, { estado: !c.estado });
        toast(c.estado ? 'Cliente desactivado' : 'Cliente activado');
        setClientesVenta(prev => prev.map(cl => cl.id_cliente === c.id_cliente ? { ...cl, estado: !c.estado } : cl));
        loadData();
    };

    const [confirmarEliminar, setConfirmarEliminar] = useState(null);

    const handleEliminar = async () => {
        const c = confirmarEliminar;
        setConfirmarEliminar(null);
        try {
            const resultado = await deleteCliente(c.id_cliente);
            toast(resultado.fisico ? 'Cliente eliminado' : 'Cliente eliminado (se conservó su historial de ventas)');
            setClientesVenta(prev => prev.filter(cl => cl.id_cliente !== c.id_cliente));
            loadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al eliminar', 'error');
        }
    };

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dataMenuRef.current && !dataMenuRef.current.contains(e.target)) {
                setShowDataMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleImportarClientes = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        setImportando(true);
        setShowDataMenu(false);

        try {
            const XLSX = await import('xlsx');
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

            if (!rows.length) {
                toast('El archivo no tiene datos', 'warning');
                setImportando(false);
                return;
            }

            let creados = 0, actualizados = 0, errores = 0;

            for (const row of rows) {
                const numeroDoc = String(row['N° Documento'] || row['numero_documento'] || '').trim();
                if (!numeroDoc) { errores++; continue; }

                const payload = {
                    tipo_cliente:        String(row['Tipo'] || '').toLowerCase().includes('empresa') ? 'EMPRESA' : 'PERSONA_NATURAL',
                    nombre_razon_social: String(row['Nombre / Razón Social'] || row['nombre_razon_social'] || '').trim(),
                    tipo_documento:      String(row['Tipo Documento'] || row['tipo_documento'] || 'DNI').trim(),
                    numero_documento:    numeroDoc,
                    telefono:            String(row['Teléfono'] || row['telefono'] || '').trim(),
                    email:               String(row['Email'] || row['email'] || '').trim(),
                    direccion:           String(row['Dirección'] || row['direccion'] || '').trim(),
                    estado:              String(row['Estado'] || '').toLowerCase() !== 'inactivo',
                };

                if (!payload.nombre_razon_social) { errores++; continue; }

                // Buscar si ya existe por N° Documento
                const existente = clientes.find(c => c.numero_documento === numeroDoc);
                try {
                    if (existente) {
                        await updateCliente(existente.id_cliente, payload);
                        actualizados++;
                    } else {
                        await createCliente(payload);
                        creados++;
                    }
                } catch {
                    errores++;
                }
            }

            loadData();
            const msg = [];
            if (creados)     msg.push(`${creados} creados`);
            if (actualizados) msg.push(`${actualizados} actualizados`);
            if (errores)     msg.push(`${errores} con error`);
            toast(`Importación completada: ${msg.join(', ')}`, errores > 0 ? 'warning' : 'success');
        } catch (err) {
            logger.error('CLIENTES', 'Error importando clientes:', err);
            toast('Error al leer el archivo', 'error');
        } finally {
            setImportando(false);
        }
    };

    const filtered = clientes.filter(c =>
        filterTipo === 'todos' ? true : filterTipo === 'empresa' ? c.tipo_cliente === 'EMPRESA' : c.tipo_cliente === 'PERSONA_NATURAL'
    );

    const empresas = clientes.filter(c => c.tipo_cliente === 'EMPRESA').length;
    const personas = clientes.filter(c => c.tipo_cliente === 'PERSONA_NATURAL').length;
    const activos = clientes.filter(c => c.estado).length;
    const totalPaginas = Math.ceil(filtered.length / POR_PAGINA);
    const paginados = filtered.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
    return (
        <div className="page-enter">

            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 }}>Clientes</h1>
                    <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>
                        Gestion de clientes — {clientes.length} registrados
                    </p>
                </div>
                <div className="flex gap-3">
                    <div style={{ position: 'relative' }} ref={dataMenuRef}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowDataMenu(v => !v)}
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
                                minWidth: 210, zIndex: 50, overflow: 'hidden'
                            }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, padding: '10px 14px 6px' }}>
                                    Gestión de datos
                                </p>
                                <button
                                    onClick={() => { fileInputRef.current?.click(); setShowDataMenu(false); }}
                                    disabled={importando}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#334155', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f7ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <Upload size={15} style={{ color: '#735DFF' }} />
                                    {importando ? 'Importando...' : 'Importar clientes'}
                                </button>
                                <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                                <button
                                    onClick={() => {
                                        setShowDataMenu(false);
                                        downloadExcel(clientes, 'clientes', 'clientes', toast, [
                                            { header: 'Tipo',                  value: c => c.tipo_cliente === 'EMPRESA' ? 'Empresa' : 'Persona Natural' },
                                            { header: 'Nombre / Razón Social', value: c => c.nombre_razon_social },
                                            { header: 'Tipo Documento',        value: c => c.tipo_documento },
                                            { header: 'N° Documento',          value: c => c.numero_documento },
                                            { header: 'Teléfono',              value: c => c.telefono || '' },
                                            { header: 'Email',                 value: c => c.email || '' },
                                            { header: 'Dirección',             value: c => c.direccion || '' },
                                            { header: 'Estado',                value: c => c.estado ? 'Activo' : 'Inactivo' },
                                        ]);
                                    }}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#334155', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f7ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <Download size={15} style={{ color: '#735DFF' }} /> Exportar Excel
                                </button>
                            </div>
                        )}
                    </div>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportarClientes} />
                    <button className="btn btn-primary" onClick={openCreate}>
                        <Plus size={18} /> Nuevo Cliente
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total Clientes', valor: clientes.length, icon: '👥', color: '#7c3aed', bg: '#f5f3ff', border: '#e9d5ff' },
                    { label: 'Activos', valor: activos, icon: '✅', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                    { label: 'Personas', valor: personas, icon: '👤', color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
                    { label: 'Empresas', valor: empresas, icon: '🏢', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                ].map((k, i) => (
                    <div key={i} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 28 }}>{k.icon}</span>
                        <div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', margin: 0 }}>{k.label}</p>
                            <p style={{ fontSize: 22, fontWeight: 800, color: k.color, margin: '2px 0 0' }}>{k.valor}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Busqueda y filtros */}
            <div className="card mb-4" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
                        <Search size={15} className="search-icon" />
                        <input className="form-input" placeholder="Buscar por nombre, documento o telefono..." value={search} onChange={e => { setSearch(e.target.value); setPagina(1); }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {[
                            { key: 'todos', label: 'Todos' },
                            { key: 'persona', label: 'Personas' },
                            { key: 'empresa', label: 'Empresas' },
                        ].map(f => (
                            <button key={f.key} onClick={() => { setFilterTipo(f.key); setPagina(1); }} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid', borderColor: filterTipo === f.key ? '#7c3aed' : '#e2e8f0', background: filterTipo === f.key ? '#f5f3ff' : 'white', color: filterTipo === f.key ? '#7c3aed' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tabla */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div className="loader"><div className="spinner"></div></div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state" style={{ padding: 48 }}>
                        <Users size={48} style={{ color: '#cbd5e1' }} />
                        <p style={{ color: '#94a3b8', marginTop: 12 }}>No se encontraron clientes</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ margin: 0 }}>
                            <thead>
                                <tr>
                                    <th>Tipo</th>
                                    <th>Nombre / Razon Social</th>
                                    <th>Documento</th>
                                    <th>Telefono</th>
                                    <th>Email</th>
                                    <th style={{ textAlign: 'center' }}>Estado</th>
                                    <th style={{ textAlign: 'center' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginados.map(c => (
                                    <tr key={c.id_cliente} style={{ opacity: c.estado ? 1 : 0.5 }}>
                                        <td>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: c.tipo_cliente === 'EMPRESA' ? '#fffbeb' : '#f0f9ff', color: c.tipo_cliente === 'EMPRESA' ? '#d97706' : '#0369a1', border: `1px solid ${c.tipo_cliente === 'EMPRESA' ? '#fde68a' : '#bae6fd'}` }}>
                                                {c.tipo_cliente === 'EMPRESA' ? <Building2 size={11} /> : <User size={11} />}
                                                {c.tipo_cliente === 'EMPRESA' ? 'Empresa' : 'Persona'}
                                            </span>
                                        </td>
                                        <td>
                                            <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 }}>{c.nombre_razon_social}</p>
                                        </td>
                                        <td>
                                            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginRight: 4 }}>{c.tipo_documento}</span>
                                                {c.numero_documento}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 13, color: '#475569' }}>{c.telefono || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                        <td style={{ fontSize: 12, color: '#94a3b8' }}>{c.email || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: c.estado ? '#f0fdf4' : '#fef2f2', color: c.estado ? '#15803d' : '#dc2626', border: `1px solid ${c.estado ? '#bbf7d0' : '#fecaca'}` }}>
                                                {c.estado ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                <button onClick={() => viewDetalle(c)} title="Ver historial"
                                                    style={{ background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#7c3aed', display: 'inline-flex' }}>
                                                    <Eye size={14} />
                                                </button>
                                                <button onClick={() => openEdit(c)} title="Editar"
                                                    style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#475569', display: 'inline-flex' }}>
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => toggleEstado(c)} title={c.estado ? 'Desactivar' : 'Activar'}
                                                    style={{ background: c.estado ? '#fef2f2' : '#f0fdf4', border: `1px solid ${c.estado ? '#fecaca' : '#bbf7d0'}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: c.estado ? '#dc2626' : '#15803d', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600 }}>
                                                    {c.estado ? <><X size={12} /> Baja</> : <>✓ Activar</>}
                                                </button>
                                                <button onClick={() => setConfirmarEliminar(c)} title="Eliminar"
                                                    style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#dc2626', display: 'inline-flex', alignItems: 'center' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

            {/* Paginacion */}
            {!loading && totalPaginas > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, filtered.length)} de {filtered.length}
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

            {/* Modal Form */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                        <div className="modal-header" style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: 16, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                                    {editing ? 'Editar Cliente' : 'Nuevo Cliente'}
                                </h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>
                                    {editing ? `Modificando: ${editing.nombre_razon_social}` : 'Complete los datos del cliente'}
                                </p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}><X size={18} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Tipo cliente */}
                            <div>
                                <label className="form-label">Tipo de Cliente</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    {[
                                        { val: 'PERSONA_NATURAL', label: 'Persona Natural', icon: <User size={16} />, desc: 'DNI' },
                                        { val: 'EMPRESA', label: 'Empresa', icon: <Building2 size={16} />, desc: 'RUC' },
                                    ].map(t => (
                                        <button key={t.val} type="button"
                                            onClick={() => setForm({ ...form, tipo_cliente: t.val, tipo_documento: t.val === 'EMPRESA' ? 'RUC' : 'DNI' })}
                                            style={{ padding: '10px 12px', borderRadius: 8, border: `2px solid ${form.tipo_cliente === t.val ? '#7c3aed' : '#e2e8f0'}`, background: form.tipo_cliente === t.val ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: form.tipo_cliente === t.val ? '#7c3aed' : '#64748b', fontWeight: 700, fontSize: 13 }}>
                                                {t.icon} {t.label}
                                            </div>
                                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>Documento: {t.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="form-label">{form.tipo_cliente === 'EMPRESA' ? 'Razon Social *' : 'Nombre Completo *'}</label>
                                <input className="form-input" required value={form.nombre_razon_social} onChange={e => setForm({ ...form, nombre_razon_social: e.target.value })} placeholder={form.tipo_cliente === 'EMPRESA' ? 'FERRETERIA EJEMPLO S.A.C.' : 'Juan Perez Lopez'} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                                <div>
                                    <label className="form-label">Tipo Doc.</label>
                                    {form.tipo_cliente === 'EMPRESA' ? (
                                        <div className="form-input" style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', color: '#64748b', fontWeight: 600 }}>RUC</div>
                                    ) : (
                                        <select className="form-select" value={form.tipo_documento} onChange={e => setForm({ ...form, tipo_documento: e.target.value })}>
                                            <option>DNI</option>
                                            <option>RUC</option>
                                        </select>
                                    )}
                                </div>
                                <div>
                                    <label className="form-label">N° Documento *</label>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input className="form-input" required value={form.numero_documento}
                                            maxLength={form.tipo_documento === 'DNI' ? 8 : 11}
                                            onChange={e => {
                                                const numero = e.target.value.replace(/\D/g, '');
                                                setForm({ ...form, numero_documento: numero });
                                                const longitudEsperada = form.tipo_documento === 'DNI' ? 8 : 11;
                                                if (numero.length === longitudEsperada) buscarDocumento(form.tipo_documento, numero);
                                            }}
                                            placeholder={form.tipo_documento === 'DNI' ? '12345678' : '20123456789'} />
                                        <button type="button" className="btn btn-secondary" style={{ flexShrink: 0, padding: '0 12px' }}
                                            disabled={buscandoDoc || !form.numero_documento}
                                            onClick={() => buscarDocumento(form.tipo_documento, form.numero_documento)}
                                            title="Buscar datos por documento">
                                            {buscandoDoc ? '...' : <Search size={16} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="form-label">Direccion</label>
                                <input className="form-input" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} placeholder="Jr. Lima 123, Yungay" />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label className="form-label">Telefono</label>
                                    <input className="form-input" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} placeholder="943123456" />
                                </div>
                                <div>
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="cliente@email.com" />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3" style={{ paddingTop: 8 }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ minWidth: 140 }}>
                                    {editing ? 'Guardar Cambios' : 'Registrar Cliente'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Panel Detalle */}
            {showDetalle && (
                <div className="drawer-overlay" onClick={() => setShowDetalle(null)}>
                    <div className="drawer-panel" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #f1f5f9', paddingBottom: 20, marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #735DFF, #C516E1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                                    {(showDetalle.nombre_razon_social || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: 0 }}>{showDetalle.nombre_razon_social}</h2>
                                    <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 8px' }}>{showDetalle.tipo_documento}: {showDetalle.numero_documento}</p>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <span className="badge badge-info">{showDetalle.tipo_cliente === 'EMPRESA' ? 'Empresa' : 'Persona Natural'}</span>
                                        <span className={`badge ${showDetalle.estado ? 'badge-success' : 'badge-danger'}`}>{showDetalle.estado ? 'Activo' : 'Inactivo'}</span>
                                    </div>
                                </div>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowDetalle(null)}><X size={18} /></button>
                        </div>

                        {/* Resumen compras */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                            <div className="kpi-card purple" style={{ textAlign: 'center', padding: '14px 16px' }}>
                                <p style={{ fontSize: 11, color: '#735DFF', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>Total Comprado</p>
                                <p style={{ fontSize: 22, fontWeight: 800, color: '#735DFF', margin: '4px 0 0' }}>{formatCurrency(showDetalle.totalCompras || 0)}</p>
                            </div>
                            <div className="kpi-card green" style={{ textAlign: 'center', padding: '14px 16px' }}>
                                <p style={{ fontSize: 11, color: '#10B981', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>N° Compras</p>
                                <p style={{ fontSize: 22, fontWeight: 800, color: '#10B981', margin: '4px 0 0' }}>{showDetalle.cantidadCompras || 0}</p>
                            </div>
                        </div>

                        {/* Datos de contacto */}
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Datos de Contacto</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                            {[
                                { icon: <Phone size={15} />, valor: showDetalle.telefono },
                                { icon: <Mail size={15} />, valor: showDetalle.email },
                                { icon: <MapPin size={15} />, valor: showDetalle.direccion },
                            ].filter(d => d.valor).map((d, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#475569', fontSize: 13.5 }}>
                                    <span style={{ color: '#735DFF', display: 'inline-flex' }}>{d.icon}</span>
                                    {d.valor}
                                </div>
                            ))}
                        </div>

                        {/* Historial */}
                        {showDetalle.ventas && showDetalle.ventas.length > 0 && (
                            <>
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>
                                    Historial de Compras
                                    <span style={{ fontWeight: 400, textTransform: 'none', color: '#94a3b8', marginLeft: 6 }}>
                                        ({showDetalle.ventas.length} de {showDetalle.cantidadCompras})
                                    </span>
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                                    {showDetalle.ventas.map(v => (
                                        <div key={v.id_venta} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 12px' }}>
                                            <div>
                                                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>{v.numero_venta}</span>
                                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{formatDateTime(v.fecha_hora)} • {v.tipo_comprobante}</p>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: 0 }}>{formatCurrency(v.total)}</p>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: v.estado === 'ACTIVA' ? '#15803d' : '#dc2626' }}>{v.estado}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {showDetalle.hayMas && (
                                    <button
                                        onClick={cargarMasVentas}
                                        disabled={loadingMasVentas}
                                        style={{ marginTop: 8, width: '100%', padding: '7px 0', borderRadius: 8, border: '1px dashed #c4b5fd', background: loadingMasVentas ? '#f1f5f9' : '#faf5ff', color: loadingMasVentas ? '#94a3b8' : '#7c3aed', fontSize: 12, fontWeight: 600, cursor: loadingMasVentas ? 'default' : 'pointer' }}
                                    >
                                        {loadingMasVentas ? 'Cargando...' : `+ Ver 20 más (${showDetalle.cantidadCompras - showDetalle.ventas.length} restantes)`}
                                    </button>
                                )}
                            </>
                        )}

                        {/* Acciones */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #f1f5f9', paddingTop: 20, marginTop: 20 }}>
                            <button className="btn btn-secondary" onClick={() => { toggleEstado(showDetalle); setShowDetalle(null); }}>
                                {showDetalle.estado ? 'Desactivar' : 'Activar'}
                            </button>
                            <button className="btn btn-primary" onClick={() => { setShowDetalle(null); openEdit(showDetalle); }}>
                                <Edit2 size={15} /> Editar Cliente
                            </button>
                        </div>
                    </div>
                </div>
            )}                
        <ConfirmModal
                open={!!confirmarEliminar}
                title="Eliminar cliente"
                message={confirmarEliminar ? `¿Eliminar a "${confirmarEliminar.nombre_razon_social}"? Esta acción no se puede deshacer.` : ''}
                onConfirm={handleEliminar}
                onCancel={() => setConfirmarEliminar(null)}
            />
        </div>
    );
}

import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, X, Check, LayoutGrid, ToggleLeft, ToggleRight, Upload, Download, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '../../components/Toast';
import logger from '../../utils/logger';
import { getCategoriasCRUD, createCategoria, updateCategoria, deleteCategoria, getUnidadesCRUD, createUnidad, updateUnidad, deleteUnidad } from '../../services/api';

// ── Endpoints ────────────────────────────────────────────────────────────────
const API = {
    listar:     getCategoriasCRUD,
    crear:      createCategoria,
    actualizar: updateCategoria,
    eliminar:   deleteCategoria,
};
const API_UNIDADES = {
    listar:     getUnidadesCRUD,
    crear:      createUnidad,
    actualizar: updateUnidad,
    eliminar:   deleteUnidad,
};
// ── Emojis predefinidos agrupados por rubro ──────────────────────────────────
const EMOJIS = [
    // Genérico
    '📦','⭐','🏷️','🛒','💼','📋','🗂️',
    // Construcción / ferretería
    '🔧','🪛','🔨','🪚','⚡','🚿','🎨','🧱','🔒','🪟',
    // Alimentos / bebidas
    '🍎','🥩','🥛','🍞','🥤','🍺','☕','🍫','🌽','🧂',
    // Salud / belleza / farmacia
    '💊','🩺','💈','🧴','🪥','🧹','🧼',
    // Ropa / hogar
    '👕','👟','🪑','🛋️','🪴','🌱',
    // Tecnología
    '📱','💻','🖨️','🎮','📷',
    // Otros rubros
    '📚','✏️','🐾','🍽️','🚗','⛽','🧪','🌿',
];

const emptyForm = { nombre: '', icono: '📦' };
const emptyFormUnidad = { nombre: '' };

export default function SeccionCatalogo() {
    const toast = useToast();
    const [tab, setTab] = useState('categorias'); // 'categorias' | 'unidades'
    const [categorias, setCategorias]   = useState([]);
    const [loading, setLoading]         = useState(true);
    const [showForm, setShowForm]       = useState(false);
    const [editando, setEditando]       = useState(null); // objeto categoría o null
    const [form, setForm]               = useState(emptyForm);
    const [showPicker, setShowPicker]   = useState(false);
    const [guardando, setGuardando]     = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null); // id a eliminar
    const [showImport, setShowImport]             = useState(false);
    const [importData, setImportData]             = useState([]);
    const [importProcessing, setImportProcessing] = useState(false);
    const fileInputRef = useRef(null);

    // ── Unidades ──────────────────────────────────────────────────────────────
    const [unidadesList, setUnidadesList]       = useState([]);
    const [loadingUnidades, setLoadingUnidades] = useState(true);
    const [showFormUnidad, setShowFormUnidad]   = useState(false);
    const [editandoUnidad, setEditandoUnidad]   = useState(null);
    const [formUnidad, setFormUnidad]           = useState(emptyFormUnidad);
    const [guardandoUnidad, setGuardandoUnidad] = useState(false);
    const [confirmDeleteUnidad, setConfirmDeleteUnidad] = useState(null);

    // ── Carga ─────────────────────────────────────────────────────────────────
    const cargar = async () => {
        setLoading(true);
        try {
            const data = await API.listar();
            setCategorias(Array.isArray(data) ? data : []);
        } catch {
            toast('Error al cargar categorías', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { cargar(); }, []);

    // ── Unidades: carga y CRUD ────────────────────────────────────────────────
    const cargarUnidades = async () => {
        setLoadingUnidades(true);
        try {
            const data = await API_UNIDADES.listar();
            setUnidadesList(Array.isArray(data) ? data : []);
        } catch {
            toast('Error al cargar unidades', 'error');
        } finally {
            setLoadingUnidades(false);
        }
    };

    useEffect(() => { cargarUnidades(); }, []);

    const abrirCrearUnidad = () => {
        setFormUnidad(emptyFormUnidad);
        setEditandoUnidad(null);
        setShowFormUnidad(true);
    };

    const abrirEditarUnidad = (u) => {
        setFormUnidad({ nombre: u.nombre });
        setEditandoUnidad(u);
        setShowFormUnidad(true);
    };

    const cerrarFormUnidad = () => {
        setShowFormUnidad(false);
        setEditandoUnidad(null);
    };

    const handleGuardarUnidad = async () => {
        if (!formUnidad.nombre.trim()) {
            toast('El nombre es requerido', 'error');
            return;
        }
        setGuardandoUnidad(true);
        try {
            let res;
            if (editandoUnidad) {
                res = await API_UNIDADES.actualizar(editandoUnidad.id_unidad, {
                    nombre: formUnidad.nombre,
                    activo: editandoUnidad.activo,
                });
            } else {
                res = await API_UNIDADES.crear({ nombre: formUnidad.nombre });
            }
            if (res.error) { toast(res.error, 'error'); return; }
            toast(editandoUnidad ? 'Unidad actualizada' : 'Unidad creada', 'success');
            cerrarFormUnidad();
            cargarUnidades();
        } catch {
            toast('Error al guardar', 'error');
        } finally {
            setGuardandoUnidad(false);
        }
    };

    const toggleActivoUnidad = async (u) => {
        try {
            const res = await API_UNIDADES.actualizar(u.id_unidad, {
                nombre: u.nombre,
                activo: u.activo ? 0 : 1,
            });
            if (res.error) { toast(res.error, 'error'); return; }
            toast(u.activo ? 'Unidad desactivada' : 'Unidad activada');
            cargarUnidades();
        } catch {
            toast('Error al cambiar estado', 'error');
        }
    };

    const handleEliminarUnidad = async (id) => {
        try {
            const res = await API_UNIDADES.eliminar(id);
            if (res.error) { toast(res.error, 'error'); return; }
            toast('Unidad eliminada');
            setConfirmDeleteUnidad(null);
            cargarUnidades();
        } catch {
            toast('Error al eliminar', 'error');
        }
    };

    // ── Abrir formulario ──────────────────────────────────────────────────────
    const abrirCrear = () => {
        setForm(emptyForm);
        setEditando(null);
        setShowPicker(false);
        setShowForm(true);
    };

    const abrirEditar = (cat) => {
        setForm({ nombre: cat.nombre, icono: cat.icono });
        setEditando(cat);
        setShowPicker(false);
        setShowForm(true);
    };

    const cerrarForm = () => {
        setShowForm(false);
        setEditando(null);
        setShowPicker(false);
    };

    // ── Guardar ───────────────────────────────────────────────────────────────
    const handleGuardar = async () => {
        if (!form.nombre.trim()) {
            toast('El nombre es requerido', 'error');
            return;
        }
        setGuardando(true);
        try {
            let res;
            if (editando) {
                res = await API.actualizar(editando.id_categoria, {
                    nombre: form.nombre,
                    icono:  form.icono,
                    activo: editando.activo,
                });
            } else {
                res = await API.crear({ nombre: form.nombre, icono: form.icono });
            }
            if (res.error) { toast(res.error, 'error'); return; }
            toast(editando ? 'Categoría actualizada' : 'Categoría creada', 'success');
            cerrarForm();
            cargar();
        } catch {
            toast('Error al guardar', 'error');
        } finally {
            setGuardando(false);
        }
    };

    // ── Toggle activo ─────────────────────────────────────────────────────────
    const toggleActivo = async (cat) => {
        try {
            const res = await API.actualizar(cat.id_categoria, {
                nombre: cat.nombre,
                icono:  cat.icono,
                activo: cat.activo ? 0 : 1,
            });
            if (res.error) { toast(res.error, 'error'); return; }
            toast(cat.activo ? 'Categoría desactivada' : 'Categoría activada');
            cargar();
        } catch {
            toast('Error al cambiar estado', 'error');
        }
    };

    // ── Eliminar ──────────────────────────────────────────────────────────────
    const handleEliminar = async (id) => {
        try {
            const res = await API.eliminar(id);
            if (res.error) { toast(res.error, 'error'); return; }
            toast('Categoría eliminada');
            setConfirmDelete(null);
            cargar();
        } catch {
            toast('Error al eliminar', 'error');
        }
    };

    // ── Importar Excel ────────────────────────────────────────────────────────
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const XLSX = await import('xlsx');
                const wb  = XLSX.read(evt.target.result, { type: 'binary' });
                const ws  = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

                const normalize = (obj) => {
                    const n = {};
                    Object.keys(obj).forEach(k => { n[k.toLowerCase().trim().replace(/ /g, '_')] = obj[k]; });
                    return n;
                };

                const parsed = raw.map((row, idx) => {
                    const r = normalize(row);
                    const nombre = String(r.nombre || r.categoria || '').trim();
                    const existente = categorias.find(
                        c => c.nombre.trim().toLowerCase() === nombre.toLowerCase()
                    );
                    let estado;
                    if (!existente) estado = 'nuevo';
                    else if (!existente.activo) estado = 'reactivar';
                    else estado = 'sin_cambios';
                    return {
                        _idx: idx,
                        nombre,
                        _estado: estado,
                        _existente: existente || null,
                        _omitir: estado === 'sin_cambios',
                    };
                }).filter(r => r.nombre);

                if (parsed.length === 0) {
                    toast('No se encontraron categorías válidas en el archivo', 'error');
                    return;
                }

                setImportData(parsed);
                setShowImport(true);
            } catch (err) {
                logger.error('CONFIG_CATALOGO', 'Error leyendo archivo importación:', err);
                toast('Error al leer el archivo. Verifique el formato.', 'error');
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const handleImportConfirm = async () => {
        setImportProcessing(true);
        let creadas = 0, reactivadas = 0, errores = 0;

        for (const item of importData) {
            if (item._omitir) continue;
            try {
                if (item._estado === 'nuevo') {
                    const res = await API.crear({ nombre: item.nombre, icono: '📦' });
                    if (res.error) { errores++; continue; }
                    creadas++;
                } else if (item._estado === 'reactivar') {
                    const res = await API.actualizar(item._existente.id_categoria, {
                        nombre: item._existente.nombre,
                        icono:  item._existente.icono,
                        activo: 1,
                    });
                    if (res.error) { errores++; continue; }
                    reactivadas++;
                }
            } catch { errores++; }
        }

        setImportProcessing(false);
        setShowImport(false);
        setImportData([]);
        cargar();
        toast(`Importación completa: ${creadas} creadas, ${reactivadas} reactivadas${errores > 0 ? `, ${errores} errores` : ''}`, 'success');
    };

    // ── Plantilla descargable ────────────────────────────────────────────────
    const descargarPlantilla = async () => {
        const XLSX = await import('xlsx');
        const plantilla = [{ 'Nombre': 'Abarrotes' }, { 'Nombre': 'Ferretería' }, { 'Nombre': 'Limpieza' }];
        const ws = XLSX.utils.json_to_sheet(plantilla);
        ws['!cols'] = [{ wch: 30 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Categorías');
        XLSX.writeFile(wb, 'plantilla_categorias.xlsx');
    };

    // ── Exportar catálogo actual ─────────────────────────────────────────────
    const handleExportar = async () => {
        if (categorias.length === 0) {
            toast('No hay categorías para exportar', 'error');
            return;
        }
        const XLSX = await import('xlsx');
        const datos = categorias.map(c => ({
            'Nombre': c.nombre,
            'Ícono':  c.icono,
            'Estado': c.activo ? 'Activo' : 'Inactivo',
        }));
        const ws = XLSX.utils.json_to_sheet(datos);
        ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 12 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Categorías');
        const fecha = new Date().toLocaleDateString('es-PE').replace(/\//g, '-');
        XLSX.writeFile(wb, `categorias_${fecha}.xlsx`);
    };

    const nuevasCount     = importData.filter(i => i._estado === 'nuevo').length;
    const reactivarCount  = importData.filter(i => i._estado === 'reactivar').length;

    // ── Render ────────────────────────────────────────────────────────────────
    const activas   = categorias.filter(c => c.activo);
    const inactivas = categorias.filter(c => !c.activo);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Selector de pestañas */}
            <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 10, width: 'fit-content' }}>
                <button
                    onClick={() => setTab('categorias')}
                    style={{
                        padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600,
                        background: tab === 'categorias' ? '#fff' : 'transparent',
                        color: tab === 'categorias' ? '#1e293b' : '#64748b',
                        boxShadow: tab === 'categorias' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                >
                    Categorías
                </button>
                <button
                    onClick={() => setTab('unidades')}
                    style={{
                        padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600,
                        background: tab === 'unidades' ? '#fff' : 'transparent',
                        color: tab === 'unidades' ? '#1e293b' : '#64748b',
                        boxShadow: tab === 'unidades' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                >
                    Unidades
                </button>
            </div>

            {tab === 'categorias' && (<>

            {/* Cabecera de sección */}
            <div style={{
                background: '#fff', borderRadius: 14, padding: '20px 24px',
                border: '1px solid #f1f5f9',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            background: 'rgba(115,93,255,0.1)', borderRadius: 8,
                            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <LayoutGrid size={18} style={{ color: '#735DFF' }} />
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Categorías de productos</p>
                            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                                {activas.length} activa{activas.length !== 1 ? 's' : ''} · {inactivas.length} inactiva{inactivas.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleFileUpload} />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            title="Importar categorías desde Excel"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                            <Upload size={15} /> Importar
                        </button>
                        <button
                            onClick={handleExportar}
                            title="Exportar categorías a Excel"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                            <Download size={15} /> Exportar
                        </button>
                        <button
                            onClick={abrirCrear}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #735DFF 0%, #C516E1 100%)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(115,93,255,0.3)' }}
                        >
                            <Plus size={15} /> Nueva categoría
                        </button>
                    </div>
                </div>
                <p style={{ margin: '12px 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                    Las categorías permiten organizar tu catálogo según el rubro de tu negocio.
                    Solo las categorías <strong>activas</strong> aparecerán al crear o editar productos.
                    {' '}<button onClick={descargarPlantilla} style={{ background: 'none', border: 'none', padding: 0, color: '#735DFF', fontWeight: 600, cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>Descargar plantilla Excel</button>
                </p>
            </div>

            {/* Lista */}
            <div style={{
                background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
            }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        Cargando categorías...
                    </div>
                ) : categorias.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <p style={{ fontSize: 32, margin: '0 0 8px' }}>📦</p>
                        <p style={{ margin: 0, fontSize: 14, color: '#64748b', fontWeight: 600 }}>Sin categorías</p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>Crea la primera para organizar tu catálogo</p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                                <th style={thStyle}>Categoría</th>
                                <th style={{ ...thStyle, textAlign: 'center', width: 90 }}>Estado</th>
                                <th style={{ ...thStyle, textAlign: 'center', width: 110 }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categorias.map((cat, idx) => (
                                <tr
                                    key={cat.id_categoria}
                                    style={{
                                        borderBottom: idx < categorias.length - 1 ? '1px solid #f8fafc' : 'none',
                                        opacity: cat.activo ? 1 : 0.5,
                                        transition: 'opacity 0.2s',
                                    }}
                                >
                                    {/* Nombre + ícono */}
                                    <td style={{ padding: '12px 20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{
                                                fontSize: 22, width: 38, height: 38,
                                                background: '#f8fafc', borderRadius: 8,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0,
                                            }}>
                                                {cat.icono}
                                            </span>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                                                {cat.nombre}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Toggle activo */}
                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => toggleActivo(cat)}
                                            title={cat.activo ? 'Desactivar' : 'Activar'}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                                        >
                                            {cat.activo
                                                ? <ToggleRight size={24} style={{ color: '#735DFF' }} />
                                                : <ToggleLeft  size={24} style={{ color: '#cbd5e1' }} />
                                            }
                                        </button>
                                    </td>

                                    {/* Acciones */}
                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                            <button
                                                onClick={() => abrirEditar(cat)}
                                                title="Editar"
                                                style={btnIconStyle('#f1f5f9', '#475569')}
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            {confirmDelete === cat.id_categoria ? (
                                                <>
                                                    <button
                                                        onClick={() => handleEliminar(cat.id_categoria)}
                                                        title="Confirmar eliminación"
                                                        style={btnIconStyle('#fef2f2', '#dc2626')}
                                                    >
                                                        <Check size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDelete(null)}
                                                        title="Cancelar"
                                                        style={btnIconStyle('#f1f5f9', '#94a3b8')}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmDelete(cat.id_categoria)}
                                                    title="Eliminar"
                                                    style={btnIconStyle('#fff', '#cbd5e1')}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal crear/editar */}
            {showForm && (
                <div
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000,
                    }}
                    onClick={cerrarForm}
                >
                    <div
                        style={{
                            background: '#fff', borderRadius: 16, padding: 28,
                            width: '100%', maxWidth: 420,
                            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header modal */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                                {editando ? 'Editar categoría' : 'Nueva categoría'}
                            </h3>
                            <button onClick={cerrarForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Ícono seleccionado */}
                        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                            Ícono
                        </p>
                        <button
                            onClick={() => setShowPicker(p => !p)}
                            style={{
                                width: '100%', padding: '10px 14px', marginBottom: 6,
                                background: '#f8fafc', border: '1px solid #e2e8f0',
                                borderRadius: 8, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 10,
                                fontSize: 13, color: '#475569',
                            }}
                        >
                            <span style={{ fontSize: 24 }}>{form.icono}</span>
                            <span style={{ flex: 1, textAlign: 'left' }}>
                                {showPicker ? 'Cerrar selector' : 'Cambiar ícono'}
                            </span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{showPicker ? '▲' : '▼'}</span>
                        </button>

                        {/* Picker de emojis */}
                        {showPicker && (
                            <div style={{
                                background: '#f8fafc', border: '1px solid #e2e8f0',
                                borderRadius: 10, padding: 12, marginBottom: 16,
                                display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4,
                            }}>
                                {EMOJIS.map(emoji => (
                                    <button
                                        key={emoji}
                                        onClick={() => { setForm(f => ({ ...f, icono: emoji })); setShowPicker(false); }}
                                        style={{
                                            background: form.icono === emoji ? 'rgba(115,93,255,0.15)' : 'transparent',
                                            border: form.icono === emoji ? '2px solid #735DFF' : '2px solid transparent',
                                            borderRadius: 6, padding: '4px 2px',
                                            cursor: 'pointer', fontSize: 20,
                                            transition: 'all 0.1s',
                                        }}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Nombre */}
                        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                            Nombre
                        </p>
                        <input
                            autoFocus
                            value={form.nombre}
                            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && handleGuardar()}
                            placeholder="Ej: Abarrotes, Ferretería, Ropa..."
                            maxLength={50}
                            style={{
                                width: '100%', padding: '10px 14px', fontSize: 14,
                                border: '1px solid #e2e8f0', borderRadius: 8,
                                outline: 'none', boxSizing: 'border-box',
                                fontFamily: 'inherit', color: '#1e293b',
                                marginBottom: 20,
                            }}
                        />

                        {/* Botones */}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                                onClick={cerrarForm}
                                style={{
                                    padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0',
                                    background: '#fff', fontSize: 13, fontWeight: 600,
                                    color: '#475569', cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleGuardar}
                                disabled={guardando || !form.nombre.trim()}
                                style={{
                                    padding: '8px 20px', borderRadius: 8, border: 'none',
                                    background: guardando || !form.nombre.trim()
                                        ? '#e2e8f0'
                                        : 'linear-gradient(135deg, #735DFF 0%, #C516E1 100%)',
                                    color: guardando || !form.nombre.trim() ? '#94a3b8' : '#fff',
                                    fontSize: 13, fontWeight: 600, cursor: guardando ? 'wait' : 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear categoría'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal importación Excel */}
            {showImport && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                    onClick={() => !importProcessing && setShowImport(false)}
                >
                    <div
                        style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Confirmar importación</h3>
                                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>{importData.length} categorías encontradas — revise antes de confirmar</p>
                            </div>
                            <button onClick={() => setShowImport(false)} disabled={importProcessing} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CheckCircle size={18} style={{ color: '#15803d' }} />
                                <div>
                                    <p style={{ fontSize: 10, color: '#15803d', fontWeight: 600, margin: 0, textTransform: 'uppercase' }}>Nuevas</p>
                                    <p style={{ fontSize: 18, fontWeight: 800, color: '#15803d', margin: 0 }}>{nuevasCount}</p>
                                </div>
                            </div>
                            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={18} style={{ color: '#d97706' }} />
                                <div>
                                    <p style={{ fontSize: 10, color: '#d97706', fontWeight: 600, margin: 0, textTransform: 'uppercase' }}>A reactivar</p>
                                    <p style={{ fontSize: 18, fontWeight: 800, color: '#d97706', margin: 0 }}>{reactivarCount}</p>
                                </div>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Nombre</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Estado</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Omitir</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importData.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e293b' }}>{item.nombre}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                                                    background: item._estado === 'nuevo' ? '#f0fdf4' : item._estado === 'reactivar' ? '#fffbeb' : '#f1f5f9',
                                                    color: item._estado === 'nuevo' ? '#15803d' : item._estado === 'reactivar' ? '#d97706' : '#94a3b8',
                                                }}>
                                                    {item._estado === 'nuevo' ? 'Nueva' : item._estado === 'reactivar' ? 'Reactivar' : 'Sin cambios'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={item._omitir}
                                                    onChange={() => {
                                                        const updated = [...importData];
                                                        updated[idx]._omitir = !updated[idx]._omitir;
                                                        setImportData(updated);
                                                    }}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button onClick={() => setShowImport(false)} disabled={importProcessing} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                            <button
                                onClick={handleImportConfirm}
                                disabled={importProcessing || importData.every(i => i._omitir)}
                                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: importProcessing ? '#e2e8f0' : 'linear-gradient(135deg, #735DFF 0%, #C516E1 100%)', color: importProcessing ? '#94a3b8' : '#fff', fontSize: 13, fontWeight: 600, cursor: importProcessing ? 'wait' : 'pointer' }}
                            >
                                {importProcessing ? 'Importando...' : `Confirmar (${importData.filter(i => !i._omitir).length})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </>)}

            {tab === 'unidades' && (<>
                {/* Cabecera de sección */}
                <div style={{
                    background: '#fff', borderRadius: 14, padding: '20px 24px',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                background: 'rgba(115,93,255,0.1)', borderRadius: 8,
                                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <LayoutGrid size={18} style={{ color: '#735DFF' }} />
                            </div>
                            <div>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Unidades de medida</p>
                                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                                    {unidadesList.filter(u => u.activo).length} activa{unidadesList.filter(u => u.activo).length !== 1 ? 's' : ''} · {unidadesList.filter(u => !u.activo).length} inactiva{unidadesList.filter(u => !u.activo).length !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={abrirCrearUnidad}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #735DFF 0%, #C516E1 100%)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(115,93,255,0.3)' }}
                        >
                            <Plus size={15} /> Nueva unidad
                        </button>
                    </div>
                    <p style={{ margin: '12px 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                        Las unidades definen cómo se mide cada producto (kg, litro, unidad, etc.).
                        Solo las unidades <strong>activas</strong> aparecerán al crear productos o al importarlos desde Excel.
                    </p>
                </div>

                {/* Lista */}
                <div style={{
                    background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
                }}>
                    {loadingUnidades ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                            Cargando unidades...
                        </div>
                    ) : unidadesList.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center' }}>
                            <p style={{ fontSize: 32, margin: '0 0 8px' }}>📏</p>
                            <p style={{ margin: 0, fontSize: 14, color: '#64748b', fontWeight: 600 }}>Sin unidades</p>
                            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>Crea la primera unidad de medida</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                                    <th style={thStyle}>Unidad</th>
                                    <th style={{ ...thStyle, textAlign: 'center', width: 90 }}>Estado</th>
                                    <th style={{ ...thStyle, textAlign: 'center', width: 110 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unidadesList.map((u, idx) => (
                                    <tr
                                        key={u.id_unidad}
                                        style={{
                                            borderBottom: idx < unidadesList.length - 1 ? '1px solid #f8fafc' : 'none',
                                            opacity: u.activo ? 1 : 0.5,
                                            transition: 'opacity 0.2s',
                                        }}
                                    >
                                        <td style={{ padding: '12px 20px' }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{u.nombre}</span>
                                        </td>
                                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => toggleActivoUnidad(u)}
                                                title={u.activo ? 'Desactivar' : 'Activar'}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                                            >
                                                {u.activo
                                                    ? <ToggleRight size={24} style={{ color: '#735DFF' }} />
                                                    : <ToggleLeft  size={24} style={{ color: '#cbd5e1' }} />
                                                }
                                            </button>
                                        </td>
                                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                <button onClick={() => abrirEditarUnidad(u)} title="Editar" style={btnIconStyle('#f1f5f9', '#475569')}>
                                                    <Edit2 size={14} />
                                                </button>
                                                {confirmDeleteUnidad === u.id_unidad ? (
                                                    <>
                                                        <button onClick={() => handleEliminarUnidad(u.id_unidad)} title="Confirmar eliminación" style={btnIconStyle('#fef2f2', '#dc2626')}>
                                                            <Check size={14} />
                                                        </button>
                                                        <button onClick={() => setConfirmDeleteUnidad(null)} title="Cancelar" style={btnIconStyle('#f1f5f9', '#94a3b8')}>
                                                            <X size={14} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => setConfirmDeleteUnidad(u.id_unidad)} title="Eliminar" style={btnIconStyle('#fff', '#cbd5e1')}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Modal crear/editar unidad */}
                {showFormUnidad && (
                    <div
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                        onClick={cerrarFormUnidad}
                    >
                        <div
                            style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                                    {editandoUnidad ? 'Editar unidad' : 'Nueva unidad'}
                                </h3>
                                <button onClick={cerrarFormUnidad} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                    <X size={18} />
                                </button>
                            </div>

                            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                                Nombre
                            </p>
                            <input
                                type="text"
                                value={formUnidad.nombre}
                                onChange={e => setFormUnidad({ nombre: e.target.value })}
                                placeholder="Ej: docena, paquete, pie"
                                maxLength={30}
                                style={{
                                    width: '100%', padding: '10px 14px', fontSize: 14,
                                    border: '1px solid #e2e8f0', borderRadius: 8,
                                    outline: 'none', boxSizing: 'border-box',
                                    fontFamily: 'inherit', color: '#1e293b',
                                    marginBottom: 20,
                                }}
                            />

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button
                                    onClick={cerrarFormUnidad}
                                    style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleGuardarUnidad}
                                    disabled={guardandoUnidad || !formUnidad.nombre.trim()}
                                    style={{
                                        padding: '8px 20px', borderRadius: 8, border: 'none',
                                        background: guardandoUnidad || !formUnidad.nombre.trim() ? '#e2e8f0' : 'linear-gradient(135deg, #735DFF 0%, #C516E1 100%)',
                                        color: guardandoUnidad || !formUnidad.nombre.trim() ? '#94a3b8' : '#fff',
                                        fontSize: 13, fontWeight: 600, cursor: guardandoUnidad ? 'wait' : 'pointer',
                                    }}
                                >
                                    {guardandoUnidad ? 'Guardando...' : editandoUnidad ? 'Guardar cambios' : 'Crear unidad'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>)}
        </div>
    );
}


// ── Estilos helpers ───────────────────────────────────────────────────────────
const thStyle = {
    padding: '10px 20px', fontSize: 11, fontWeight: 700,
    color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5,
    textAlign: 'left',
};

const btnIconStyle = (bg, color) => ({
    background: bg, border: `1px solid ${color === '#94a3b8' ? '#e2e8f0' : 'transparent'}`,
    borderRadius: 6, padding: '5px 7px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', color,
    transition: 'all 0.15s',
});

import { useState, useEffect, useMemo } from 'react';
import { getTalleres, createTaller, updateTaller, deleteTaller, toggleTallerActivo } from '../services/api';
import { useToast } from '../components/Toast';
import {
    Plus, Search, Edit2, X, Trash2, Building2,
    Phone, Mail, MapPin, FileText, Hash,
    ToggleLeft, ToggleRight, Filter, Wrench,
    AlertTriangle, CheckCircle2, XCircle
} from 'lucide-react';

// ─── Paleta por especialidad ───────────────────────────────────────────────
const ESPECIALIDADES = [
    { label: 'Tallado',      color: '#735DFF', bg: 'rgba(115,93,255,0.1)'  },
    { label: 'Monofocal',    color: '#10B981', bg: 'rgba(16,185,129,0.1)'  },
    { label: 'Bifocal',      color: '#3B82F6', bg: 'rgba(59,130,246,0.1)'  },
    { label: 'Progresivo',   color: '#F59E0B', bg: 'rgba(245,158,11,0.1)'  },
    { label: 'Multifocal',   color: '#C516E1', bg: 'rgba(197,22,225,0.1)'  },
    { label: 'Contactología',color: '#FF4B6C', bg: 'rgba(255,75,108,0.1)'  },
    { label: 'General',      color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
];

const getEspecialidadStyle = (esp) => {
    const found = ESPECIALIDADES.find(e => e.label === esp);
    return found || { color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
};

const getIniciales = (nombre = '') =>
    nombre.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

const AVATAR_COLORS = ['#735DFF','#10B981','#3B82F6','#F59E0B','#C516E1','#FF4B6C','#1aa082'];
const getAvatarColor = (nombre = '') => {
    let hash = 0;
    for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

// ─── Form vacío ────────────────────────────────────────────────────────────
const FORM_EMPTY = {
    nombre: '', contacto: '', telefono_alt: '', email: '',
    ruc: '', direccion: '', especialidad: '', notas: '',
};

// ─── Componente principal ──────────────────────────────────────────────────
export default function Talleres() {
    const toast = useToast();
    const [talleres, setTalleres]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const [search, setSearch]       = useState('');
    const [filterEsp, setFilterEsp] = useState('');
    const [filterActivo, setFilterActivo] = useState('todos');
    const [showForm, setShowForm]   = useState(false);
    const [editing, setEditing]     = useState(null);
    const [form, setForm]           = useState(FORM_EMPTY);
    const [deleteTarget, setDeleteTarget] = useState(null); // { id, nombre }
    const [saving, setSaving]       = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = () => {
        setLoading(true);
        getTalleres()
            .then(setTalleres)
            .catch(() => toast('Error al cargar talleres', 'error'))
            .finally(() => setLoading(false));
    };

    // ─── Filtrado ──────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return talleres.filter(t => {
            const matchSearch =
                t.nombre?.toLowerCase().includes(q) ||
                t.contacto?.toLowerCase().includes(q) ||
                t.email?.toLowerCase().includes(q) ||
                t.ruc?.toLowerCase().includes(q) ||
                t.direccion?.toLowerCase().includes(q);
            const matchEsp = !filterEsp || t.especialidad === filterEsp;
            const matchActivo =
                filterActivo === 'todos' ? true :
                filterActivo === 'activos' ? (t.activo !== 0) :
                (t.activo === 0);
            return matchSearch && matchEsp && matchActivo;
        });
    }, [talleres, search, filterEsp, filterActivo]);

    const totalActivos = talleres.filter(t => t.activo !== 0).length;

    // ─── Formulario ────────────────────────────────────────────────────────
    const openCreate = () => { setForm(FORM_EMPTY); setEditing(null); setShowForm(true); };
    const openEdit   = (t)  => { setForm({ ...FORM_EMPTY, ...t }); setEditing(t); setShowForm(true); };

    const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.nombre.trim()) return toast('El nombre es requerido', 'error');
        setSaving(true);
        try {
            if (editing) {
                await updateTaller(editing.id_taller, form);
                toast('Taller actualizado correctamente');
            } else {
                await createTaller(form);
                toast('Taller registrado correctamente');
            }
            setShowForm(false);
            loadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al guardar', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ─── Toggle activo ─────────────────────────────────────────────────────
    const handleToggleActivo = async (t) => {
        const nuevoEstado = t.activo === 0 ? 1 : 0;
        try {
            await toggleTallerActivo(t.id_taller, nuevoEstado);
            setTalleres(prev =>
                prev.map(x => x.id_taller === t.id_taller ? { ...x, activo: nuevoEstado } : x)
            );
            toast(nuevoEstado ? 'Taller activado' : 'Taller desactivado');
        } catch {
            toast('Error al cambiar estado', 'error');
        }
    };

    // ─── Eliminar ──────────────────────────────────────────────────────────
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            const res = await deleteTaller(deleteTarget.id);
            toast(res?.fisico === false ? 'Taller con órdenes: se desactivó en lugar de eliminarse' : 'Taller eliminado');
            setDeleteTarget(null);
            loadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al eliminar', 'error');
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    return (
        <div className="page-enter" style={{ maxWidth: 1200 }}>

            {/* ── Header ── */}
            <div className="page-header" style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 14,
                        background: 'linear-gradient(135deg, #735DFF22, #C516E122)',
                        border: '1.5px solid rgba(115,93,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Wrench size={22} color="#735DFF" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1D1136', margin: 0, letterSpacing: '-0.02em' }}>
                            Talleres / Laboratorios
                        </h1>
                        <p style={{ fontSize: 13, color: '#94a3b8', margin: '3px 0 0' }}>
                            <span style={{ color: '#735DFF', fontWeight: 700 }}>{totalActivos}</span> activos
                            &nbsp;·&nbsp;{talleres.length} registrados
                        </p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={openCreate}>
                    <Plus size={17} /> Nuevo Taller
                </button>
            </div>

            {/* ── Filtros ── */}
            <div className="card mb-4" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="search-bar" style={{ flex: 1, minWidth: 220 }}>
                        <Search size={15} className="search-icon" />
                        <input
                            className="form-input"
                            placeholder="Buscar por nombre, contacto, RUC, email…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ paddingLeft: 40 }}
                        />
                    </div>

                    <select className="form-select" style={{ maxWidth: 180 }}
                        value={filterEsp} onChange={e => setFilterEsp(e.target.value)}>
                        <option value="">Todas las especialidades</option>
                        {ESPECIALIDADES.map(e => <option key={e.label}>{e.label}</option>)}
                    </select>

                    <div style={{ display: 'flex', gap: 6 }}>
                        {['todos','activos','inactivos'].map(opt => (
                            <button key={opt} onClick={() => setFilterActivo(opt)}
                                style={{
                                    padding: '8px 14px', borderRadius: 8, fontSize: 12,
                                    fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
                                    borderColor: filterActivo === opt ? '#735DFF' : '#e2e8f0',
                                    background:  filterActivo === opt ? 'rgba(115,93,255,0.08)' : 'white',
                                    color:       filterActivo === opt ? '#735DFF' : '#64748b',
                                    textTransform: 'capitalize', transition: 'all 0.15s',
                                }}>
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Grid de cards ── */}
            {loading ? (
                <div className="loader"><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
                <div className="empty-state" style={{ padding: 64 }}>
                    <Building2 size={52} style={{ color: '#cbd5e1' }} />
                    <p style={{ color: '#94a3b8', marginTop: 14, fontSize: 15 }}>
                        {search || filterEsp ? 'Sin resultados para tu búsqueda' : 'No hay talleres registrados'}
                    </p>
                    {!search && !filterEsp && (
                        <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={openCreate}>
                            <Plus size={15} /> Agregar primer taller
                        </button>
                    )}
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: 16,
                }}>
                    {filtered.map(t => <TallerCard key={t.id_taller} t={t}
                        onEdit={() => openEdit(t)}
                        onDelete={() => setDeleteTarget({ id: t.id_taller, nombre: t.nombre })}
                        onToggle={() => handleToggleActivo(t)}
                    />)}
                </div>
            )}

            {/* ── Modal Formulario ── */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}
                        style={{ maxWidth: 640, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

                        {/* Header modal */}
                        <div style={{
                            padding: '24px 28px 20px',
                            borderBottom: '1px solid #f1f5f9',
                            background: 'linear-gradient(135deg, #f8f7ff, #fdf4ff)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 38, height: 38, borderRadius: 10,
                                    background: 'linear-gradient(135deg, #735DFF, #C516E1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Wrench size={18} color="white" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1D1136', margin: 0 }}>
                                        {editing ? 'Editar Taller' : 'Nuevo Taller'}
                                    </h2>
                                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                                        {editing ? editing.nombre : 'Completa los datos del laboratorio'}
                                    </p>
                                </div>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>

                            {/* Sección: Identificación */}
                            <SectionLabel icon={<Building2 size={13}/>} label="Identificación" />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">Nombre del taller *</label>
                                    <input className="form-input" required value={form.nombre} onChange={f('nombre')} placeholder="Ej: Laboratorio Óptico Central" />
                                </div>
                                <div>
                                    <label className="form-label">RUC</label>
                                    <input className="form-input" value={form.ruc} onChange={f('ruc')} placeholder="20xxxxxxxxx" maxLength={11} />
                                </div>
                                <div>
                                    <label className="form-label">Especialidad</label>
                                    <select className="form-select" value={form.especialidad} onChange={f('especialidad')}>
                                        <option value="">— Sin especialidad —</option>
                                        {ESPECIALIDADES.map(e => <option key={e.label}>{e.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Sección: Contacto */}
                            <SectionLabel icon={<Phone size={13}/>} label="Contacto" />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                                <div>
                                    <label className="form-label">Teléfono principal</label>
                                    <input className="form-input" value={form.contacto} onChange={f('contacto')} placeholder="9xx xxx xxx" />
                                </div>
                                <div>
                                    <label className="form-label">Teléfono alternativo</label>
                                    <input className="form-input" value={form.telefono_alt} onChange={f('telefono_alt')} placeholder="9xx xxx xxx" />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" value={form.email} onChange={f('email')} placeholder="contacto@taller.com" />
                                </div>
                            </div>

                            {/* Sección: Ubicación */}
                            <SectionLabel icon={<MapPin size={13}/>} label="Ubicación" />
                            <div style={{ marginBottom: 20 }}>
                                <label className="form-label">Dirección</label>
                                <input className="form-input" value={form.direccion} onChange={f('direccion')} placeholder="Jr. Ejemplo 123, Distrito, Ciudad" />
                            </div>

                            {/* Notas */}
                            <div style={{ marginBottom: 24 }}>
                                <label className="form-label">Notas / Referencias</label>
                                <textarea className="form-input" rows={2} value={form.notas} onChange={f('notas')}
                                    placeholder="Horario de atención, indicaciones especiales, etc."
                                    style={{ resize: 'vertical', minHeight: 64 }} />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear taller'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal Confirmar Eliminación ── */}
            {deleteTarget && (
                <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}
                        style={{ maxWidth: 420, textAlign: 'center', padding: '36px 32px' }}>
                        <div style={{
                            width: 60, height: 60, borderRadius: 16, margin: '0 auto 20px',
                            background: 'rgba(255,75,108,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <AlertTriangle size={28} color="#FF4B6C" />
                        </div>
                        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1D1136', marginBottom: 8 }}>
                            ¿Eliminar taller?
                        </h3>
                        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 6 }}>
                            Esta acción es <strong>permanente</strong> y no se puede deshacer.
                        </p>
                        <p style={{
                            fontSize: 14, fontWeight: 700, color: '#1D1136',
                            background: '#f8f7ff', padding: '8px 16px', borderRadius: 8, display: 'inline-block',
                            margin: '0 0 24px',
                        }}>
                            {deleteTarget.nombre}
                        </p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                                Cancelar
                            </button>
                            <button className="btn btn-danger" onClick={confirmDelete}>
                                <Trash2 size={15} /> Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Card de taller ────────────────────────────────────────────────────────
function TallerCard({ t, onEdit, onDelete, onToggle }) {
    const espStyle   = getEspecialidadStyle(t.especialidad);
    const avatarColor = getAvatarColor(t.nombre);
    const inactivo    = t.activo === 0;

    return (
        <div className="card" style={{
            padding: 0, overflow: 'hidden', opacity: inactivo ? 0.65 : 1,
            transition: 'all 0.2s ease', position: 'relative',
            border: inactivo ? '1.5px solid #e2e8f0' : '1.5px solid rgba(115,93,255,0.08)',
        }}>
            {/* Franja superior de color por especialidad */}
            {t.especialidad && (
                <div style={{ height: 3, background: espStyle.color, opacity: 0.7 }} />
            )}

            <div style={{ padding: '18px 20px' }}>
                {/* Avatar + nombre + badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                    <div style={{
                        width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                        background: `linear-gradient(135deg, ${avatarColor}22, ${avatarColor}44)`,
                        border: `2px solid ${avatarColor}33`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 800, color: avatarColor, letterSpacing: '-0.02em',
                    }}>
                        {getIniciales(t.nombre)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <p style={{ fontSize: 15, fontWeight: 700, color: '#1D1136', margin: 0,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.nombre}
                            </p>
                            {inactivo && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px',
                                    borderRadius: 5, background: '#f1f5f9', color: '#94a3b8',
                                    textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Inactivo
                                </span>
                            )}
                        </div>
                        {t.especialidad ? (
                            <span style={{
                                display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 700,
                                padding: '2px 9px', borderRadius: 6,
                                background: espStyle.bg, color: espStyle.color,
                                letterSpacing: '0.03em',
                            }}>
                                {t.especialidad}
                            </span>
                        ) : (
                            <span style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, display: 'block' }}>
                                Sin especialidad
                            </span>
                        )}
                    </div>
                </div>

                {/* Datos de contacto */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {t.contacto && (
                        <InfoRow icon={<Phone size={13}/>} value={
                            t.telefono_alt ? `${t.contacto}  ·  ${t.telefono_alt}` : t.contacto
                        } />
                    )}
                    {t.email    && <InfoRow icon={<Mail size={13}/>}    value={t.email} />}
                    {t.direccion && <InfoRow icon={<MapPin size={13}/>} value={t.direccion} />}
                    {t.ruc      && <InfoRow icon={<Hash size={13}/>}    value={`RUC: ${t.ruc}`} />}
                    {t.notas    && <InfoRow icon={<FileText size={13}/>} value={t.notas} muted />}
                </div>
            </div>

            {/* Footer acciones */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 20px', borderTop: '1px solid #f1f5f9',
                background: '#fafafa',
            }}>
                {/* Toggle activo */}
                <button onClick={onToggle} title={inactivo ? 'Activar' : 'Desactivar'}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600,
                        color: inactivo ? '#94a3b8' : '#10B981',
                        padding: '4px 0',
                    }}>
                    {inactivo
                        ? <><ToggleLeft size={20} /> Inactivo</>
                        : <><ToggleRight size={20} /> Activo</>
                    }
                </button>

                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={onEdit} title="Editar"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
                            background: 'white', border: '1.5px solid #e2e8f0',
                            fontSize: 12, fontWeight: 600, color: '#475569',
                            transition: 'all 0.15s',
                        }}>
                        <Edit2 size={13} /> Editar
                    </button>
                    <button onClick={onDelete} title="Eliminar"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
                            background: 'rgba(255,75,108,0.06)', border: '1.5px solid rgba(255,75,108,0.2)',
                            fontSize: 12, fontWeight: 600, color: '#FF4B6C',
                            transition: 'all 0.15s',
                        }}>
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Auxiliares UI ─────────────────────────────────────────────────────────
function InfoRow({ icon, value, muted }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: '#94a3b8', marginTop: 1, flexShrink: 0 }}>{icon}</span>
            <span style={{
                fontSize: 12.5, color: muted ? '#94a3b8' : '#475569',
                lineHeight: 1.4, wordBreak: 'break-word',
                fontStyle: muted ? 'italic' : 'normal',
            }}>
                {value}
            </span>
        </div>
    );
}

function SectionLabel({ icon, label }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 10.5, fontWeight: 700, color: '#94a3b8',
            textTransform: 'uppercase', letterSpacing: '0.1em',
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '1px solid #f1f5f9',
        }}>
            {icon} {label}
        </div>
    );
}

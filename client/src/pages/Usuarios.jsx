import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Shield, UserX, UserCheck, Lock, Search } from 'lucide-react';
import { getUsuarios, createUsuario, updateUsuario, updatePassword, deleteUsuario } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import logger from '../utils/logger';

export default function PaginaUsuarios() {
    const toast = useToast();
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Modal state
    const [modalAbierto, setModalAbierto] = useState(false);
    const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
    const [modalPassword, setModalPassword] = useState(false);

    // Forms
    const [form, setForm] = useState({ username: '', nombre_completo: '', rol: 'CAJERO', password: '' });
    const [newPassword, setNewPassword] = useState('');
    const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
    const [confirmEliminar, setConfirmEliminar] = useState(null);
    const [busqueda, setBusqueda] = useState('');

    useEffect(() => {
        cargarUsuarios();
    }, []);

    const cargarUsuarios = async () => {
        try {
            setLoading(true);
            const data = await getUsuarios();
            setUsuarios(data.usuarios || []);
        } catch (err) {
            toast(err.response?.data?.error || 'Error al cargar usuarios. Verifica que seas administrador.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAbrirModal = (user = null) => {
        if (user) {
            setUsuarioSeleccionado(user);
            setForm({ username: user.username, nombre_completo: user.nombre_completo, rol: user.rol, password: '' });
        } else {
            setUsuarioSeleccionado(null);
            setForm({ username: '', nombre_completo: '', rol: 'CAJERO', password: '' });
        }
        setModalAbierto(true);
    };

    const handleGuardar = async (e) => {
        e.preventDefault();
        try {
            if (usuarioSeleccionado) {
                // Actualizar
                await updateUsuario(usuarioSeleccionado.id_usuario, {
                    username: form.username,
                    nombre_completo: form.nombre_completo,
                    rol: form.rol
                });
                toast('Usuario actualizado', 'success');
            } else {
                // Crear
                if (!form.password) {
                    toast('La contraseña es obligatoria para nuevos usuarios', 'warning');
                    return;
                }
                await createUsuario(form);
                toast('Usuario creado exitosamente', 'success');
            }
            setModalAbierto(false);
            cargarUsuarios();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al guardar usuario', 'error');
        }
    };

    const handleCambiarEstado = async (id, estadoActual) => {
        const nuevoEstado = estadoActual === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
        try {
            await updateUsuario(id, { estado: nuevoEstado });
            toast(`Usuario ${nuevoEstado.toLowerCase()}`, 'success');
            cargarUsuarios();
        } catch (err) {
            logger.error('USUARIOS', 'Error al cambiar de estado:', err);
            toast('Error al cambiar de estado', 'error');
        }
    };

    const handleEliminar = (u) => {
        setConfirmEliminar(u);
    };

    const confirmarEliminar = async (adminPassword) => {
        try {
            await deleteUsuario(confirmEliminar.id_usuario, adminPassword);
            toast('Usuario eliminado', 'success');
            setConfirmEliminar(null);
            cargarUsuarios();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al eliminar usuario', 'error');
        }
    };

    const handleCambiarPassword = async (e) => {
        e.preventDefault();
        if (!adminPasswordConfirm) {
            toast('Ingresa tu contraseña de administrador', 'warning');
            return;
        }
        if (newPassword.length < 6) {
            toast('La contraseña debe tener al menos 6 caracteres', 'warning');
            return;
        }
        try {
            await updatePassword(usuarioSeleccionado.id_usuario, { password: newPassword, admin_password: adminPasswordConfirm });
            toast('Contraseña actualizada', 'success');
            setModalPassword(false);
            setNewPassword('');
            setAdminPasswordConfirm('');
            setUsuarioSeleccionado(null);
        } catch (err) {
            toast(err.response?.data?.error || 'Error al actualizar contraseña', 'error');
        }
    };

    const rolColores = {
        ADMIN: { bg: '#735DFF', color: '#fff' },
        CAJERO: { bg: '#e0f2fe', color: '#0369a1' },
        ENCARGADO_ALMACEN: { bg: '#fef3c7', color: '#b45309' },
    };

    const usuariosFiltrados = usuarios.filter(u =>
        u.username.toLowerCase().includes(busqueda.toLowerCase()) ||
        u.nombre_completo.toLowerCase().includes(busqueda.toLowerCase())
    );

    if (loading) {
        return <div className="page-enter"><div className="loader"><div className="spinner"></div></div></div>;
    }

    return (
        <div className="page-enter">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Users size={24} style={{ color: '#735DFF' }} />
                        Gestión de Usuarios
                    </h1>
                    <p>
                        Administra accesos, roles y contraseñas del sistema · {usuarios.filter(u => u.estado === 'ACTIVO').length} activos, {usuarios.filter(u => u.estado === 'INACTIVO').length} inactivos
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => handleAbrirModal()}>
                    <Plus size={18} /> Nuevo Usuario
                </button>
            </div>

            <div style={{ position: 'relative', maxWidth: 320, marginBottom: 16 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                    type="text"
                    className="form-input"
                    placeholder="Buscar por usuario o nombre..."
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    style={{ paddingLeft: 36 }}
                />
            </div>

            <div className="card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Usuario</th>
                            <th>Nombre Completo</th>
                            <th>Rol</th>
                            <th>Fecha Registro</th>
                            <th>Estado</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {usuariosFiltrados.map(u => (
                            <tr key={u.id_usuario} style={{ opacity: u.estado === 'INACTIVO' ? 0.6 : 1 }}>
                                <td style={{ fontWeight: 600, color: '#1D1136' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                            background: '#ede9fe', color: '#735DFF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: 13,
                                        }}>
                                            {(u.nombre_completo || u.username).charAt(0).toUpperCase()}
                                        </div>
                                        @{u.username}
                                    </div>
                                </td>
                                <td>{u.nombre_completo}</td>
                                <td>
                                    <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: rolColores[u.rol]?.bg || '#f1f5f9', color: rolColores[u.rol]?.color || '#334155' }}>
                                        <Shield size={12} /> {u.rol}
                                    </span>
                                </td>
                                <td style={{ fontSize: '0.8rem' }}>{new Date(u.fecha_creacion).toLocaleDateString('es-PE')}</td>
                                <td>
                                    <button 
                                        className={`badge ${u.estado === 'ACTIVO' ? 'badge-success' : 'badge-danger'}`}
                                        onClick={() => handleCambiarEstado(u.id_usuario, u.estado)}
                                        style={{ border: 'none', cursor: 'pointer' }}
                                        title={u.estado === 'ACTIVO' ? 'Click para desactivar' : 'Click para activar'}
                                    >
                                        {u.estado}
                                    </button>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <button 
                                        className="btn btn-secondary btn-sm" 
                                        style={{ marginRight: 8 }}
                                        onClick={() => {
                                            setUsuarioSeleccionado(u);
                                            setModalPassword(true);
                                        }}
                                        title="Cambiar contraseña"
                                    >
                                        <Lock size={14} /> Clave
                                    </button>
                                    <button 
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleAbrirModal(u)}
                                    >
                                        <Edit2 size={14} /> Editar
                                    </button>
                                    {u.username.toLowerCase() !== 'admin' && (
                                        <button
                                            className="btn btn-danger btn-sm"
                                            style={{ marginLeft: 8 }}
                                            onClick={() => handleEliminar(u)}
                                            title="Eliminar usuario"
                                        >
                                            <UserX size={14} /> Eliminar
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal Crear/Editar */}
            {modalAbierto && (
                <div className="modal-overlay" onClick={() => setModalAbierto(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h2>{usuarioSeleccionado ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
                            <button onClick={() => setModalAbierto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>✕</button>
                        </div>
                        <form onSubmit={handleGuardar}>
                            <div style={{ marginBottom: 16 }}>
                                <label className="form-label">Nombre de usuario (Login)</label>
                                <input 
                                    type="text" 
                                    className="form-input" 
                                    value={form.username}
                                    onChange={e => setForm({...form, username: e.target.value})}
                                    required 
                                />
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label className="form-label">Nombre Completo</label>
                                <input 
                                    type="text" 
                                    className="form-input" 
                                    value={form.nombre_completo}
                                    onChange={e => setForm({...form, nombre_completo: e.target.value})}
                                    required 
                                />
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label className="form-label">Rol del Sistema</label>
                                <select 
                                    className="form-select"
                                    value={form.rol}
                                    onChange={e => setForm({...form, rol: e.target.value})}
                                >
                                    <option value="CAJERO">CAJERO (Ventas y Caja)</option>
                                    <option value="ENCARGADO_ALMACEN">ENCARGADO DE ALMACÉN (Productos e Inventario)</option>
                                    <option value="ADMIN">ADMINISTRADOR (Acceso total)</option>
                                </select>
                            </div>
                            {!usuarioSeleccionado && (
                                <div style={{ marginBottom: 20 }}>
                                    <label className="form-label">Contraseña inicial</label>
                                    <input 
                                        type="password" 
                                        className="form-input" 
                                        value={form.password}
                                        onChange={e => setForm({...form, password: e.target.value})}
                                        required 
                                        minLength={6}
                                    />
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>Mínimo 6 caracteres.</p>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setModalAbierto(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Cambiar Password */}
            {modalPassword && usuarioSeleccionado && (
                <div className="modal-overlay" onClick={() => { setModalPassword(false); setAdminPasswordConfirm(''); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h2>Nueva Contraseña</h2>
                            <button onClick={() => { setModalPassword(false); setAdminPasswordConfirm(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>✕</button>
                        </div>
                        <p style={{ marginBottom: 16, fontSize: '0.9rem', color: '#64748b' }}>
                            Actualizando contraseña para el usuario <strong>@{usuarioSeleccionado.username}</strong>
                        </p>
                        <form onSubmit={handleCambiarPassword}>
                            <div style={{ marginBottom: 16 }}>
                                <label className="form-label">Tu contraseña (admin)</label>
                                <input 
                                    type="password" 
                                    className="form-input" 
                                    placeholder="Confirma tu contraseña..."
                                    value={adminPasswordConfirm}
                                    onChange={e => setAdminPasswordConfirm(e.target.value)}
                                    required 
                                    autoFocus
                                />
                            </div>
                            <div style={{ marginBottom: 20 }}>
                                <label className="form-label">Nueva contraseña del usuario</label>
                                <input 
                                    type="password" 
                                    className="form-input" 
                                    placeholder="Nueva contraseña..."
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    required 
                                    minLength={6}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                <button type="button" className="btn btn-secondary" onClick={() => { setModalPassword(false); setAdminPasswordConfirm(''); }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Actualizar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmModal
                open={!!confirmEliminar}
                title="Eliminar usuario"
                message={confirmEliminar ? `¿Eliminar al usuario @${confirmEliminar.username}? Esta acción no se puede deshacer.` : ''}
                confirmLabel="Eliminar"
                requirePassword
                onConfirm={confirmarEliminar}
                onCancel={() => setConfirmEliminar(null)}
            />
        </div>
    );
}

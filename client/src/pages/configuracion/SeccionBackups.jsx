import { useState } from 'react';
import {
    Shield, DatabaseBackup, RotateCcw, Clock, CheckCircle,
    AlertCircle, Lock, Eye, EyeOff, AlertTriangle,
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/Toast';
import { verificarPasswordBackup, restaurarBackup } from '../../services/api';

// ── Helpers locales ──────────────────────────────────────────────────────────
const formatFecha = (isoStr) => {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
};

const formatAntiguedad = (isoStr) => {
    if (!isoStr) return '';
    const horas = (Date.now() - new Date(isoStr).getTime()) / (1000 * 60 * 60);
    if (horas < 1)  return 'hace menos de 1 hora';
    if (horas < 24) return `hace ${Math.floor(horas)}h`;
    const dias = Math.floor(horas / 24);
    return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
};

const estadoBackup = (fechaIso) => {
    if (!fechaIso) return { nivel: 'sin-datos', icono: null, color: '#94a3b8' };
    const diff = (Date.now() - new Date(fechaIso).getTime()) / (1000 * 60 * 60);
    if (diff < 24)  return { nivel: 'ok',          icono: 'ok',    color: '#10B981' };
    if (diff < 168) return { nivel: 'advertencia', icono: 'warn',  color: '#F59E0B' };
    return               { nivel: 'critico',       icono: 'error', color: '#FF4B6C' };
};

export default function SeccionBackups({
    backups,
    loadingBackups,
    generandoBackup,
    ultimoGenerado,
    handleBackupManual,
}) {
    const toast = useToast();

    // ── Estado del flujo de restauración ────────────────────────────────────
    const [pasoRestore, setPasoRestore]               = useState(0);
    const [passwordRestore, setPasswordRestore]       = useState('');
    const [showPassword, setShowPassword]             = useState(false);
    const [verificandoPass, setVerificandoPass]       = useState(false);
    const [restoreToken, setRestoreToken]             = useState(null);
    const [backupsDisponibles, setBackupsDisponibles] = useState({ diarios: [], manuales: [] });
    const [tabBackup, setTabBackup]                   = useState('diarios');
    const [visiblesBackup, setVisiblesBackup]         = useState(3);
    const [backupSeleccionado, setBackupSeleccionado] = useState(null);
    const [confirmTexto, setConfirmTexto]             = useState('');
    const [restaurando, setRestaurando]               = useState(false);

    // ── Handlers del flujo restore ───────────────────────────────────────────
    const abrirRestore = () => {
        setPasoRestore(1);
        setPasswordRestore('');
        setShowPassword(false);
        setRestoreToken(null);
        setBackupSeleccionado(null);
        setConfirmTexto('');
        setVisiblesBackup(3);
    };

    const cerrarRestore = () => {
        setPasoRestore(0);
        setPasswordRestore('');
        setShowPassword(false);
        setRestoreToken(null);
        setBackupSeleccionado(null);
        setConfirmTexto('');
    };

    const handleVerificarPassword = async () => {
        if (!passwordRestore) return;
        setVerificandoPass(true);
        try {
            const data = await verificarPasswordBackup(passwordRestore);
            if (data.ok) {
                setRestoreToken(data.restoreToken);
                setBackupsDisponibles({
                    diarios:  (data.diarios  || []).slice(0, 15),
                    manuales: (data.manuales || []).slice(0, 3),
                });
                setTabBackup('diarios');
                setPasoRestore(2);
            } else {
                toast(data.error || 'Contraseña incorrecta', 'error');
            }
        } catch (e) {
            toast(e?.response?.data?.error || 'Contraseña incorrecta', 'error');
        } finally {
            setVerificandoPass(false);
        }
    };

    const seleccionarBackup = (b) => {
        setBackupSeleccionado(b);
        setConfirmTexto('');
        setPasoRestore(3);
    };

    const handleRestaurar = async () => {
        if (!backupSeleccionado || confirmTexto !== 'RESTAURAR' || !restoreToken) return;
        setRestaurando(true);
        try {
            const data = await restaurarBackup({
                archivo:      backupSeleccionado.archivo,
                tipo:         backupSeleccionado.tipo,
                confirmacion: confirmTexto,
                restoreToken,
            });
            if (data.ok) {
                toast('Base de datos restaurada. El sistema se reiniciará...', 'success');
                setTimeout(() => window.location.reload(), 3000);
            } else {
                toast('Error al restaurar: ' + (data.error || ''), 'error');
            }
        } catch (e) {
            toast(e?.response?.data?.error || 'Error al restaurar', 'error');
        } finally {
            setRestaurando(false);
            cerrarRestore();
        }
    };

    return (
        <>
            {/* Card principal — Copias de seguridad */}
            <div className="card mb-6">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div style={{ background: 'linear-gradient(135deg, #735DFF 0%, #C516E1 100%)', borderRadius: 10, padding: '7px 9px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(115,93,255,0.25)' }}>
                            <Shield size={17} color="white" />
                        </div>
                        <h2 className="text-lg font-bold">Copias de seguridad</h2>
                    </div>
                    <div className="flex gap-2">
                        <button
                            className="btn btn-secondary"
                            onClick={abrirRestore}
                            style={{ fontSize: 12, padding: '6px 12px' }}
                        >
                            <RotateCcw size={13} /> Restaurar
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleBackupManual}
                            disabled={generandoBackup}
                            style={{ fontSize: 13, padding: '6px 14px' }}
                        >
                            <DatabaseBackup size={14} />
                            {generandoBackup ? 'Generando...' : 'Generar copia ahora'}
                        </button>
                    </div>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                    El sistema guarda copias automáticas cada 30 min y una diaria por los últimos 30 días.
                    Use <strong>"Generar copia ahora"</strong> antes de hacer cambios importantes.
                </p>

                {loadingBackups ? (
                    <p className="text-sm text-slate-400">Cargando...</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>

                        {/* Último backup diario */}
                        {(() => {
                            const estado = estadoBackup(backups.ultimoDiario?.fecha_archivo);
                            return (
                                <div style={{ background: '#F8F7FF', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Clock size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                        <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Último backup diario</p>
                                    </div>
                                    {backups.ultimoDiario ? (
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-semibold text-slate-700" style={{ marginBottom: 3 }}>{formatFecha(backups.ultimoDiario.fecha_archivo)}</p>
                                                <p className="text-xs text-slate-400">
                                                    {formatAntiguedad(backups.ultimoDiario.fecha_archivo)} · {backups.ultimoDiario.tamano_kb} KB
                                                </p>
                                            </div>
                                            {estado.icono === 'ok'    && <CheckCircle size={18} style={{ color: estado.color, flexShrink: 0 }} />}
                                            {estado.icono === 'warn'  && <Clock       size={18} style={{ color: estado.color, flexShrink: 0 }} />}
                                            {estado.icono === 'error' && <AlertCircle size={18} style={{ color: estado.color, flexShrink: 0 }} />}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-400">Sin backups aún</p>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Último backup manual */}
                        {(() => {
                            const estado = estadoBackup(backups.ultimoManual?.fecha_archivo);
                            return (
                                <div style={{ background: '#F8F7FF', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <DatabaseBackup size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                        <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Último backup manual</p>
                                    </div>
                                    {backups.ultimoManual ? (
                                        <>
                                            <div className="flex items-start justify-between gap-2" style={{ marginBottom: 10 }}>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-700" style={{ marginBottom: 3 }}>{formatFecha(backups.ultimoManual.fecha_archivo)}</p>
                                                    <p className="text-xs text-slate-400">
                                                        {formatAntiguedad(backups.ultimoManual.fecha_archivo)} · {backups.ultimoManual.tamano_kb} KB
                                                    </p>
                                                </div>
                                                {estado.icono === 'ok'    && <CheckCircle size={18} style={{ color: estado.color, flexShrink: 0 }} />}
                                                {estado.icono === 'warn'  && <Clock       size={18} style={{ color: estado.color, flexShrink: 0 }} />}
                                                {estado.icono === 'error' && <AlertCircle size={18} style={{ color: estado.color, flexShrink: 0 }} />}
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const archivo = ultimoGenerado || backups.ultimoManual.archivo;
                                                        const resp = await api.get(`/backups/descargar?archivo=${encodeURIComponent(archivo)}&tipo=manual`, { responseType: 'blob' });
                                                        const url = URL.createObjectURL(resp.data);
                                                        const a   = document.createElement('a');
                                                        a.href     = url;
                                                        a.download = archivo;
                                                        a.click();
                                                        URL.revokeObjectURL(url);
                                                    } catch {
                                                        toast('Error al descargar el backup', 'error');
                                                    }
                                                }}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#735DFF', background: 'rgba(115,93,255,0.08)', borderRadius: 6, padding: '4px 10px', border: 'none', cursor: 'pointer' }}
                                            >
                                                <DatabaseBackup size={12} /> Descargar para USB
                                            </button>
                                        </>
                                    ) : (
                                        <p className="text-sm text-slate-400">Sin copias manuales aún</p>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* Modal — Flujo de restauración (3 pasos) */}
            {pasoRestore > 0 && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Restaurar copia de seguridad"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                >
                    {/* Paso 1 — Contraseña */}
                    {pasoRestore === 1 && (
                        <div className="card" style={{ width: 460, maxWidth: '92vw', padding: 32 }}>
                            <div className="flex items-center gap-3 mb-6">
                                <div style={{ background: 'rgba(245,158,11,0.12)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Lock size={20} style={{ color: '#F59E0B' }} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1D1136' }}>Restaurar copia de seguridad</h3>
                                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>Paso 1 de 3 — Verificación</p>
                                </div>
                            </div>
                            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#b45309', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertTriangle size={14} /> Acción sensible
                                </p>
                                <p style={{ fontSize: 13, color: '#d97706', margin: 0, lineHeight: 1.6 }}>
                                    Restaurar reemplaza <strong>todos los datos actuales</strong> con los del backup elegido.
                                    Solo el administrador puede realizar esta acción.
                                </p>
                            </div>
                            <label className="form-label" style={{ marginBottom: 8 }}>Contraseña de administrador</label>
                            <div style={{ position: 'relative', marginBottom: 24 }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="Ingrese su contraseña para continuar"
                                    value={passwordRestore}
                                    onChange={e => setPasswordRestore(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleVerificarPassword()}
                                    autoFocus
                                    style={{ paddingRight: 40 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button className="btn btn-secondary" onClick={cerrarRestore} disabled={verificandoPass}>Cancelar</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleVerificarPassword}
                                    disabled={verificandoPass || !passwordRestore}
                                >
                                    {verificandoPass ? 'Verificando...' : 'Continuar →'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Paso 2 — Elegir backup */}
                    {pasoRestore === 2 && (
                        <div className="card" style={{ width: 580, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <RotateCcw size={18} className="text-indigo-500" />
                                    <h3 className="text-lg font-bold">Elegir punto de restauración</h3>
                                </div>
                                <button
                                    onClick={cerrarRestore}
                                    aria-label="Cerrar"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8', lineHeight: 1 }}
                                >✕</button>
                            </div>
                            <p className="text-sm text-slate-500 mb-4">
                                Seleccione un punto de restauración — mostrando los 3 más recientes:
                            </p>
                            <div className="flex gap-1 mb-3" style={{ borderBottom: '2px solid #e2e8f0' }}>
                                {['diarios', 'manuales'].map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => { setTabBackup(tab); setVisiblesBackup(3); }}
                                        style={{
                                            padding: '6px 14px', borderRadius: '6px 6px 0 0', fontSize: 12,
                                            fontWeight: tabBackup === tab ? 700 : 400,
                                            background: tabBackup === tab ? '#735DFF' : 'transparent',
                                            color: tabBackup === tab ? 'white' : '#64748b',
                                            border: 'none', cursor: 'pointer', marginBottom: -2,
                                        }}
                                    >
                                        {{ diarios: 'Diarios (30 días)', manuales: 'Manuales' }[tab]}
                                    </button>
                                ))}
                            </div>
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {(backupsDisponibles[tabBackup] || []).length === 0 ? (
                                    <p className="text-center text-slate-400 py-8 text-sm">No hay copias en esta categoría</p>
                                ) : (() => {
                                    const todos     = backupsDisponibles[tabBackup] || [];
                                    const visibles  = todos.slice(0, visiblesBackup);
                                    const restantes = todos.length - visibles.length;
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {visibles.map(b => (
                                                <div
                                                    key={b.archivo}
                                                    onClick={() => seleccionarBackup(b)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                                                        background: '#F8F7FF', border: '1px solid #e2e8f0',
                                                        transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#735DFF'; e.currentTarget.style.background = 'rgba(115,93,255,0.04)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#F8F7FF'; }}
                                                >
                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-700">{formatFecha(b.fecha_archivo)}</p>
                                                        <p className="text-xs text-slate-400">{formatAntiguedad(b.fecha_archivo)} · {b.tamano_kb} KB</p>
                                                    </div>
                                                    <span style={{ fontSize: 11, color: '#735DFF', fontWeight: 600 }}>Seleccionar →</span>
                                                </div>
                                            ))}
                                            {restantes > 0 && (
                                                <button
                                                    onClick={() => setVisiblesBackup(v => v + 5)}
                                                    style={{
                                                        background: 'none', border: '1px dashed #e2e8f0',
                                                        borderRadius: 10, padding: '10px 16px', cursor: 'pointer',
                                                        fontSize: 12, color: '#735DFF', fontWeight: 600, transition: 'border-color 0.15s',
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.borderColor = '#735DFF'}
                                                    onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                                >
                                                    Ver más ({restantes} restante{restantes !== 1 ? 's' : ''})
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                            <div className="flex justify-start mt-3">
                                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setPasoRestore(1)}>← Volver</button>
                            </div>
                        </div>
                    )}

                    {/* Paso 3 — Confirmación */}
                    {pasoRestore === 3 && backupSeleccionado && (
                        <div className="card" style={{ width: 480, maxWidth: '92vw' }}>
                            <div className="flex items-center gap-2 mb-3">
                                <AlertTriangle size={20} className="text-red-500" />
                                <h3 className="text-lg font-bold text-red-700">Confirmar restauración</h3>
                            </div>
                            <p className="text-sm text-slate-600 mb-1">Se restaurará desde:</p>
                            <p className="text-xs font-mono font-bold mb-3 p-2 rounded" style={{ background: 'rgba(115,93,255,0.08)', color: '#735DFF', wordBreak: 'break-all' }}>
                                {backupSeleccionado.archivo}
                            </p>
                            <p className="text-sm text-slate-600 mb-1">Fecha del backup:</p>
                            <p className="text-sm font-semibold text-slate-700 mb-3">{formatFecha(backupSeleccionado.fecha_archivo)}</p>
                            <div className="p-3 rounded-lg mb-4" style={{ background: 'rgba(255,75,108,0.06)', border: '1px solid rgba(255,75,108,0.25)' }}>
                                <p className="text-sm font-semibold text-red-700 mb-1">Esta acción no se puede deshacer</p>
                                <p className="text-sm text-red-600">
                                    Todos los datos posteriores a esa fecha se perderán. El sistema guardará
                                    una copia del estado actual antes de proceder.
                                </p>
                            </div>
                            <p className="text-sm text-slate-600 mb-1">
                                Escriba <strong className="text-red-600 font-mono">RESTAURAR</strong> para confirmar:
                            </p>
                            <input
                                type="text"
                                className="form-input mb-4"
                                placeholder="RESTAURAR"
                                value={confirmTexto}
                                onChange={e => setConfirmTexto(e.target.value)}
                                style={{ fontFamily: 'monospace', letterSpacing: 2 }}
                                autoFocus
                            />
                            <div className="flex gap-3 justify-between">
                                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setPasoRestore(2)} disabled={restaurando}>
                                    ← Volver
                                </button>
                                <div className="flex gap-2">
                                    <button className="btn btn-secondary" onClick={cerrarRestore} disabled={restaurando}>Cancelar</button>
                                    <button
                                        className={`btn ${confirmTexto === 'RESTAURAR' ? 'btn-danger' : 'btn-secondary'}`}
                                        style={{ cursor: confirmTexto === 'RESTAURAR' ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
                                        onClick={handleRestaurar}
                                        disabled={restaurando || confirmTexto !== 'RESTAURAR'}
                                    >
                                        <RotateCcw size={14} />
                                        {restaurando ? 'Restaurando...' : 'Confirmar restauración'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
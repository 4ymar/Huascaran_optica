import { useState, useEffect } from 'react';
import {
    AlertTriangle, FlaskConical, Trash2,
    Eye, EyeOff, Loader2,
} from 'lucide-react';
import { useToast } from '../../components/Toast';
import { resetDB, cargarDemo, verificarPasswordBackup, getEstadisticas } from '../../services/api';

// ── Tokens de color reutilizados entre tarjetas y modales ────────────────────
const COLOR_DANGER = '#FF4B6C';
const COLOR_TEXT_DARK = '#1D1136';
const COLOR_TEXT_MUTED = '#94a3b8';

export default function ZonaPeligro() {
    const toast = useToast();

    // ── Estado local ─────────────────────────────────────────────────────────
    const [mostrarDemo, setMostrarDemo]           = useState(null);
    const [procesando, setProcesando]             = useState(false);

    // Modal demo
    const [modalDemo, setModalDemo]               = useState(false);
    const [confirmDemo, setConfirmDemo]           = useState(false);

    // Modal reset — paso 1: contraseña
    const [modalReset, setModalReset]             = useState(false);
    const [passwordReset, setPasswordReset]       = useState('');
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [verificandoReset, setVerificandoReset] = useState(false);
    const [resetAutorizado, setResetAutorizado]   = useState(false);
    const [confirmText, setConfirmText]           = useState('');
    const [errorPasswordReset, setErrorPasswordReset] = useState('');

    // ── Detectar si hay datos reales ─────────────────────────────────────────
    useEffect(() => {
        getEstadisticas()
            .then(data => {
                const tieneProductos = (data?.total_productos ?? 0) > 0;
                const tieneVentas    = (data?.total_ventas    ?? 0) > 0;
                setMostrarDemo(!tieneProductos && !tieneVentas);
            })
            .catch(() => setMostrarDemo(false));
    }, []);

    // ── Handler: verificar contraseña reset ──────────────────────────────────
    const handleVerificarPasswordReset = async () => {
        setVerificandoReset(true);
        setErrorPasswordReset('');
        try {
            const data = await verificarPasswordBackup(passwordReset);
            if (data.ok) {
                setResetAutorizado(true);
            } else {
                setErrorPasswordReset('Contraseña incorrecta');
                toast('Contraseña incorrecta', 'error');
            }
        } catch {
            setErrorPasswordReset('Error al verificar contraseña');
            toast('Error al verificar contraseña', 'error');
        } finally {
            setVerificandoReset(false);
        }
    };

    const cerrarModalReset = () => {
        setModalReset(false);
        setPasswordReset('');
        setConfirmText('');
        setResetAutorizado(false);
        setShowPasswordReset(false);
        setErrorPasswordReset('');
    };

    // ── Handler: restablecer DB ──────────────────────────────────────────────
    const handleReset = async () => {
        if (confirmText !== 'RESTABLECER') return;
        setProcesando(true);
        try {
            const data = await resetDB();
            if (data.ok) {
                toast('Base de datos restablecida. Recargando...', 'success');
                setTimeout(() => window.location.reload(), 1500);
            } else {
                toast('Error al restablecer: ' + (data.error || 'desconocido'), 'error');
            }
        } catch {
            toast('Error al restablecer', 'error');
        } finally {
            setProcesando(false);
            cerrarModalReset();
        }
    };

    // ── Handler: cargar demo ─────────────────────────────────────────────────
    const handleDemo = async () => {
        setProcesando(true);
        try {
            const data = await cargarDemo();
            if (data.ok) {
                toast(`Datos cargados: ${data.productos} productos, ${data.ventas} ventas. Recargando...`, 'success');
                setTimeout(() => window.location.reload(), 1800);
            } else {
                toast('Error al cargar demo: ' + (data.error || 'desconocido'), 'error');
            }
        } catch {
            toast('Error al cargar demo', 'error');
        } finally {
            setProcesando(false);
            setModalDemo(false);
            setConfirmDemo(false);
        }
    };

    return (
        <>
            {/* Card — Zona de peligro */}
            <div className="card mb-6" style={{ borderLeft: `4px solid ${COLOR_DANGER}`, borderRadius: '0 16px 16px 0' }}>
                <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={20} className="text-red-500" />
                    <h2 className="text-lg font-bold text-red-700">Zona de peligro</h2>
                </div>
                <p className="text-sm text-slate-500 mb-5">
                    Estas acciones modifican permanentemente los datos del sistema.
                    Se recomienda generar una copia de seguridad antes de continuar.
                </p>

                <div className={`grid gap-4 grid-cols-1 ${mostrarDemo === true ? 'md:grid-cols-2' : 'max-w-md'} items-stretch`}>

                    {/* Cargar demo — solo si no hay datos reales */}
                    {mostrarDemo === true && (
                        <div
                            className="p-5 rounded-xl flex flex-col h-full"
                            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.3)' }}
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div
                                    className="flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'rgba(16,185,129,0.12)', borderRadius: 10, width: 34, height: 34 }}
                                >
                                    <FlaskConical size={17} className="text-green-600" />
                                </div>
                                <span className="font-semibold text-green-800">Cargar datos de demostración</span>
                            </div>

                            <div className="flex-1">
                                <p className="text-sm text-green-700 mb-1">
                                    Carga productos, clientes y ventas de ejemplo para explorar el sistema.
                                </p>
                                <p className="text-xs text-green-600">
                                    Esta opción solo está disponible mientras el sistema no tenga datos reales.
                                </p>
                            </div>

                            <button
                                className="btn btn-secondary w-full mt-4"
                                style={{ borderColor: 'rgba(16,185,129,0.4)', color: '#047857' }}
                                onClick={() => setModalDemo(true)}
                                disabled={procesando}
                            >
                                <FlaskConical size={14} />
                                Cargar datos demo
                            </button>
                        </div>
                    )}

                    {/* Restablecer — siempre visible */}
                    <div
                        className="p-5 rounded-xl flex flex-col h-full"
                        style={{ background: 'rgba(255,75,108,0.05)', border: '1px solid rgba(255,75,108,0.25)' }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div
                                className="flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(255,75,108,0.12)', borderRadius: 10, width: 34, height: 34 }}
                            >
                                <Trash2 size={17} className="text-red-600" />
                            </div>
                            <span className="font-semibold text-red-800">Restablecer base de datos</span>
                        </div>

                        <div className="flex-1">
                            <p className="text-sm text-red-700">
                                Elimina todos los productos, ventas, compras y clientes.
                                La configuración de la empresa se conserva.
                            </p>
                        </div>

                        <button
                            className="btn btn-danger w-full mt-4"
                            onClick={() => { setModalReset(true); setConfirmText(''); setPasswordReset(''); setResetAutorizado(false); }}
                            disabled={procesando}
                        >
                            <Trash2 size={14} />
                            Restablecer datos
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal — Cargar datos de demostración */}
            {modalDemo && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Cargar datos de demostración"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(29,17,54,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                >
                    <div className="card" style={{ width: 460, maxWidth: '90vw', padding: 32 }}>

                        {/* Cabecera — mismo patrón que el modal de reset */}
                        <div className="flex items-center gap-3 mb-6">
                            <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FlaskConical size={20} className="text-green-600" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLOR_TEXT_DARK }}>Cargar datos de demostración</h3>
                                <p style={{ margin: '2px 0 0', fontSize: 12, color: COLOR_TEXT_MUTED }}>
                                    Reemplaza los datos actuales por datos de ejemplo
                                </p>
                            </div>
                        </div>

                        {/* Aviso — mismo tratamiento visual que el aviso de reset */}
                        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#B45309', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertTriangle size={14} /> Acción irreversible
                            </p>
                            <p style={{ fontSize: 13, color: '#92400e', margin: 0, lineHeight: 1.6 }}>
                                Los datos actuales serán reemplazados por productos, clientes y ventas de ejemplo. Esta acción no se puede deshacer.
                            </p>
                        </div>

                        <label htmlFor="confirm-demo-checkbox" className="flex items-center gap-2 mb-6 cursor-pointer select-none">
                            <input
                                id="confirm-demo-checkbox"
                                type="checkbox"
                                checked={confirmDemo}
                                onChange={e => setConfirmDemo(e.target.checked)}
                                className="w-4 h-4 accent-green-600"
                            />
                            <span className="text-sm text-slate-700">Entiendo que los datos actuales serán reemplazados</span>
                        </label>

                        <div className="flex gap-3 justify-end">
                            <button
                                className="btn btn-secondary"
                                onClick={() => { setModalDemo(false); setConfirmDemo(false); }}
                                disabled={procesando}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-success"
                                onClick={handleDemo}
                                disabled={procesando || !confirmDemo}
                            >
                                {procesando ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        Cargando...
                                    </>
                                ) : 'Confirmar y cargar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal — Restablecer base de datos (2 pasos) */}
            {modalReset && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Restablecer base de datos"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(29,17,54,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                >
                    <div className="card" style={{ width: 460, maxWidth: '90vw', padding: 32 }}>

                        {/* Cabecera */}
                        <div className="flex items-center gap-3 mb-6">
                            <div style={{ background: 'rgba(255,75,108,0.1)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Trash2 size={20} style={{ color: COLOR_DANGER }} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLOR_TEXT_DARK }}>Restablecer base de datos</h3>
                                <p style={{ margin: '2px 0 0', fontSize: 12, color: COLOR_TEXT_MUTED }}>
                                    {resetAutorizado ? 'Paso 2 de 2 — Confirmación' : 'Paso 1 de 2 — Verificación'}
                                </p>
                            </div>
                        </div>

                        {/* Aviso siempre visible */}
                        <div style={{ background: 'rgba(255,75,108,0.06)', border: '1px solid rgba(255,75,108,0.25)', borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: COLOR_DANGER, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertTriangle size={14} /> Acción irreversible
                            </p>
                            <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 6px', lineHeight: 1.6 }}>
                                Se eliminarán permanentemente <strong>todos los productos, ventas, compras, clientes y movimientos</strong>.
                            </p>
                            <p style={{ fontSize: 12, color: COLOR_TEXT_MUTED, margin: 0 }}>
                                ✓ La configuración de la empresa (nombre, RUC, series) se conservará intacta.
                            </p>
                        </div>

                        {/* Paso 1 — Contraseña */}
                        {!resetAutorizado && (
                            <>
                                <label htmlFor="reset-password-input" className="form-label" style={{ marginBottom: 8 }}>
                                    Contraseña de administrador
                                </label>
                                <div style={{ position: 'relative', marginBottom: errorPasswordReset ? 8 : 24 }}>
                                    <input
                                        id="reset-password-input"
                                        type={showPasswordReset ? 'text' : 'password'}
                                        className="form-input"
                                        placeholder="Ingrese su contraseña para continuar"
                                        value={passwordReset}
                                        onChange={e => { setPasswordReset(e.target.value); setErrorPasswordReset(''); }}
                                        onKeyDown={e => e.key === 'Enter' && passwordReset && handleVerificarPasswordReset()}
                                        autoFocus
                                        disabled={verificandoReset}
                                        aria-invalid={!!errorPasswordReset}
                                        aria-describedby={errorPasswordReset ? 'reset-password-error' : undefined}
                                        style={{ paddingRight: 40, borderColor: errorPasswordReset ? COLOR_DANGER : undefined }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswordReset(v => !v)}
                                        disabled={verificandoReset}
                                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: COLOR_TEXT_MUTED, display: 'flex' }}
                                        aria-label={showPasswordReset ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    >
                                        {showPasswordReset ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {errorPasswordReset && (
                                    <p id="reset-password-error" style={{ fontSize: 12, color: COLOR_DANGER, margin: '0 0 16px' }}>
                                        {errorPasswordReset}
                                    </p>
                                )}
                                <div className="flex gap-3 justify-end">
                                    <button className="btn btn-secondary" onClick={cerrarModalReset} disabled={verificandoReset}>
                                        Cancelar
                                    </button>
                                    <button
                                        className="btn btn-danger"
                                        onClick={handleVerificarPasswordReset}
                                        disabled={verificandoReset || !passwordReset}
                                    >
                                        {verificandoReset ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" />
                                                Verificando...
                                            </>
                                        ) : 'Continuar →'}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Paso 2 — Confirmación escrita */}
                        {resetAutorizado && (
                            <>
                                <div style={{ marginBottom: 24 }}>
                                    <label htmlFor="reset-confirm-input" className="form-label" style={{ color: COLOR_DANGER, marginBottom: 8 }}>
                                        Escriba <strong>RESTABLECER</strong> para confirmar:
                                    </label>
                                    <input
                                        id="reset-confirm-input"
                                        className="form-input"
                                        style={{ borderColor: confirmText === 'RESTABLECER' ? '#10B981' : undefined }}
                                        value={confirmText}
                                        onChange={e => setConfirmText(e.target.value)}
                                        placeholder="RESTABLECER"
                                        autoFocus
                                        disabled={procesando}
                                    />
                                </div>
                                <div className="flex gap-3 justify-end">
                                    <button className="btn btn-secondary" onClick={cerrarModalReset} disabled={procesando}>
                                        Cancelar
                                    </button>
                                    <button
                                        className={`btn ${confirmText === 'RESTABLECER' ? 'btn-danger' : 'btn-secondary'}`}
                                        style={{ cursor: confirmText === 'RESTABLECER' ? 'pointer' : 'not-allowed' }}
                                        onClick={handleReset}
                                        disabled={procesando || confirmText !== 'RESTABLECER'}
                                    >
                                        {procesando ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" />
                                                Restableciendo...
                                            </>
                                        ) : (
                                            <>
                                                {confirmText === 'RESTABLECER' && <Trash2 size={14} />}
                                                Restablecer todo
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

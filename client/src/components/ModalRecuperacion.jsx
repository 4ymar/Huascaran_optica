import { useState, useEffect } from 'react';
import { X, ShieldCheck, KeyRound, User, Copy, Check } from 'lucide-react';
import { getMachineIdRecuperacion, verificarCodigoRecuperacion, resetearPasswordRecuperacion } from '../services/api';
import s from '../pages/Login.module.css'; // ajustar ruta si Login.module.css no vive en pages/

export default function ModalRecuperacion({ onCerrar }) {
    const [paso, setPaso] = useState(0); // 0: código | 1: elegir usuario | 2: resultado
    const [machineId, setMachineId] = useState('');
    const [codigo, setCodigo] = useState('');
    const [usuarios, setUsuarios] = useState([]);
    const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
    const [resultado, setResultado] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [copiado, setCopiado] = useState(false);

    useEffect(() => {
        getMachineIdRecuperacion()
            .then(data => setMachineId(data.machineId || ''))
            .catch(() => setMachineId('No se pudo obtener'));
    }, []);

    const handleVerificar = async () => {
        if (!codigo.trim()) {
            setError('Ingrese el código de recuperación.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const data = await verificarCodigoRecuperacion(codigo.trim());
            if (data.ok) {
                setUsuarios(data.usuarios || []);
                setPaso(1);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo verificar el código.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetear = async () => {
        if (!usuarioSeleccionado) {
            setError('Seleccione un usuario.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const data = await resetearPasswordRecuperacion(codigo.trim(), usuarioSeleccionado.id_usuario);
            if (data.ok) {
                setResultado(data);
                setPaso(2);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo restablecer la contraseña.');
        } finally {
            setLoading(false);
        }
    };

    const copiarPassword = () => {
        if (!resultado?.password_temporal) return;
        navigator.clipboard.writeText(resultado.password_temporal).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        });
    };

    return (
        <div className={s.modalOverlay} onClick={onCerrar}>
            <div className={s.modalCard} onClick={e => e.stopPropagation()}>
                <button className={s.modalClose} onClick={onCerrar} aria-label="Cerrar">
                    <X size={18}/>
                </button>

                <div className={s.formHead}>
                    <p className={s.formEyebrow}>Recuperación de acceso</p>
                    <h2 className={s.formTitle} style={{ fontSize: '1.6rem' }}>
                        {paso === 0 && 'Código de autorización'}
                        {paso === 1 && 'Elegir usuario'}
                        {paso === 2 && 'Contraseña temporal'}
                    </h2>
                </div>

                {/* ── Paso 0: código ── */}
                {paso === 0 && (
                    <>
                        <div className={s.field} style={{ marginBottom: 16 }}>
                            <label className={s.fieldLabel}>Código de su equipo (envíelo al proveedor)</label>
                            <div className={s.fieldWrap}>
                                <ShieldCheck className={s.fieldIcon} size={15}/>
                                <input className={s.fieldInput} value={machineId} readOnly
                                    style={{ fontFamily: 'monospace', letterSpacing: 1 }}/>
                            </div>
                        </div>

                        <div className={s.field} style={{ marginBottom: 16 }}>
                            <label className={s.fieldLabel}>Código de recuperación</label>
                            <div className={s.fieldWrap}>
                                <KeyRound className={s.fieldIcon} size={15}/>
                                <input className={s.fieldInput}
                                    placeholder="Pegue aquí el código que le envió el proveedor"
                                    value={codigo}
                                    onChange={e => setCodigo(e.target.value)}
                                    disabled={loading}/>
                            </div>
                        </div>

                        {error && <div className={s.modalError}>{error}</div>}

                        <button className={s.btnSubmit} onClick={handleVerificar} disabled={loading}>
                            {loading ? <><div className={s.spinnerRing}/> Verificando...</> : 'Verificar código'}
                        </button>
                    </>
                )}

                {/* ── Paso 1: elegir usuario ── */}
                {paso === 1 && (
                    <>
                        <div className={s.userList}>
                            {usuarios.map(u => (
                                <div key={u.id_usuario}
                                    className={`${s.userCard} ${usuarioSeleccionado?.id_usuario === u.id_usuario ? s.userCardSelected : ''}`}
                                    onClick={() => setUsuarioSeleccionado(u)}>
                                    <User size={16}/>
                                    <div>
                                        <div className={s.userCardName}>{u.nombre_completo}</div>
                                        <div className={s.userCardMeta}>{u.username} · {u.rol}{u.estado !== 'ACTIVO' ? ' · INACTIVO' : ''}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {error && <div className={s.modalError}>{error}</div>}

                        <button className={s.btnSubmit} onClick={handleResetear} disabled={loading || !usuarioSeleccionado}>
                            {loading ? <><div className={s.spinnerRing}/> Restableciendo...</> : 'Restablecer contraseña'}
                        </button>
                    </>
                )}

                {/* ── Paso 2: resultado ── */}
                {paso === 2 && resultado && (
                    <>
                        <p className={s.formSub} style={{ marginBottom: 14 }}>
                            Contraseña temporal para <strong>{resultado.username}</strong>. Cámbiela después de iniciar sesión.
                        </p>
                        <div className={s.passwordBox}>
                            <span className={s.passwordValue}>{resultado.password_temporal}</span>
                            <button className={s.copyBtn} onClick={copiarPassword} type="button">
                                {copiado ? <Check size={16}/> : <Copy size={16}/>}
                            </button>
                        </div>
                        <button className={s.btnSubmit} onClick={onCerrar} style={{ marginTop: 18 }}>
                            Cerrar
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
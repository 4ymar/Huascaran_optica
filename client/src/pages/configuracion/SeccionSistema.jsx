import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Settings, FileText, DatabaseBackup, CheckCircle, AlertTriangle, Clock, Copy } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { getDiagnostico, getEstadoActualizacion, exportarSoporte } from '../../services/api';

export default function SeccionSistema() {
    const toast = useToast();

    // ── Estado diagnóstico ───────────────────────────────────────────────────
    const [diagReport, setDiagReport]           = useState(null);
    const [loadingDiag, setLoadingDiag]         = useState(false);
    const [exportandoSoporte, setExportandoSoporte] = useState(false);

    // ── Estado updater ───────────────────────────────────────────────────────
    const [updaterStatus, setUpdaterStatus]     = useState(null);
    const [updaterInfo, setUpdaterInfo]         = useState(null);
    const [downloadPercent, setDownloadPercent] = useState(0);
    const [updaterError, setUpdaterError]       = useState('');

    // ── Carga de diagnóstico ─────────────────────────────────────────────────
    const cargarDiagnostico = useCallback(() => {
        setLoadingDiag(true);
        getDiagnostico()
            .then(data => setDiagReport(data))
            .catch(() => toast('Error al obtener reporte de diagnóstico', 'error'))
            .finally(() => setLoadingDiag(false));
    }, [toast]);

    useEffect(() => { cargarDiagnostico(); }, [cargarDiagnostico]);

    // ── Listener del updater ─────────────────────────────────────────────────
    useEffect(() => {
        if (!window.electronAPI?.updater) return;
        const unsubscribe = window.electronAPI.updater.onStatus((status) => {
            if (!status.state) return;
            setUpdaterStatus(status.state);
            if (status.state === 'available')   setUpdaterInfo(status.info);
            if (status.state === 'downloaded')  setUpdaterInfo(status.info);
            if (status.state === 'downloading') setDownloadPercent(Math.round(status.progress?.percent || 0));
            if (status.state === 'error')       setUpdaterError(status.error || 'Error desconocido');
        });
        return () => unsubscribe();
    }, []);

    // ── Handlers updater ─────────────────────────────────────────────────────
    const buscarActualizaciones = async () => {
        if (!window.electronAPI?.updater) {
            toast('La función de actualización solo está disponible en la aplicación de escritorio', 'warning');
            return;
        }
        setUpdaterStatus('checking');
        try {
            const resp = await window.electronAPI.updater.checkForced();
            if (!resp.ok) {
                setUpdaterStatus('error');
                setUpdaterError(resp.error || 'Error al buscar actualizaciones');
                toast('Error al buscar actualizaciones', 'error');
            } else if (resp.result !== null) {
                toast('Búsqueda de actualizaciones iniciada', 'success');
            }
        } catch (err) {
            setUpdaterStatus('error');
            setUpdaterError(err.message);
            toast('Error al buscar actualizaciones: ' + err.message, 'error');
        }
    };

    const descargarActualizacion = async () => {
        try {
            await window.electronAPI.updater.download();
            toast('Descarga de actualización iniciada', 'success');
        } catch (err) {
            setUpdaterStatus('error');
            setUpdaterError(err.message);
            toast('Error al descargar: ' + err.message, 'error');
        }
    };

    const instalarActualizacion = async () => {
        try {
            const estado = await getEstadoActualizacion();
            if (!estado.puede_actualizar) {
                const detalle = (estado.bloqueos || []).join(' ');
                toast(
                    detalle || 'No se puede reiniciar porque hay operaciones críticas en curso.',
                    'warning'
                );
                cargarDiagnostico();
                return;
            }

            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const resp = await window.electronAPI.updater.install({ token });
            if (!resp?.ok) {
                const detalle = resp?.bloqueos?.length ? resp.bloqueos.join(' ') : resp?.error;
                toast(detalle || 'No se pudo instalar la actualización', 'warning');
                setUpdaterStatus('error');
                setUpdaterError(detalle || 'Instalación bloqueada por seguridad');
            }
        } catch (err) {
            setUpdaterStatus('error');
            setUpdaterError(err.message);
            toast('Error al instalar: ' + err.message, 'error');
        }
    };

    // ── Handler soporte ──────────────────────────────────────────────────────
    const handleExportarSoporte = async () => {
        setExportandoSoporte(true);
        try {
            const res = await exportarSoporte();
            if (res.ok && res.tempZipPath) {
                if (window.electronAPI?.saveSupportZip) {
                    const saveRes = await window.electronAPI.saveSupportZip({ tempZipPath: res.tempZipPath });
                    if (saveRes.ok)          toast('Paquete de soporte guardado correctamente', 'success');
                    else if (saveRes.canceled) toast('Guardado cancelado por el usuario', 'info');
                    else                     toast('Error al guardar paquete de soporte: ' + saveRes.error, 'error');
                } else {
                    toast('Función no disponible en navegador', 'warning');
                }
            } else {
                toast('Error al generar paquete de soporte', 'error');
            }
        } catch (err) {
            toast('Error exportando soporte: ' + err.message, 'error');
        } finally {
            setExportandoSoporte(false);
        }
    };

    const copiarAlPortapapeles = (texto) => {
        if (!texto) return;
        navigator.clipboard.writeText(texto)
            .then(() => toast('Copiado al portapapeles', 'success'))
            .catch(() => toast('Error al copiar', 'error'));
    };

    return (
        <>
            {/* Card — Actualización de Software (solo en Electron) */}
            {window.electronAPI?.isElectron && (
                <div className="card mb-6">
                    <div className="flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12, marginBottom: 16 }}>
                        <div className="flex items-center gap-2">
                            <RotateCcw size={20} className="text-purple-500" />
                            <h2 className="text-lg font-bold text-slate-800">Actualización de Software</h2>
                        </div>
                        <span className="badge badge-info">
                            v{diagReport?.app_version || '—'} | Esquema BD: v{diagReport?.schema_version ?? '—'}
                        </span>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">
                        Busca e instala las últimas actualizaciones del sistema directamente desde GitHub Releases.
                    </p>
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <button
                                className="btn btn-primary"
                                onClick={buscarActualizaciones}
                                disabled={updaterStatus === 'checking' || updaterStatus === 'downloading'}
                            >
                                <RotateCcw size={16} />
                                {updaterStatus === 'checking' ? 'Buscando...' : 'Buscar actualizaciones'}
                            </button>
                            {updaterStatus === 'available' && (
                                <button className="btn btn-success" onClick={descargarActualizacion}>
                                    Descargar actualización
                                </button>
                            )}
                            {updaterStatus === 'downloaded' && (
                                <button className="btn btn-success" onClick={instalarActualizacion}>
                                    Instalar y Reiniciar
                                </button>
                            )}
                        </div>
                        {updaterStatus && (
                            <div className="p-3 rounded-lg" style={{ background: '#F8F7FF', border: '1px solid #e2e8f0' }}>
                                <p className="text-sm font-semibold text-slate-700">
                                    {updaterStatus === 'checking'       && 'Buscando nuevas versiones en el servidor...'}
                                    {updaterStatus === 'not-available'  && 'Tu sistema se encuentra actualizado en la última versión.'}
                                    {updaterStatus === 'available'      && `¡Nueva versión disponible: v${updaterInfo?.version}!`}
                                    {updaterStatus === 'downloading'    && `Descargando actualización: ${downloadPercent}%`}
                                    {updaterStatus === 'downloaded'     && 'Descarga completada. El sistema está listo para instalar.'}
                                    {updaterStatus === 'error'          && `Error al actualizar: ${updaterError}`}
                                </p>
                                {updaterStatus === 'downloading' && (
                                    <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                                        <div style={{ width: `${downloadPercent}%`, height: '100%', background: '#735DFF', borderRadius: 3, transition: 'width 0.2s' }} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Card — Panel de Diagnóstico */}
            <div className="card mb-6">
                <div className="flex items-center justify-between mb-4" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                    <div className="flex items-center gap-2">
                        <Settings size={20} className="text-purple-500" />
                        <h2 className="text-lg font-bold text-slate-800">Panel de Diagnóstico del Sistema</h2>
                    </div>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={cargarDiagnostico}
                        disabled={loadingDiag}
                    >
                        <RotateCcw size={12} /> Refrescar
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="form-label">Ruta de Base de Datos</label>
                        <div className="flex gap-2 items-center">
                            <input
                                className="form-input"
                                readOnly
                                value={diagReport?.db_path || 'Cargando...'}
                                style={{ fontFamily: 'monospace', fontSize: 11, background: '#F8F7FF' }}
                            />
                            <button
                                className="btn btn-secondary"
                                style={{ padding: 10 }}
                                onClick={() => copiarAlPortapapeles(diagReport?.db_path)}
                                title="Copiar ruta"
                            >
                                <Copy size={14} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="form-label">Ruta de Log de Errores</label>
                        <div className="flex gap-2 items-center">
                            <input
                                className="form-input"
                                readOnly
                                value={diagReport?.log_path || 'Cargando...'}
                                style={{ fontFamily: 'monospace', fontSize: 11, background: '#F8F7FF' }}
                            />
                            <button
                                className="btn btn-secondary"
                                style={{ padding: 10 }}
                                onClick={() => copiarAlPortapapeles(diagReport?.log_path)}
                                title="Copiar ruta"
                            >
                                <Copy size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 mb-6">
                    <button
                        className="btn btn-secondary"
                        onClick={() => {
                            if (!window.electronAPI?.openExternal) {
                                toast('Función solo disponible en la aplicación de escritorio', 'warning');
                                return;
                            }
                            if (diagReport?.log_path) {
                                window.electronAPI.openExternal('file://' + diagReport.log_path);
                            } else {
                                toast('Ruta de log no disponible', 'warning');
                            }
                        }}
                    >
                        <FileText size={16} /> Ver log en vivo
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleExportarSoporte}
                        disabled={exportandoSoporte}
                    >
                        <DatabaseBackup size={16} />
                        {exportandoSoporte ? 'Exportando...' : 'Exportar paquete de soporte'}
                    </button>
                </div>

                {/* Estado de integridad */}
                <div className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Estado de la Base de Datos</h3>
                    {loadingDiag ? (
                        <p className="text-sm text-slate-400">Verificando integridad...</p>
                    ) : diagReport?.db_integridad === 'ok' ? (
                        <div className="p-3 rounded-lg flex items-center gap-2" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46' }}>
                            <CheckCircle size={18} />
                            <span className="text-sm font-medium">Base de datos íntegra e intacta.</span>
                        </div>
                    ) : (
                        <div className="p-3 rounded-lg flex flex-col gap-2" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={18} />
                                <span className="text-sm font-bold">Error de Integridad detectado!</span>
                            </div>
                            <p className="text-xs font-semibold">
                                Detalle: {diagReport?.db_integridad || 'Fallo desconocido'}.
                            </p>
                            <div className="mt-1 p-2 rounded bg-white text-red-700 text-xs font-bold border border-red-200" style={{ borderLeft: '4px solid #FF4B6C' }}>
                                Instrucción: Exporta un paquete de soporte y contacta al proveedor.
                            </div>
                        </div>
                    )}
                </div>

                {!loadingDiag && diagReport?.ultima_migracion && (
                    <div className="p-3 rounded-lg flex items-center gap-2 mb-4" style={{ background: '#F8F7FF', border: '1px solid #e2e8f0', color: '#334155' }}>
                        <DatabaseBackup size={18} />
                        <span className="text-sm font-medium">
                            Esquema BD v{diagReport.schema_version} · {diagReport.migraciones_total} migración(es) aplicadas · Última: {diagReport.ultima_migracion.nombre}
                        </span>
                    </div>
                )}

                {!loadingDiag && diagReport?.bloqueos_actualizacion?.length > 0 && (
                    <div className="p-3 rounded-lg flex flex-col gap-1 mt-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={18} />
                            <span className="text-sm font-bold">Reinicio protegido temporalmente</span>
                        </div>
                        {diagReport.bloqueos_actualizacion.map((bloqueo, idx) => (
                            <p className="text-xs" key={`${bloqueo}-${idx}`}>{bloqueo}</p>
                        ))}
                    </div>
                )}

                {/* Alerta CPE pendientes */}
                {!loadingDiag && diagReport?.cpe_pendientes > 0 && (
                    <div className="p-3 rounded-lg flex flex-col gap-1 mt-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                        <div className="flex items-center gap-2">
                            <Clock size={18} />
                            <span className="text-sm font-bold">¡Alerta de Facturación CPE!</span>
                        </div>
                        <p className="text-xs">
                            Se detectaron {diagReport.cpe_pendientes} comprobante(s) en estado "ENVIANDO" por más de 10 minutos.
                            Esto puede indicar problemas de conexión o con el proveedor CPE.
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
